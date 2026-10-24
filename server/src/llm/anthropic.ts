import Anthropic from '@anthropic-ai/sdk'
import type { LlmProvider, LlmRequest, LlmResponse } from './types'

/** Claude via the official SDK. Server-side only: the key never leaves the API process. */
export function anthropicProvider(apiKey: string): LlmProvider {
  const client = new Anthropic({ apiKey, maxRetries: 2 })
  return {
    name: 'anthropic',
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const res = await client.messages.create(
        {
          model: req.model,
          max_tokens: req.maxTokens ?? 2048,
          system: req.system,
          messages: req.messages as Anthropic.MessageParam[],
          ...(req.tools?.length ? { tools: req.tools as Anthropic.Tool[] } : {}),
        },
        { signal: req.signal },
      )
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
      const toolCalls = res.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }))
      return {
        text,
        toolCalls,
        stopReason: res.stop_reason === 'end_turn' || res.stop_reason === 'tool_use' || res.stop_reason === 'max_tokens' ? res.stop_reason : 'other',
        usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
        model: res.model,
      }
    },
  }
}
