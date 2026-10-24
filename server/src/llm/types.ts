/** Provider-neutral LLM types used by the internal team and the user-agent runtime. */

export interface ToolDef {
  name: string
  description: string
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

export interface LlmMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface LlmRequest {
  /** Who is asking: an internal role (architect…) or `agent:<id>` for user agents. Used for simulation and accounting. */
  caller: string
  model: string
  system: string
  messages: LlmMessage[]
  tools?: ToolDef[]
  maxTokens?: number
  signal?: AbortSignal
}

export interface LlmResponse {
  text: string
  toolCalls: { id: string; name: string; input: Record<string, unknown> }[]
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'other'
  usage: { input: number; output: number }
  model: string
}

export interface LlmProvider {
  readonly name: 'anthropic' | 'simulated'
  complete(req: LlmRequest): Promise<LlmResponse>
}

/** $ per million tokens. Unknown models are priced like Sonnet. */
const PRICES: Record<string, { in: number; out: number }> = {
  'claude-haiku-5-5': { in: 1, out: 5 },
  'claude-sonnet-5-5': { in: 3, out: 15 },
  'claude-opus-5-5': { in: 5, out: 25 },
}

export const costOf = (model: string, usage: { input: number; output: number }) => {
  const p = PRICES[model] ?? PRICES['claude-sonnet-5-5']
  return (usage.input * p.in + usage.output * p.out) / 1_000_000
}
