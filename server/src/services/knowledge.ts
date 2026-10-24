import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { KnowledgeDoc, KnowledgeHit, MemoryItem } from '@shared/types'
import { asAgent, schema as s, type Tx } from '../db/client'
import { audit } from '../lib/audit'
import { newId } from '../lib/crypto'
import { chunk, embedder } from '../lib/embeddings'
import { badRequest, notFound } from '../lib/errors'
import { AgentStorage } from '../lib/storage'
import { queue } from '../queue'
import { safeGet } from '../runtime/site'
import { recordUsage } from './usage'

/**
 * Knowledge of ONE agent: files in its storage prefix, chunks and vectors in its RLS-protected
 * tables. Search is a pgvector cosine query run in the agent's context: it cannot return another
 * agent's content, even if a filter were forgotten.
 */

const toDoc = (d: typeof s.knowledgeDocs.$inferSelect): KnowledgeDoc => ({
  id: d.id,
  agentId: d.agentId,
  name: d.name,
  kind: d.kind,
  size: d.size,
  status: d.status,
  chunks: d.chunks,
  error: d.error,
  hasFile: !!d.storageKey,
  createdAt: d.createdAt,
})

export async function listDocs(tx: Tx, agentId: string) {
  return (await tx.select().from(s.knowledgeDocs).where(eq(s.knowledgeDocs.agentId, agentId)).orderBy(asc(s.knowledgeDocs.createdAt))).map(toDoc)
}

const MAX_FILE = 5 * 1024 * 1024

/** Adds a source. Files go to agents/<agentId>/knowledge/…; indexing runs in the background. */
export async function addDoc(
  tx: Tx,
  agentId: string,
  input: { name: string; kind: KnowledgeDoc['kind']; content?: string; fileBase64?: string },
  actor: string,
) {
  const id = newId('kb')
  let storageKey: string | null = null
  let size = '…'
  if (input.fileBase64) {
    const buf = Buffer.from(input.fileBase64, 'base64')
    if (buf.length > MAX_FILE) throw badRequest('Fichier trop volumineux (5 Mo au plus)')
    storageKey = `knowledge/${id}/${input.name.replace(/[^\w.-]+/g, '_').slice(0, 80)}`
    await new AgentStorage(agentId).put(storageKey, buf)
    size = `${Math.max(1, Math.round(buf.length / 1024))} Ko`
  }
  const [d] = await tx
    .insert(s.knowledgeDocs)
    .values({ id, agentId, name: input.name, kind: input.kind, size, status: 'indexing', storageKey })
    .returning()
  await audit(tx, agentId, { actor, actorType: 'user', action: 'a ajouté une source', target: input.name })
  return toDoc(d)
}

/**
 * Queues the indexing of a document. Call it AFTER the transaction that created the document has
 * committed: a worker picking the job earlier would not see the row yet.
 * Text pasted inline travels with the job, never through another agent's space.
 */
export function enqueueIndex(agentId: string, docId: string, content: string | null) {
  return queue.add('knowledge.index', 'index', { agentId, docId, content }, { jobId: `agent:${agentId}:kb:${docId}` })
}

const stripHtml = (html: string) =>
  html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Background job: extract → chunk → embed → store vectors, all in the agent's own context. */
