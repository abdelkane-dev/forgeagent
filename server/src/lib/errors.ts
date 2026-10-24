/** Errors thrown by services; the HTTP layer maps them to status codes and `{ message }` bodies. */
export class HttpError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, message: string, code = 'error') {
    super(message)
    this.status = status
    this.code = code
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} introuvable`, 'not_found')
export const forbidden = (why = 'Action non autorisée pour votre rôle') => new HttpError(403, why, 'forbidden')
export const badRequest = (why: string) => new HttpError(400, why, 'bad_request')
export const conflict = (why: string) => new HttpError(409, why, 'conflict')
export const unauthorized = (why = 'Authentification requise') => new HttpError(401, why, 'unauthorized')
export const tooMany = (why = 'Trop de requêtes, réessayez dans un instant') => new HttpError(429, why, 'rate_limited')
