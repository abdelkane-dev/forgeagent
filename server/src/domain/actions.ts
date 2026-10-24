/**
 * Catalogue of actions an agent can be allowed to perform (same labels as the console).
 * `sensitive` actions always require an explicit human approval at run time, can only be
 * granted by an admin, and are flagged by the security reviewer.
 */
export const ACTIONS: Record<string, { sensitive: boolean; risk: 'low' | 'medium' | 'high' }> = {
  'Lire les journaux applicatifs': { sensitive: false, risk: 'low' },
  'Créer un ticket': { sensitive: false, risk: 'low' },
  'Envoyer une alerte': { sensitive: false, risk: 'low' },
  'Suspendre un compte': { sensitive: true, risk: 'medium' },
  'Masquer une publication': { sensitive: true, risk: 'medium' },
  'Modifier un réglage': { sensitive: true, risk: 'medium' },
  'Redémarrer un service': { sensitive: true, risk: 'high' },
  'Envoyer un email groupé': { sensitive: true, risk: 'high' },
  'Écrire en base de données': { sensitive: true, risk: 'high' },
  /** Any action that touches a connected external site. */
  'Agir sur le site externe': { sensitive: true, risk: 'high' },
}

export const ACTION_NAMES = Object.keys(ACTIONS)
export const isSensitive = (a: string) => ACTIONS[a]?.sensitive ?? true
export const riskOf = (a: string) => ACTIONS[a]?.risk ?? 'high'

/** Unknown actions are never accepted: agents only get catalogue actions. */
export const isKnownAction = (a: string) => a in ACTIONS
