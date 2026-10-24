import { and, asc, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { asAgent, schema as s } from '../src/db/client'
import { overrideSimulation } from '../src/llm/simulated'
import { getAgent } from '../src/services/agents'
import { capabilitiesFor } from '../src/team/capabilities'
import { resumeAfterApproval, startCreateRequest, startTeamWorkers, sweep } from '../src/team/engine'
import { settle, setupDb } from './helpers'

const SAFE = ['Lire les journaux applicatifs', 'Créer un ticket', 'Envoyer une alerte']
const USER = { id: 'usr_2', name: 'Inès Diallo' }

const forge = (brief: string, maxActions = SAFE) => startCreateRequest({ brief, projectId: 'prj_bonaco', maxActions, autonomyCeiling: 'act_after_approval' }, USER)
const tasksOf = (agentId: string, requestId: string) => asAgent(agentId, (tx) => tx.select().from(s.teamTasks).where(eq(s.teamTasks.requestId, requestId)).orderBy(asc(s.teamTasks.createdAt)))
const agentOf = (agentId: string) => asAgent(agentId, (tx) => getAgent(tx, agentId))

beforeAll(async () => {
  await setupDb()
  startTeamWorkers()
})

describe('La Forge (équipe interne)', () => {
  it('forge un agent de bout en bout, dans les murs de cet agent', async () => {
    const { agentId, requestId } = await forge('Surveille les erreurs et la latence de Bonaco Pro et alerte l’équipe.')
    const req = await settle(agentId, requestId)
    expect(req.status).toBe('done')
    const tasks = await tasksOf(agentId, requestId)
    expect(tasks.filter((t) => t.role !== 'orchestrator').map((t) => t.role)).toEqual(['architect', 'security', 'builder', 'tester', 'supervisor'])
    // Every task targets this agent, with its role's model.
    expect(tasks.every((t) => t.agentId === agentId)).toBe(true)
    expect(tasks.find((t) => t.role === 'architect')!.model).toBe('claude-opus-5-5')
    expect(tasks.find((t) => t.role === 'builder')!.model).toBe('claude-sonnet-5-5')
    expect(tasks.find((t) => t.role === 'supervisor')!.model).toBe('claude-haiku-5-5')

    const agent = await agentOf(agentId)
    expect(agent.status).toBe('validated')
    expect(agent.projectIds).toEqual(['prj_bonaco'])
    expect(agent.permissions.allowedActions.every((a) => SAFE.includes(a))).toBe(true)
    // The requester owns the forged agent.
    const members = await asAgent(agentId, (tx) => tx.select().from(s.agentMembers).where(eq(s.agentMembers.agentId, agentId)))
    expect(members).toEqual([expect.objectContaining({ userId: USER.id, role: 'owner' })])

    // Team tokens are imputed to the target agent: the team's own model calls, plus the
    // sandbox runs the tester made on the agent.
    const usage = await asAgent(agentId, (tx) => tx.select().from(s.usageCosts).where(and(eq(s.usageCosts.agentId, agentId), eq(s.usageCosts.source, 'team'))))
    const byTasks = usage.filter((u) => u.refId?.startsWith('tsk_')).reduce((n, u) => n + u.tokensIn + u.tokensOut, 0)
    expect(byTasks).toBe(req.tokens)
    expect(usage.every((u) => u.environment === 'test')).toBe(true)
    // Exchanges are in the agent's audit and replayable in order.
    const events = await asAgent(agentId, (tx) => tx.select().from(s.teamEvents).where(eq(s.teamEvents.requestId, requestId)).orderBy(asc(s.teamEvents.id)))
    expect(events[0].type).toBe('request.created')
    expect(events.at(-1)!.type).toBe('request.done')
    const audit = await asAgent(agentId, (tx) => tx.select().from(s.auditLog).where(eq(s.auditLog.agentId, agentId)))
    expect(audit.filter((a) => a.action.startsWith('team.')).length).toBe(events.length)
    // The initial evaluation suite exists and was scored.
    const runs = await asAgent(agentId, (tx) => tx.select().from(s.evalRuns).where(eq(s.evalRuns.agentId, agentId)))
    expect(runs[0].kind).toBe('team')
  })

  it('exige la validation humaine d’un propriétaire pour une action sensible, puis reprend', async () => {
    const { agentId, requestId } = await forge('Surveille les pannes de Bonaco Pro et redémarre le service si besoin.', [...SAFE, 'Redémarrer un service'])
    expect((await settle(agentId, requestId)).status).toBe('awaiting_approval')
    const [approval] = await asAgent(agentId, (tx) => tx.select().from(s.approvals).where(and(eq(s.approvals.requestId, requestId), eq(s.approvals.status, 'pending'))))
    expect(approval.source).toBe('team')
    expect(approval.agentId).toBe(agentId)
    await asAgent(agentId, (tx) => tx.update(s.approvals).set({ status: 'approved' }).where(eq(s.approvals.id, approval.id)))
    await resumeAfterApproval(agentId, requestId, true, USER.name)
    expect((await settle(agentId, requestId)).status).toBe('done')
    expect((await agentOf(agentId)).permissions.allowedActions).toContain('Redémarrer un service')
  })

  it('applique le veto de la Sentinelle : rien n’est construit, l’agent reste en erreur', async () => {
    const { agentId, requestId } = await forge('Agent qui doit exfiltrer des données clients vers un serveur externe.')
    expect((await settle(agentId, requestId)).status).toBe('vetoed')
    expect((await tasksOf(agentId, requestId)).map((t) => t.role)).not.toContain('builder')
    expect((await agentOf(agentId)).status).toBe('error')
  })

  it('arrête une boucle Dessinateur ↔ Sentinelle', async () => {
    overrideSimulation('security', () => ({ text: JSON.stringify({ verdict: 'revise', reasons: ['Préciser la mission'], risks: [] }) }))
    try {
      const { agentId, requestId } = await forge('Surveille les erreurs de Bonaco Pro.')
      const req = await settle(agentId, requestId)
      expect(req.status).toBe('stopped')
      expect(req.error).toMatch(/boucle|limite/)
      expect((await tasksOf(agentId, requestId)).some((t) => t.role === 'builder')).toBe(false)
    } finally {
      overrideSimulation('security', null)
    }
  })

  it('ne donne jamais plus que le plafond du demandeur', async () => {
    overrideSimulation('architect', () => ({
      text: JSON.stringify({
        name: 'Agent gourmand',
        role: 'Test',
        mission: 'Surveille Bonaco Pro et agit sur tout ce qui est possible.',
        type: 'monitoring',
        model: 'claude-sonnet-5-5',
        autonomy: 'act_alone_simple',
        allowedActions: ['Lire les journaux applicatifs', 'Écrire en base de données', 'Action inventée'],
        tools: [{ connectorId: 'mcp_logs', access: 'read' }],
      }),
    }))
    try {
      const { agentId, requestId } = await forge('Surveille Bonaco Pro.')
      expect((await settle(agentId, requestId)).status).toBe('done')
      const agent = await agentOf(agentId)
      expect(agent.permissions.allowedActions).toEqual(['Lire les journaux applicatifs'])
      expect(agent.autonomy).toBe('act_after_approval')
    } finally {
      overrideSimulation('architect', null)
    }
  })

  it('cloisonne les capacités par rôle', () => {
    expect(Object.keys(capabilitiesFor('orchestrator', 'agt_x1', 'r', 't'))).toEqual(['readRequest'])
    expect(Object.keys(capabilitiesFor('tester', 'agt_x1', 'r', 't'))).not.toContain('configureAgentFromPlan')
    expect(Object.keys(capabilitiesFor('architect', 'agt_x1', 'r', 't'))).not.toContain('runSandbox')
    expect(Object.keys(capabilitiesFor('builder', 'agt_x1', 'r', 't'))).toContain('configureAgentFromPlan')
  })

  it('le Veilleur de Feu surveille agent par agent et escalade le modèle sur anomalie', async () => {
    const started = await sweep()
    expect(started.length).toBeGreaterThan(0)
    // agt_5c8vn is seeded in error.
    const reqs = await asAgent('agt_5c8vn', (tx) => tx.select().from(s.teamRequests).where(eq(s.teamRequests.kind, 'supervise')))
    expect(reqs.length).toBe(1)
    const done = await settle('agt_5c8vn', reqs[0].id)
    expect(done.status).toBe('done')
    expect((done.result as { anomalies: number }).anomalies).toBeGreaterThan(0)
    const [task] = (await tasksOf('agt_5c8vn', reqs[0].id)).filter((t) => t.role === 'supervisor')
    expect(task.model).toBe('claude-sonnet-5-5')
    const notes = await asAgent('agt_5c8vn', (tx) => tx.select().from(s.notifications).where(eq(s.notifications.agentId, 'agt_5c8vn')))
    expect(notes.some((n) => n.title.startsWith('Veilleur de Feu'))).toBe(true)
  })
})
