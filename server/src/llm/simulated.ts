import { randomUUID } from 'node:crypto'
import type { LlmProvider, LlmRequest, LlmResponse } from './types'

/**
 * Deterministic offline provider, used when ANTHROPIC_API_KEY is absent and in tests.
 * Each internal role registers a "simulation" producing the same JSON shape a real model
 * would; tests can override a role to script misbehaviour (veto, loops…).
 */
export type Simulation = (req: LlmRequest) => Partial<LlmResponse> & { text?: string }

const simulations = new Map<string, Simulation>()
const overrides = new Map<string, Simulation>()

export const registerSimulation = (caller: string, fn: Simulation) => simulations.set(caller, fn)
/** Test hook: replace a role's behaviour. Pass null to restore. */
export const overrideSimulation = (caller: string, fn: Simulation | null) => (fn ? overrides.set(caller, fn) : overrides.delete(caller))

const estimate = (s: string) => Math.max(1, Math.ceil(s.length / 4))
const flatten = (req: LlmRequest) => req.system + req.messages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n')

/** Default behaviour for user agents: read with the first tool, act if asked, then answer. */
const agentSimulation: Simulation = (req) => {
  const last = req.messages[req.messages.length - 1]
  const blocks = typeof last.content === 'string' ? [] : last.content
  const hadTools = req.messages.some((m) => typeof m.content !== 'string' && m.content.some((b) => b.type === 'tool_result'))
  const firstUser = req.messages.find((m) => m.role === 'user')
  const input = typeof firstUser?.content === 'string' ? firstUser.content : ''
  const tools = req.tools ?? []
  const actionTool = tools.find((t) => t.name === 'perform_action')
  const readTool = tools.find((t) => t.name !== 'perform_action')

  if (!hadTools && readTool) {
    return { toolCalls: [{ id: randomUUID(), name: readTool.name, input: { query: input.slice(0, 120) } }], stopReason: 'tool_use' }
  }
  const actedAlready = req.messages.some((m) => typeof m.content !== 'string' && m.content.some((b) => b.type === 'tool_use' && b.name === 'perform_action'))
  const wanted = (actionTool?.input_schema.properties.action as { enum?: string[] } | undefined)?.enum ?? []
  const keyword: [RegExp, string][] = [
    [/erreur|500|panne|latence|lent/i, 'Créer un ticket'],
    [/suspect|spam|fraude/i, 'Suspendre un compte'],
    [/redémarr/i, 'Redémarrer un service'],
    [/alerte|prévien/i, 'Envoyer une alerte'],
  ]
  const match = keyword.find(([re, a]) => re.test(input) && wanted.includes(a))
  if (actionTool && !actedAlready && match) {
    return { toolCalls: [{ id: randomUUID(), name: 'perform_action', input: { action: match[1], reason: `Demande : ${input.slice(0, 80)}` } }], stopReason: 'tool_use' }
  }
  const results = blocks.filter((b) => b.type === 'tool_result').map((b) => (b as { content: string }).content)
  return {
    text: results.length
      ? `Analyse terminée. ${results.map((r) => r.slice(0, 160)).join(' · ')}`
      : `Analyse terminée pour « ${input.slice(0, 80)} ». Aucun outil nécessaire.`,
    stopReason: 'end_turn',
  }
}

export const simulatedProvider: LlmProvider = {
  name: 'simulated',
  async complete(req) {
    const fn = overrides.get(req.caller) ?? simulations.get(req.caller) ?? (req.caller.startsWith('agent:') ? agentSimulation : undefined)
    const out = fn ? fn(req) : { text: '{}' }
    const text = out.text ?? ''
    const toolCalls = out.toolCalls ?? []
    return {
      text,
      toolCalls,
      stopReason: out.stopReason ?? (toolCalls.length ? 'tool_use' : 'end_turn'),
      usage: out.usage ?? { input: estimate(flatten(req)), output: estimate(text + JSON.stringify(toolCalls)) },
      model: req.model,
    }
  },
}
