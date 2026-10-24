import { eq, sql } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AGENT_TABLES } from '../src/db/schema'
import { asAgent, db, scoped, schema as s } from '../src/db/client'
import { decryptFor, encryptFor, signCapability } from '../src/lib/crypto'
import { resetRateLimits } from '../src/lib/rate-limit'
import { AgentStorage } from '../src/lib/storage'
import { capabilitiesFor } from '../src/team/capabilities'
import { setupDb } from './helpers'
import { app, bearer, call, login, newKey } from './http'

/**
 * Strict isolation between agents. Théo is a viewer of agt_7x1pd only; agt_8f3k2 is a stranger to
 * him. Every check below must hold on every endpoint and down to the database itself.
 */

const A = 'agt_7x1pd' // Théo's agent
const B = 'agt_8f3k2' // not Théo's
let theo = ''
let abdoul = ''
let ines = ''
let keyA = ''

const rows = <T,>(r: unknown) => ((r as { rows?: T[] }).rows ?? (r as T[])) as T[]

beforeAll(async () => {
  await setupDb()
  theo = await login('theo@bonaco.pro')
  abdoul = await login('abdoul@bonaco.pro')
  ines = await login('ines@bonaco.pro')
  keyA = await newKey(abdoul, A, 'live')
})
beforeEach(() => resetRateLimits())

describe('API : un utilisateur ne voit que ses agents', () => {
  it('liste et tableau de bord limités aux agents dont il est membre', async () => {
    const list = await (await call(theo, 'GET', '/v1/agents')).json()
    expect(list.map((a: { id: string }) => a.id)).toEqual([A])
    expect(list[0].myRole).toBe('viewer')
    const ov = await (await call(theo, 'GET', '/v1/overview')).json()
    expect(ov.agents).toBe(1)
    const approvals = await (await call(theo, 'GET', '/v1/approvals')).json()
    expect(approvals.every((x: { agentId: string }) => x.agentId === A)).toBe(true)
  })

  it('chaque route /agents/{agentId}/… répond 404 sur un agent étranger (session et clé)', async () => {
    const doc = await (await app.request('/v1/openapi.json')).json()
    const agentPaths = Object.entries(doc.paths as Record<string, Record<string, unknown>>).filter(([p]) => p.includes('{agentId}'))
    expect(agentPaths.length).toBeGreaterThan(40)
    let checked = 0
    for (const [p, methods] of agentPaths) {
      const path = p.replace('{agentId}', B).replace(/\{(\w+)\}/g, 'x_1')
      for (const method of Object.keys(methods)) {
        const body = method === 'get' || method === 'delete' ? undefined : {}
        const r = await call(theo, method.toUpperCase(), path, body)
        expect([path, method, r.status]).toEqual([path, method, 404])
        // The secret key of agent A cannot reach agent B either.
        const k = await bearer(keyA, method.toUpperCase(), path, body)
        expect([path, method, k.status]).toEqual([path, method, k.status === 401 ? 401 : 404])
        checked++
      }
    }
    expect(checked).toBeGreaterThan(50)
  })

  it('les identifiants enfants d’un autre agent sont introuvables via son propre agent (IDOR)', async () => {
    // Abdoul owns both A and B: an id of B used under A must still fail.
    expect((await call(abdoul, 'GET', `/v1/agents/${A}/traces/tr_4021`)).status).toBe(404)
    expect((await call(abdoul, 'POST', `/v1/agents/${A}/approvals/apr_1/approve`)).status).toBe(404)
    expect((await call(abdoul, 'DELETE', `/v1/agents/${A}/webhooks/wh_1`)).status).toBe(404)
    expect(await (await call(abdoul, 'GET', `/v1/agents/${A}/evals/ev_1/cases`)).json()).toEqual([])
    expect((await call(abdoul, 'POST', `/v1/agents/${A}/workflows/wf_1/run`, { input: 'x' })).status).toBe(404)
    expect((await call(abdoul, 'DELETE', `/v1/agents/${A}/knowledge/kb_3`)).status).toBe(404)
    expect((await call(abdoul, 'POST', `/v1/agents/${A}/integrations/int_1/check`)).status).toBe(404)
  })

  it('un lecteur ne peut pas écrire, même sur son agent', async () => {
    expect((await call(theo, 'PATCH', `/v1/agents/${A}`, { tone: 'Direct' })).status).toBe(403)
    expect((await call(theo, 'POST', `/v1/agents/${A}/keys`, { name: 'x1', environment: 'live' })).status).toBe(403)
    expect((await call(theo, 'POST', `/v1/agents/${A}/run`, { input: 'Bonjour' })).status).toBe(403)
    expect((await call(theo, 'POST', `/v1/agents/${A}/run`, { input: 'Bonjour', environment: 'test' })).status).toBe(200)
  })
})

