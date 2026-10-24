import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import type { Approval, AuditEntry, LogEntry, Trace } from '@shared/types'
import { schema as s, type Tx } from '../db/client'
import { audit } from '../lib/audit'
import { bus } from '../lib/bus'
import { conflict, forbidden, notFound } from '../lib/errors'
import { route } from '../http/router'
import { EvalCaseInput, IntegrationInput, KeyInput, KnowledgeInput, MemberInput, SecretInput, SuiteInput, WebhookInput, WorkflowInput, AgentRole, str } from '../http/schemas'
import type { AppEnv } from '../http/types'
import { checkIntegration, createIntegration, deleteIntegration, listIntegrations, sendToSite } from '../runtime/site'
import { addMember, createKey, createWebhook, deleteSecret, deleteWebhook, listKeys, listMembers, listSecrets, listWebhooks, putSecret, removeMember, revokeKey, rotateKey, setMemberRole } from '../services/access'
import { addCase, createSuite, deleteSuite, listCases, listRuns, listSuites, runSuite } from '../services/evals'
import { addDoc, addMemory, forget, listDocs, listMemories, removeDoc, search } from '../services/knowledge'
import { logChannel, writeLog } from '../services/settings'
import { deliver, emitWebhook } from '../services/webhooks'
import { deleteWorkflow, listWorkflowRuns, listWorkflows, resumeWorkflow, saveWorkflow, startWorkflow } from '../services/workflows'
import { resumeAfterApproval } from '../team/engine'

const toLog = (l: typeof s.logs.$inferSelect): LogEntry => ({ id: `log_${l.id}`, at: l.at, agentId: l.agentId, level: l.level, message: l.message, environment: l.environment, traceId: l.runId ?? undefined })

export async function traces(tx: Tx, where: ReturnType<typeof eq> | undefined, limit = 100): Promise<Trace[]> {
  const rows = await tx.select().from(s.runs).where(where).orderBy(desc(s.runs.startedAt)).limit(limit)
  if (!rows.length) return []
  const steps = await tx.select().from(s.runSteps).where(inArray(s.runSteps.runId, rows.map((r) => r.id))).orderBy(asc(s.runSteps.idx))
  return rows.map((r) => ({
    id: r.id,
    agentId: r.agentId,
    at: r.startedAt,
    durationMs: r.durationMs,
    tokens: r.tokensIn + r.tokensOut,
    cost: r.cost,
    status: r.status === 'ok' ? 'ok' : r.status === 'running' ? 'running' : r.status === 'blocked' ? 'blocked' : 'error',
    environment: r.environment,
    input: r.input,
    spans: steps.filter((st) => st.runId === r.id).map((st) => ({ id: st.id, name: st.name, kind: st.kind, startMs: st.startMs, durationMs: st.durationMs, detail: st.detail ?? undefined })),
  }))
}

export const toApproval = (a: typeof s.approvals.$inferSelect): Approval => ({ id: a.id, agentId: a.agentId, source: a.source, requestId: a.requestId ?? undefined, action: a.action, reason: a.reason, risk: a.risk, requestedAt: a.requestedAt })

const P = '/agents/:agentId'

