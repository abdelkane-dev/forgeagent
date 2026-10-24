import { createHash } from 'node:crypto'
import { EMBEDDING_DIM } from '../db/schema'

/**
 * Embeddings for the per-agent vector index. The default provider is local feature hashing
 * (word unigrams + bigrams, signed hashing, L2-normalised): deterministic, offline, no data
 * leaves the server. Swap the provider here (same dimension) to use a hosted embedding model.
 */
export interface Embedder {
  readonly name: string
  embed(texts: string[]): Promise<number[][]>
}

const tokens = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .match(/[a-z0-9]{2,}/g) ?? []

function hashVector(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0)
  const words = tokens(text)
  const feats = [...words, ...words.slice(1).map((w, i) => `${words[i]}_${w}`)]
  for (const f of feats) {
    const h = createHash('md5').update(f).digest()
    const idx = h.readUInt16LE(0) % EMBEDDING_DIM
    v[idx] += h[2] & 1 ? 1 : -1
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
  return v.map((x) => x / norm)
}

export const embedder: Embedder = {
  name: 'hash',
  embed: async (texts) => texts.map(hashVector),
}

/** Splits text into ~800-character chunks on sentence boundaries. */
export function chunk(text: string, size = 800): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  const parts = clean.split(/(?<=[.!?])\s+/)
  const out: string[] = []
  let cur = ''
  for (const p of parts) {
    if ((cur + ' ' + p).length > size && cur) {
      out.push(cur.trim())
      cur = ''
    }
    cur += ' ' + p
    while (cur.length > size * 1.5) {
      out.push(cur.slice(0, size).trim())
      cur = cur.slice(size)
    }
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}