describe('données scellées par agent', () => {
  it('la recherche vectorielle ne renvoie que les connaissances de l’agent', async () => {
    const hits = await (await call(abdoul, 'GET', `/v1/agents/${A}/knowledge/search?q=${encodeURIComponent('ajouter un rôle éditeur, erreur 5xx et redémarrage du service')}`)).json()
    expect(hits.length).toBeGreaterThan(0)
    const docs = await asAgent(A, (tx) => tx.select({ id: s.knowledgeDocs.id }).from(s.knowledgeDocs))
    const own = new Set(docs.map((d) => d.id))
    expect(hits.every((h: { docId: string }) => own.has(h.docId))).toBe(true)
    // Even an unfiltered vector query in A's context only reaches A's chunks.
    const all = await asAgent(A, (tx) => tx.select({ agentId: s.knowledgeChunks.agentId }).from(s.knowledgeChunks))
    expect(all.length).toBeGreaterThan(0)
    expect(all.every((c) => c.agentId === A)).toBe(true)
  })

  it('coûts, journaux, workflows et audit ne sortent pas de l’agent', async () => {
    for (const table of [s.usageCosts, s.logs, s.workflows, s.auditLog, s.runs, s.memories, s.apiKeys, s.agentSecrets] as const) {
      const r = await asAgent(A, (tx) => tx.select({ agentId: table.agentId }).from(table))
      expect(r.every((x) => x.agentId === A)).toBe(true)
    }
    const usage = await (await call(theo, 'GET', `/v1/agents/${A}/usage`)).json()
    expect(usage.agentId).toBe(A)
  })

  it('les secrets sont chiffrés avec une clé propre à chaque agent', () => {
    const sealed = encryptFor(B, 'jeton-de-B')
    expect(decryptFor(B, sealed)).toBe('jeton-de-B')
    expect(() => decryptFor(A, sealed)).toThrow()
  })

  it('le stockage de fichiers refuse de sortir du préfixe de l’agent', () => {
    const st = new AgentStorage(A)
    expect(() => st.put('../agt_8f3k2/vol.txt', Buffer.from('x'), 'text/plain')).toThrow()
    expect(() => st.get('/agents/agt_8f3k2/x')).toThrow()
    expect(st.prefix).toBe(`agents/${A}/`)
  })
})

describe('équipe interne : une tâche ne quitte pas son agent', () => {
  it('le jeton de capacité est lié à un agent et expire', async () => {
    const tokB = signCapability({ agentId: B, taskId: 'tsk_x', role: 'tester', exp: Date.now() + 60_000 })
    await expect(capabilitiesFor('tester', A, 'req_x', tokB).runChecks()).rejects.toThrow(/wrong agent/)
    const expired = signCapability({ agentId: A, taskId: 'tsk_x', role: 'tester', exp: Date.now() - 1 })
    await expect(capabilitiesFor('tester', A, 'req_x', expired).runChecks()).rejects.toThrow(/expired/)
    await expect(capabilitiesFor('tester', A, 'req_x', 'forged.token').runChecks()).rejects.toThrow(/signature/)
  })

  it('une capacité ne lit que les projets de son agent', async () => {
    const tok = signCapability({ agentId: 'agt_5c8vn', taskId: 'tsk_y', role: 'architect', exp: Date.now() + 60_000 })
    const caps = capabilitiesFor('architect', 'agt_5c8vn', 'req_y', tok)
    expect(await caps.readProject('prj_bonaco')).toBeNull()
    expect((await caps.readProject('prj_console'))?.name).toBe('Outils internes')
  })

  it('dans le contexte d’un agent, écrire chez un autre est refusé par la base', async () => {
    await expect(asAgent(A, (tx) => tx.insert(s.logs).values({ agentId: B, level: 'info', message: 'intrusion' }))).rejects.toThrow()
    await expect(asAgent(A, (tx) => tx.insert(s.auditLog).values({ agentId: B, actor: 'x', actorType: 'team', action: 'x', target: 'x' }))).rejects.toThrow()
  })
})

describe('RLS : la base refuse même si le code applicatif est contourné', () => {
  it('sans contexte, toutes les tables d’agent sont vides', async () => {
    for (const t of AGENT_TABLES) {
      const [{ n }] = rows<{ n: number }>(await db.execute(sql.raw(`select count(*)::int as n from ${t}`)))
      expect([t, n]).toEqual([t, 0])
    }
  })

  it('un contexte utilisateur forgé à la main ne montre que ses propres agents', async () => {
    const r = await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.mode', 'user', true), set_config('app.user_id', 'usr_3', true)`)
      return rows<{ id: string }>(await tx.execute(sql`select id from agents`))
    })
    expect(r.map((x) => x.id)).toEqual([A])
  })

  it('un mode inconnu ne donne accès à rien', async () => {
    const r = await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.mode', 'admin', true), set_config('app.agent_id', ${B}, true)`)
      return rows<{ id: string }>(await tx.execute(sql`select id from agents`))
    })
    expect(r).toEqual([])
  })

  it('le journal d’audit est en ajout seul', async () => {
    await expect(asAgent(B, (tx) => tx.execute(sql`update audit_log set action = 'falsifié' where agent_id = ${B}`))).rejects.toThrow()
    await expect(asAgent(B, (tx) => tx.execute(sql`delete from audit_log where agent_id = ${B}`))).rejects.toThrow()
  })
})

