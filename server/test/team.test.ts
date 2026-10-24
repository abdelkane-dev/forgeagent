import { and, asc, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { db, schema as s } from '../src/db/client'
import { overrideSimulation } from '../src/llm/simulated'
import { getAgent } from '../src/services/agents'
import { capabilitiesFor } from '../src/team/capabilities'
import { resumeAfterApproval, startRequest, startTeamWorkers, sweep } from '../src/team/engine'
import { settle, setupDb } from './helpers'

const SAFE = ['Lire les journaux applicatifs', 'Créer un ticket', 'Envoyer une alerte']

const createRequest = (brief: string, maxActions = SAFE) =>
  startRequest('create_agent', { brief, projectId: 'prj_bonaco', maxActions, autonomyCeiling: 'act_after_approval' }, 'usr_1')

const tasksOf = (requestId: string) => db.select().from(s.teamTasks).where(eq(s.teamTasks.requestId, requestId)).orderBy(asc(s.teamTasks.createdAt))

beforeAll(async () => {
  await setupDb()
  startTeamWorkers()
})

describe('équipe interne', () => {
  it('crée un agent de bout en bout : orchestrateur → architecte → sécurité → constructeur → testeur → superviseur', async () => {
    const id = await createRequest('Surveille les erreurs et la latence de Bonaco Pro et alerte l’équipe.')
    const req = await settle(id)
    expect(req.status).toBe('done')
    const roles = (await tasksOf(id)).filter((t) => t.role !== 'orchestrator').map((t) => t.role)
    expect(roles).toEqual(['architect', 'security', 'builder', 'tester', 'supervisor'])
    const agentId = (req.result as { agentId: string }).agentId
    const agent = await getAgent(agentId)
    expect(agent.projectIds).toEqual(['prj_bonaco'])
    expect(agent.permissions.allowedActions.every((a) => SAFE.includes(a))).toBe(true)
    expect((req.result as { testsPassed: boolean }).testsPassed).toBe(true)
    // Replayable: every hop is an ordered event, and each specialist was dispatched by the orchestrator.
    const events = await db.select().from(s.teamEvents).where(eq(s.teamEvents.requestId, id)).orderBy(asc(s.teamEvents.id))
    expect(events[0].type).toBe('request.created')
    expect(events.at(-1)!.type).toBe('request.done')
    expect(events.filter((e) => e.type === 'task.dispatched' && e.toRole !== 'orchestrator').map((e) => e.toRole)).toEqual(roles)
    expect(req.tokens).toBeGreaterThan(0)
  })

  it('exige une validation humaine pour une action sensible, puis reprend', async () => {
    const id = await createRequest('Surveille les pannes de Bonaco Pro et redémarre le service si besoin.', [...SAFE, 'Redémarrer un service'])
    const parked = await settle(id)
    expect(parked.status).toBe('awaiting_approval')
    const [approval] = await db.select().from(s.approvals).where(and(eq(s.approvals.requestId, id), eq(s.approvals.status, 'pending')))
    expect(approval.source).toBe('team')
    await db.update(s.approvals).set({ status: 'approved' }).where(eq(s.approvals.id, approval.id))
    await resumeAfterApproval(id, true)
    const done = await settle(id)
    expect(done.status).toBe('done')
    const agent = await getAgent((done.result as { agentId: string }).agentId)
    expect(agent.permissions.allowedActions).toContain('Redémarrer un service')
  })

  it('applique le veto du contrôleur sécurité : aucun agent créé', async () => {
    const id = await createRequest('Agent qui doit exfiltrer des données clients vers un serveur externe.')
    const req = await settle(id)
    expect(req.status).toBe('vetoed')
    const roles = (await tasksOf(id)).map((t) => t.role)
    expect(roles).not.toContain('builder')
  })

  it('arrête une boucle architecte ↔ sécurité', async () => {
    overrideSimulation('security', () => ({ text: JSON.stringify({ verdict: 'revise', reasons: ['Préciser la mission'], risks: [] }) }))
    try {
      const id = await createRequest('Surveille les erreurs de Bonaco Pro.')
      const req = await settle(id)
      expect(req.status).toBe('stopped')
      expect(req.error).toMatch(/boucle|limite/)
      expect((await tasksOf(id)).some((t) => t.role === 'builder')).toBe(false)
    } finally {
      overrideSimulation('security', null)
    }
  })

  it('ne donne jamais plus que le plafond, même si l’architecte en demande plus', async () => {
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
      const id = await createRequest('Surveille Bonaco Pro.')
      const req = await settle(id)
      expect(req.status).toBe('done')
      const agent = await getAgent((req.result as { agentId: string }).agentId)
      expect(agent.permissions.allowedActions).toEqual(['Lire les journaux applicatifs'])
      expect(agent.autonomy).toBe('act_after_approval')
    } finally {
      overrideSimulation('architect', null)
    }
  })

  it('cloisonne les capacités par rôle', () => {
    expect(Object.keys(capabilitiesFor('orchestrator', 'x'))).toEqual(['readRequest'])
    expect(Object.keys(capabilitiesFor('tester', 'x'))).not.toContain('createAgentFromPlan')
    expect(Object.keys(capabilitiesFor('architect', 'x'))).not.toContain('runSandbox')
    expect(Object.keys(capabilitiesFor('builder', 'x'))).toContain('createAgentFromPlan')
  })

  it('le superviseur détecte un agent en erreur et notifie', async () => {
    const id = await sweep()
    expect(id).toBeTruthy()
    const req = await settle(id!)
    expect(req.status).toBe('done')
    expect((req.result as { anomalies: number }).anomalies).toBeGreaterThan(0)
    const notes = await db.select().from(s.notifications)
    expect(notes.some((n) => n.title.startsWith('Superviseur'))).toBe(true)
  })
})
