import pino from 'pino'
import { config } from '../config'

/** Structured logs. Secrets and personal data are redacted before anything is written. */
export const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL,
  redact: {
    paths: [
      'password',
      '*.password',
      'secret',
      '*.secret',
      'apiKey',
      '*.apiKey',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.token',
      'ANTHROPIC_API_KEY',
    ],
    censor: '[redacted]',
  },
  transport: config.isProd || config.NODE_ENV === 'test' ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
})

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const KEYLIKE = /\b(fa_(live|test|pub)_[a-z0-9]{8})[a-z0-9]+/gi
const LONG_DIGITS = /\b\d{12,19}\b/g

/** Masks personal data in free text (agent inputs, tool results) before it is stored in logs or traces. */
export function maskPii(text: string) {
  return text
    .replace(KEYLIKE, '$1••••')
    .replace(EMAIL, (m) => `${m[0]}•••@${m.split('@')[1]}`)
    .replace(LONG_DIGITS, (m) => `••••${m.slice(-4)}`)
}
