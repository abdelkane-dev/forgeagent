import { config } from '../config'
import { anthropicProvider } from './anthropic'
import { simulatedProvider } from './simulated'
import type { LlmProvider } from './types'

export const llm: LlmProvider =
  config.llmProvider === 'anthropic' && config.ANTHROPIC_API_KEY ? anthropicProvider(config.ANTHROPIC_API_KEY) : simulatedProvider

export * from './types'