export async function indexDoc(agentId: string, docId: string, inline: string | null) {
  const doc = await asAgent(agentId, async (tx) => (await tx.select().from(s.knowledgeDocs).where(eq(s.knowledgeDocs.id, docId)))[0])
  // Not visible (yet): fail the job so the queue retries it instead of completing silently.
  if (!doc) throw new Error(`knowledge doc ${docId} not found`)
  try {
    let text = inline ?? ''
    if (doc.kind === 'website') {
      const res = await safeGet(doc.name, 10_000)
      if (res.status >= 400) throw new Error(`HTTP ${res.status}`)
      text = stripHtml(res.body)
    } else if (!text && doc.storageKey) {
      if (doc.kind === 'pdf' || doc.kind === 'docx') throw new Error('Extraction PDF/Word non disponible : importez du texte ou du Markdown')
      text = (await new AgentStorage(agentId).get(doc.storageKey)).toString('utf8')
    }
    const parts = chunk(text).slice(0, 2000)
    if (!parts.length) throw new Error('Aucun texte exploitable')
    const vectors = await embedder.embed(parts)
    await asAgent(agentId, async (tx) => {
      await tx.delete(s.knowledgeChunks).where(eq(s.knowledgeChunks.docId, docId))
      for (let i = 0; i < parts.length; i += 100)
        await tx.insert(s.knowledgeChunks).values(parts.slice(i, i + 100).map((content, k) => ({ agentId, docId, idx: i + k, content, embedding: vectors[i + k] })))
      await tx
        .update(s.knowledgeDocs)
        .set({ status: 'indexed', chunks: parts.length, error: null, size: doc.size === '…' ? `${Math.max(1, Math.round(text.length / 1024))} Ko` : doc.size })
        .where(eq(s.knowledgeDocs.id, docId))
      await recordUsage(tx, agentId, { source: 'embedding', model: `embeddings:${embedder.name}`, tokensIn: Math.ceil(text.length / 4), tokensOut: 0, cost: 0, refId: docId })
    })
  } catch (e) {
    await asAgent(agentId, (tx) => tx.update(s.knowledgeDocs).set({ status: 'failed', error: (e as Error).message.slice(0, 300) }).where(eq(s.knowledgeDocs.id, docId)))
  }
}

export async function removeDoc(tx: Tx, agentId: string, docId: string, actor: string) {
  const [d] = await tx.delete(s.knowledgeDocs).where(and(eq(s.knowledgeDocs.id, docId), eq(s.knowledgeDocs.agentId, agentId))).returning()
  if (!d) throw notFound('Source')
  await audit(tx, agentId, { actor, actorType: 'user', action: 'a retiré une source', target: d.name })
  return d.storageKey
}

/** Vector search in ONE agent's index (explicit filter + RLS). */
export async function search(tx: Tx, agentId: string, query: string, k = 4): Promise<KnowledgeHit[]> {
  const [vec] = await embedder.embed([query])
  const literal = `[${vec.join(',')}]`
  const rows = await tx
    .select({
      docId: s.knowledgeChunks.docId,
      docName: s.knowledgeDocs.name,
      chunk: s.knowledgeChunks.content,
      score: sql<number>`1 - (${s.knowledgeChunks.embedding} <=> ${literal}::vector)`,
    })
    .from(s.knowledgeChunks)
    .innerJoin(s.knowledgeDocs, eq(s.knowledgeDocs.id, s.knowledgeChunks.docId))
    .where(eq(s.knowledgeChunks.agentId, agentId))
    .orderBy(sql`${s.knowledgeChunks.embedding} <=> ${literal}::vector`)
    .limit(k)
  return rows.filter((r) => r.score > 0.05).map((r) => ({ ...r, score: Math.round(r.score * 1000) / 1000 }))
}

/* ---------- Memory: short term (per session) and long term (facts) ---------- */

export async function listMemories(tx: Tx, agentId: string, kind?: 'short' | 'long'): Promise<MemoryItem[]> {
  return tx
    .select()
    .from(s.memories)
    .where(and(eq(s.memories.agentId, agentId), kind ? eq(s.memories.kind, kind) : undefined))
    .orderBy(desc(s.memories.createdAt))
    .limit(200)
}

export async function addMemory(tx: Tx, agentId: string, kind: 'short' | 'long', text: string, sessionId?: string | null) {
  const [m] = await tx.insert(s.memories).values({ id: newId('mem'), agentId, kind, text: text.slice(0, 2000), sessionId: sessionId ?? null }).returning()
  return m
}

export async function recentTurns(tx: Tx, agentId: string, sessionId: string, turns: number) {
  const rows = await tx
    .select()
    .from(s.memories)
    .where(and(eq(s.memories.agentId, agentId), eq(s.memories.kind, 'short'), eq(s.memories.sessionId, sessionId)))
    .orderBy(desc(s.memories.createdAt))
    .limit(turns * 2)
  return rows.reverse()
}

export async function forget(tx: Tx, agentId: string, ids: string[] | 'all', actor: string) {
  const where = ids === 'all' ? eq(s.memories.agentId, agentId) : and(eq(s.memories.agentId, agentId), inArray(s.memories.id, ids))
  const rows = await tx.delete(s.memories).where(where).returning({ id: s.memories.id })
  await audit(tx, agentId, { actor, actorType: 'user', action: ids === 'all' ? 'a effacé la mémoire' : 'a oublié un souvenir', target: `${rows.length} élément(s)` })
  return rows.length
}