export function agentSpaceRoutes(app: Hono<AppEnv>) {
  /* ---------- Équipe et accès ---------- */
  route(app, { method: 'get', path: `${P}/members`, tag: 'Équipe et accès', summary: 'Membres de l’agent', agent: 'viewer' }, ({ agent }) => agent.tx((tx) => listMembers(tx, agent.id)))
  route(app, { method: 'post', path: `${P}/members`, tag: 'Équipe et accès', summary: 'Ajouter un membre (invitation si le compte n’existe pas)', agent: 'owner', body: MemberInput, status: 201 }, ({ agent, body }) =>
    agent.tx((tx) => addMember(tx, agent.id, body.email, body.role, agent.actor.name)),
  )
  route(app, { method: 'patch', path: `${P}/members/:userId`, tag: 'Équipe et accès', summary: 'Changer le rôle d’un membre', agent: 'owner', body: z.object({ role: AgentRole }) }, ({ agent, params, body }) =>
    agent.tx((tx) => setMemberRole(tx, agent.id, params.userId, body.role, agent.actor.name)),
  )
  route(app, { method: 'delete', path: `${P}/members/:userId`, tag: 'Équipe et accès', summary: 'Retirer un membre', agent: 'owner', status: 204 }, async ({ agent, params }) => {
    await agent.tx((tx) => removeMember(tx, agent.id, params.userId, agent.actor.name))
  })

  route(app, { method: 'get', path: `${P}/keys`, tag: 'Équipe et accès', summary: 'Clés API de l’agent (jamais le secret)', agent: 'viewer' }, ({ agent }) => agent.tx((tx) => listKeys(tx, agent.id)))
  route(app, { method: 'post', path: `${P}/keys`, tag: 'Équipe et accès', summary: 'Créer une clé (secret affiché une seule fois)', agent: 'owner', body: KeyInput, status: 201 }, ({ agent, body }) =>
    agent.tx((tx) => createKey(tx, agent.id, body, agent.actor)),
  )
  route(app, { method: 'post', path: `${P}/keys/:keyId/rotate`, tag: 'Équipe et accès', summary: 'Régénérer une clé', agent: 'owner' }, ({ agent, params }) => agent.tx((tx) => rotateKey(tx, agent.id, params.keyId, agent.actor.name)))
  route(app, { method: 'delete', path: `${P}/keys/:keyId`, tag: 'Équipe et accès', summary: 'Révoquer une clé', agent: 'owner', status: 204 }, async ({ agent, params }) => {
    await agent.tx((tx) => revokeKey(tx, agent.id, params.keyId, agent.actor.name))
  })

  /* ---------- Intégration: secrets, sites, webhooks ---------- */
  route(app, { method: 'get', path: `${P}/secrets`, tag: 'Intégration', summary: 'Secrets de l’agent (noms seulement)', agent: 'viewer' }, ({ agent }) => agent.tx((tx) => listSecrets(tx, agent.id)))
  route(app, { method: 'put', path: `${P}/secrets`, tag: 'Intégration', summary: 'Créer ou remplacer un secret (chiffré avec la clé de cet agent)', agent: 'owner', body: SecretInput }, ({ agent, body }) =>
    agent.tx(async (tx) => {
      await putSecret(tx, agent.id, body.name, body.value, agent.actor.name)
      return (await listSecrets(tx, agent.id)).find((x) => x.name === body.name)!
    }),
  )
  route(app, { method: 'delete', path: `${P}/secrets/:name`, tag: 'Intégration', summary: 'Supprimer un secret', agent: 'owner', status: 204 }, async ({ agent, params }) => {
    await agent.tx((tx) => deleteSecret(tx, agent.id, params.name, agent.actor.name))
  })

  route(app, { method: 'get', path: `${P}/integrations`, tag: 'Intégration', summary: 'Sites, applications et services reliés', agent: 'viewer' }, ({ agent }) => agent.tx((tx) => listIntegrations(tx, agent.id)))
  route(app, { method: 'post', path: `${P}/integrations`, tag: 'Intégration', summary: 'Relier un site (son origine est ajoutée aux origines autorisées du widget)', agent: 'editor', body: IntegrationInput, status: 201 }, ({ agent, body }) =>
    agent.tx((tx) => createIntegration(tx, agent.id, body, agent.actor.name)),
  )
  route(app, { method: 'delete', path: `${P}/integrations/:integrationId`, tag: 'Intégration', summary: 'Retirer une intégration', agent: 'editor', status: 204 }, async ({ agent, params }) => {
    await agent.tx((tx) => deleteIntegration(tx, agent.id, params.integrationId, agent.actor.name))
  })
  route(app, { method: 'post', path: `${P}/integrations/:integrationId/check`, tag: 'Intégration', summary: 'Vérifier que le site répond et charge le widget de cet agent', agent: 'editor' }, ({ agent, params }) =>
    checkIntegration(agent.id, params.integrationId, agent.actor.name),
  )
  route(
    app,
    { method: 'post', path: `${P}/site/events`, tag: 'Intégration', summary: 'Envoyer un événement aux pages ouvertes (actions : permission « Agir sur le site externe »)', agent: 'editor', body: z.object({ event: z.enum(['ping', 'page.context', 'ui.highlight', 'api.call', 'notify.admin']) }) },
    ({ agent, body }) => sendToSite(agent.id, body.event, agent.actor.name),
  )

  route(app, { method: 'get', path: `${P}/webhooks`, tag: 'Intégration', summary: 'Webhooks sortants de l’agent', agent: 'viewer' }, ({ agent }) => agent.tx((tx) => listWebhooks(tx, agent.id)))
  route(app, { method: 'post', path: `${P}/webhooks`, tag: 'Intégration', summary: 'Ajouter un webhook signé (secret affiché une fois)', agent: 'owner', body: WebhookInput, status: 201 }, ({ agent, body }) =>
    agent.tx((tx) => createWebhook(tx, agent.id, body.url, body.events, agent.actor.name)),
  )
  route(app, { method: 'delete', path: `${P}/webhooks/:webhookId`, tag: 'Intégration', summary: 'Supprimer un webhook', agent: 'owner', status: 204 }, async ({ agent, params }) => {
    await agent.tx((tx) => deleteWebhook(tx, agent.id, params.webhookId, agent.actor.name))
  })
  route(app, { method: 'post', path: `${P}/webhooks/:webhookId/test`, tag: 'Intégration', summary: 'Envoyer un événement de test signé', agent: 'editor' }, ({ agent, params }) =>
    deliver(agent.id, params.webhookId, 'test', { message: 'Événement de test ForgeAgent' }),
  )

  /* ---------- Connaissances et mémoire ---------- */
  route(app, { method: 'get', path: `${P}/knowledge`, tag: 'Connaissances et mémoire', summary: 'Sources indexées de l’agent', agent: 'viewer' }, ({ agent }) => agent.tx((tx) => listDocs(tx, agent.id)))
  route(app, { method: 'post', path: `${P}/knowledge`, tag: 'Connaissances et mémoire', summary: 'Ajouter une source (texte, fichier ou site) : indexation en arrière-plan', agent: 'editor', body: KnowledgeInput, status: 201 }, ({ agent, body }) =>
    agent.tx((tx) => addDoc(tx, agent.id, { name: body.name, kind: body.kind, content: body.content, fileBase64: body.file }, agent.actor.name)),
  )
  route(app, { method: 'delete', path: `${P}/knowledge/:docId`, tag: 'Connaissances et mémoire', summary: 'Retirer une source (et ses vecteurs)', agent: 'editor', status: 204 }, async ({ agent, params }) => {
    await agent.tx((tx) => removeDoc(tx, agent.id, params.docId, agent.actor.name))
  })
  route(app, { method: 'get', path: `${P}/knowledge/search`, tag: 'Connaissances et mémoire', summary: 'Recherche sémantique dans la base de l’agent (pgvector)', auth: 'session_or_key', agent: 'viewer', query: z.object({ q: str(1000).min(1), k: z.coerce.number().int().min(1).max(20).default(5) }) }, ({ agent, query }) =>
    agent.tx((tx) => search(tx, agent.id, query.q, query.k)),
  )

  route(app, { method: 'get', path: `${P}/memories`, tag: 'Connaissances et mémoire', summary: 'Mémoire courte et longue', agent: 'viewer', query: z.object({ kind: z.enum(['short', 'long']).optional() }) }, ({ agent, query }) =>
    agent.tx((tx) => listMemories(tx, agent.id, query.kind)),
  )
  route(app, { method: 'post', path: `${P}/memories`, tag: 'Connaissances et mémoire', summary: 'Ajouter un souvenir long terme', agent: 'editor', body: z.object({ text: str(2000).min(2) }), status: 201 }, ({ agent, body }) =>
    agent.tx(async (tx) => {
      const m = await addMemory(tx, agent.id, 'long', body.text)
      await audit(tx, agent.id, { actor: agent.actor.name, actorType: agent.actor.type ?? 'user', action: 'a ajouté un souvenir', target: body.text.slice(0, 80) })
      return m
    }),
  )
  route(app, { method: 'delete', path: `${P}/memories/:memoryId`, tag: 'Connaissances et mémoire', summary: 'Oublier un souvenir', agent: 'editor', status: 204 }, async ({ agent, params }) => {
    await agent.tx((tx) => forget(tx, agent.id, [params.memoryId], agent.actor.name))
  })
  route(app, { method: 'delete', path: `${P}/memories`, tag: 'Connaissances et mémoire', summary: 'Effacer toute la mémoire', agent: 'editor', status: 204 }, async ({ agent }) => {
    await agent.tx((tx) => forget(tx, agent.id, 'all', agent.actor.name))
  })

  /* ---------- Test et évaluation ---------- */
  route(app, { method: 'get', path: `${P}/evals`, tag: 'Test et évaluation', summary: 'Suites d’évaluation', agent: 'viewer' }, ({ agent }) => agent.tx((tx) => listSuites(tx, agent.id)))
  route(app, { method: 'post', path: `${P}/evals`, tag: 'Test et évaluation', summary: 'Créer une suite', agent: 'editor', body: SuiteInput, status: 201 }, async ({ agent, body }) => {
    const id = await agent.tx((tx) => createSuite(tx, agent.id, body, agent.actor.name))
    return agent.tx(async (tx) => (await listSuites(tx, agent.id)).find((x) => x.id === id)!)
  })
  route(app, { method: 'delete', path: `${P}/evals/:suiteId`, tag: 'Test et évaluation', summary: 'Supprimer une suite', agent: 'editor', status: 204 }, async ({ agent, params }) => {
    await agent.tx((tx) => deleteSuite(tx, agent.id, params.suiteId, agent.actor.name))
  })
  route(app, { method: 'get', path: `${P}/evals/:suiteId/cases`, tag: 'Test et évaluation', summary: 'Cas d’une suite', agent: 'viewer' }, ({ agent, params }) => agent.tx((tx) => listCases(tx, agent.id, params.suiteId)))
  route(app, { method: 'post', path: `${P}/evals/:suiteId/cases`, tag: 'Test et évaluation', summary: 'Ajouter un cas', agent: 'editor', body: EvalCaseInput, status: 201 }, ({ agent, params, body }) =>
    agent.tx((tx) => addCase(tx, agent.id, params.suiteId, body)),
  )
  route(app, { method: 'post', path: `${P}/evals/:suiteId/run`, tag: 'Test et évaluation', summary: 'Lancer la suite en environnement de test', agent: 'viewer' }, ({ agent, params }) =>
    runSuite(agent.id, params.suiteId, 'manual', { actor: agent.actor.name }),
  )
  route(app, { method: 'get', path: `${P}/evals/runs`, tag: 'Test et évaluation', summary: 'Historique des scores (toutes versions)', agent: 'viewer', query: z.object({ suiteId: str(40).optional() }) }, ({ agent, query }) =>
    agent.tx((tx) => listRuns(tx, agent.id, query.suiteId)),
  )

  /* ---------- Workflows ---------- */
  route(app, { method: 'get', path: `${P}/workflows`, tag: 'Workflows', summary: 'Workflows de l’agent', agent: 'viewer' }, ({ agent }) => agent.tx((tx) => listWorkflows(tx, agent.id)))
  route(app, { method: 'put', path: `${P}/workflows`, tag: 'Workflows', summary: 'Enregistrer un workflow (publier ⇒ nouvelle version)', agent: 'editor', body: WorkflowInput }, ({ agent, body }) =>
    agent.tx((tx) => saveWorkflow(tx, agent.id, body, agent.actor.name)),
  )
  route(app, { method: 'delete', path: `${P}/workflows/:workflowId`, tag: 'Workflows', summary: 'Supprimer un workflow', agent: 'editor', status: 204 }, async ({ agent, params }) => {
    await agent.tx((tx) => deleteWorkflow(tx, agent.id, params.workflowId, agent.actor.name))
  })
  route(app, { method: 'post', path: `${P}/workflows/:workflowId/run`, tag: 'Workflows', summary: 'Lancer un workflow (test : outils simulés)', agent: 'editor', body: z.object({ input: str(4000).default(''), test: z.boolean().default(true) }), status: 201 }, async ({ agent, params, body }) => ({
    runId: await startWorkflow(agent.id, params.workflowId, 'manual', body.input, { test: body.test, actor: agent.actor.name }),
  }))
  route(
    app,
    { method: 'post', path: `${P}/workflows/:workflowId/hook`, tag: 'Workflows', summary: 'Déclencher un workflow publié depuis un service (clé secrète de cet agent)', auth: 'session_or_key', agent: 'editor', body: z.object({ input: str(4000).default('') }), status: 201 },
    async ({ agent, params, body }) => ({ runId: await startWorkflow(agent.id, params.workflowId, 'webhook', body.input, { test: false, actor: agent.actor.name }) }),
  )
  route(app, { method: 'get', path: `${P}/workflows/runs`, tag: 'Workflows', summary: 'Exécutions de workflows', agent: 'viewer', query: z.object({ workflowId: str(40).optional() }) }, ({ agent, query }) =>
    agent.tx((tx) => listWorkflowRuns(tx, agent.id, query.workflowId)),
  )

  /* ---------- Audit, logs, traces ---------- */
  route(app, { method: 'get', path: `${P}/audit`, tag: 'Audit', summary: 'Journal d’audit de l’agent (ajout seul)', agent: 'viewer' }, ({ agent }) =>
    agent.tx(async (tx): Promise<AuditEntry[]> =>
      (await tx.select().from(s.auditLog).where(eq(s.auditLog.agentId, agent.id)).orderBy(desc(s.auditLog.id)).limit(500)).map((a) => ({
        id: `aud_${a.id}`,
        agentId: a.agentId,
        at: a.at,
        actor: a.actor,
        actorType: a.actorType,
        action: a.action,
        target: a.target,
        result: a.result,
      })),
    ),
  )

  route(app, { method: 'get', path: `${P}/logs`, tag: 'Logs', summary: 'Dernières lignes de journal', agent: 'viewer', query: z.object({ level: z.enum(['debug', 'info', 'warn', 'error']).optional(), environment: z.enum(['test', 'production']).optional() }) }, ({ agent, query }) =>
    agent.tx(async (tx) =>
      (
        await tx
          .select()
          .from(s.logs)
          .where(and(eq(s.logs.agentId, agent.id), query.level ? eq(s.logs.level, query.level) : undefined, query.environment ? eq(s.logs.environment, query.environment) : undefined))
          .orderBy(desc(s.logs.id))
          .limit(200)
      )
        .reverse()
        .map(toLog),
    ),
  )

  route(app, { method: 'get', path: `${P}/logs/stream`, tag: 'Logs', summary: 'Journal en direct de cet agent (SSE, un LogEntry JSON par message)', agent: 'viewer' }, ({ c, agent }) =>
    streamSSE(c, async (stream) => {
      // The channel is the agent's own: nothing from another agent can arrive here.
      const off = bus.subscribe(logChannel(agent.id), (e) => void stream.writeSSE({ data: JSON.stringify(e) }))
      stream.onAbort(off)
      while (!stream.aborted) {
        await stream.writeSSE({ event: 'ping', data: '' })
        await stream.sleep(15_000)
      }
      off()
    }),
  )

  route(app, { method: 'get', path: `${P}/traces`, tag: 'Logs', summary: 'Traces d’exécution', agent: 'viewer' }, ({ agent }) => agent.tx((tx) => traces(tx, eq(s.runs.agentId, agent.id))))
  route(app, { method: 'get', path: `${P}/traces/:traceId`, tag: 'Logs', summary: 'Une trace et ses étapes', agent: 'viewer' }, async ({ agent, params }) => {
    const [t] = await agent.tx((tx) => traces(tx, and(eq(s.runs.agentId, agent.id), eq(s.runs.id, params.traceId)) as ReturnType<typeof eq>, 1))
    if (!t) throw notFound('Trace')
    return t
  })

  /* ---------- Human approvals of this agent ---------- */
  route(app, { method: 'get', path: `${P}/approvals`, tag: 'Validations', summary: 'Validations en attente de l’agent', agent: 'viewer' }, ({ agent }) =>
    agent.tx(async (tx) => (await tx.select().from(s.approvals).where(and(eq(s.approvals.agentId, agent.id), eq(s.approvals.status, 'pending'))).orderBy(desc(s.approvals.requestedAt))).map(toApproval)),
  )

  for (const decision of ['approve', 'reject'] as const) {
    route(app, { method: 'post', path: `${P}/approvals/:approvalId/${decision}`, tag: 'Validations', summary: decision === 'approve' ? 'Approuver' : 'Refuser', agent: 'editor', status: 204 }, async ({ agent, params }) => {
      const a = await agent.tx(async (tx) => {
        const [a] = await tx.select().from(s.approvals).where(and(eq(s.approvals.id, params.approvalId), eq(s.approvals.agentId, agent.id)))
        if (!a) throw notFound('Validation')
        if (a.status !== 'pending') throw conflict('Cette validation a déjà été traitée')
        // Decisions of the internal team (forging an agent with sensitive actions) belong to the owner.
        if (a.source === 'team' && agent.role !== 'owner') throw forbidden('Seul un propriétaire de l’agent peut trancher une demande de La Forge')
        await tx
          .update(s.approvals)
          .set({ status: decision === 'approve' ? 'approved' : 'rejected', resolvedBy: agent.actor.name, resolvedAt: new Date().toISOString() })
          .where(eq(s.approvals.id, a.id))
        await audit(tx, agent.id, { actor: agent.actor.name, actorType: agent.actor.type ?? 'user', action: decision === 'approve' ? 'a approuvé' : 'a refusé', target: a.action, meta: { approvalId: a.id, source: a.source } })
        if (a.source === 'agent') await writeLog(tx, agent.id, 'info', `${a.action} : ${decision === 'approve' ? 'approuvée' : 'refusée'} par ${agent.actor.name}`)
        return a
      })
      if (a.source === 'team' && a.requestId) await resumeAfterApproval(agent.id, a.requestId, decision === 'approve', agent.actor.name)
      else if (a.source === 'workflow' && a.workflowRunId) await resumeWorkflow(agent.id, a.workflowRunId, decision === 'approve')
      else await emitWebhook(agent.id, 'approval.resolved', { approvalId: a.id, decision })
    })
  }
}