describe('accès de maintenance de la plateforme', () => {
  it('un administrateur non membre ne voit rien sans justification, et chaque accès est audité', async () => {
    const created = await (await call(ines, 'POST', '/v1/forge/requests', { brief: 'Résume les tickets de support de la semaine pour l’équipe.', projectId: 'prj_bonaco', maxActions: [], autonomyCeiling: 'suggest_only' })).json()
    const id = created.agentId as string
    expect((await call(abdoul, 'GET', `/v1/agents/${id}`)).status).toBe(404)
    const admin = await (await call(abdoul, 'GET', '/v1/admin/agents')).json()
    expect(admin.some((a: { id: string }) => a.id === id)).toBe(true)
    const m = await call(abdoul, 'GET', `/v1/agents/${id}`, undefined, { 'x-forge-maintenance': 'Incident #42 : diagnostic' })
    expect(m.status).toBe(200)
    const trail = await (await call(ines, 'GET', `/v1/agents/${id}/audit`)).json()
    expect(trail.some((e: { actorType: string; target: string }) => e.actorType === 'platform' && e.target.includes('Incident #42'))).toBe(true)
    // A member (non admin) cannot use the maintenance header.
    expect((await call(theo, 'GET', `/v1/agents/${id}`, undefined, { 'x-forge-maintenance': 'curiosité' })).status).toBe(404)
  })
})

describe('suppression : export puis purge totale', () => {
  it('purge base, vecteurs, fichiers, secrets et clés de l’agent', async () => {
    const draft = {
      name: 'Agent jetable',
      mission: 'Agent créé pour vérifier la purge complète.',
      type: 'conversational',
      autonomy: 'suggest_only',
      model: 'claude-haiku-5-5',
      tone: 'Direct',
      language: 'Français',
      projectIds: ['prj_bonaco'],
      triggers: [],
      tools: [],
      capabilities: [],
      skillIds: [],
      integrations: [],
      permissions: { allowedActions: [] },
      guardrails: { promptInjection: true, piiMasking: true, humanApproval: true, forbiddenActions: [], rateLimitPerMin: 30 },
      costCapPerDay: 2,
      memory: { longTerm: true, shortTermTurns: 5, retentionDays: 30 },
    }
    const agent = await (await call(ines, 'POST', '/v1/agents', draft)).json()
    const id = agent.id as string
    expect(agent.myRole).toBe('owner')
    const file = Buffer.from('# Procédure\nToujours vérifier deux fois.').toString('base64')
    expect((await call(ines, 'POST', `/v1/agents/${id}/knowledge`, { name: 'procedure.md', kind: 'markdown', file })).status).toBe(201)
    expect((await call(ines, 'PUT', `/v1/agents/${id}/secrets`, { name: 'API_TOKEN', value: 'tres-secret' })).status).toBe(200)
    await newKey(ines, id, 'live')
    await call(ines, 'POST', `/v1/agents/${id}/run`, { input: 'Bonjour', environment: 'test' })

    // Export first: everything except secret values.
    const exp = await (await call(ines, 'GET', `/v1/agents/${id}/export`)).json()
    expect(exp.agent.id).toBe(id)
    expect(exp.secrets[0].value).toBe('[non exporté]')
    expect(exp.files.length).toBeGreaterThan(0)
    expect(JSON.stringify(exp)).not.toContain('tres-secret')

    expect((await call(ines, 'DELETE', `/v1/agents/${id}`)).status).toBe(204)
    expect((await call(ines, 'GET', `/v1/agents/${id}`)).status).toBe(404)
    // In a platform context bound to that id, RLS would show any leftover row: there is none.
    for (const t of AGENT_TABLES) {
      const col = t === 'agents' ? 'id' : 'agent_id'
      const [{ n }] = await scoped({ mode: 'platform', agentId: id, userId: 'usr_2' }, async (tx) => rows<{ n: number }>(await tx.execute(sql.raw(`select count(*)::int as n from ${t} where ${col} = '${id}'`))))
      expect([t, n]).toEqual([t, 0])
    }
    expect(await new AgentStorage(id).list()).toEqual([])
    const left = await db.select().from(s.notifications).where(eq(s.notifications.agentId, id))
    expect(left).toEqual([])
  })

  it('seul un propriétaire peut purger', async () => {
    expect((await call(ines, 'DELETE', `/v1/agents/${B}`)).status).toBe(403)
  })
})
