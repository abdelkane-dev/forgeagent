/** French formatting helpers. Narrow no-break spaces (U+202F) become regular no-break spaces: the UI font has no glyph for them. */
const nb = (s: string) => s.replace(/ /g, " ")

const nf = new Intl.NumberFormat('fr-FR')
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })

export const num = (n: number) => nb(nf.format(n))

export const pct = (n: number) => `${nb(nf1.format(n))} %`

export function usd(n: number) {
  const digits = n !== 0 && Math.abs(n) < 0.1 ? 3 : 2
  return `${nb(n.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }))} $`
}

export function duration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${nf1.format(ms / 1000)} s`
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`
}

export function compact(n: number) {
  return nb(new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(n))
}

export function relative(iso: string | null) {
  if (!iso) return '—'
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 45) return 'à l’instant'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86_400), 'day')
}

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function date(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
