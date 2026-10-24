/**
 * Deterministic guardrails applied before and around any model call.
 * Heuristics only: they never replace server-side permission checks.
 */

const INJECTION = [
  /ignore\s+(all\s+|tes\s+|les\s+|vos\s+)?(previous\s+)?(instructions|consignes|règles)/i,
  /oublie\s+(tes|les|vos)\s+(instructions|consignes|règles)/i,
  /(system|développeur|developer)\s+prompt/i,
  /(révèle|donne|affiche|print|reveal)[^.]{0,40}(clé|key|secret|token|mot de passe|password)/i,
  /tu es maintenant|you are now|act as (an? )?(admin|root)/i,
  /<\s*\/?\s*(system|instructions?)\s*>/i,
]

export function detectInjection(text: string): string | null {
  const hit = INJECTION.find((re) => re.test(text))
  return hit ? hit.source : null
}

/** Wraps untrusted content so the model treats it as data, not instructions. */
export const untrusted = (label: string, content: string) => `<donnees_non_fiables source="${label}">\n${content.replace(/<\/?donnees_non_fiables[^>]*>/g, '')}\n</donnees_non_fiables>`

export function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms: number, label = 'opération'): Promise<T> {
  const ctrl = new AbortController()
  let timer: NodeJS.Timeout
  return Promise.race([
    p(ctrl.signal).finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        ctrl.abort()
        reject(new Error(`${label} : délai dépassé après ${ms} ms`))
      }, ms)
    }),
  ])
}
