import type { ForgeApi } from './client'
import { httpApi } from './http'
import { mockApi } from './mock'

/** Demo mode (mock data) unless VITE_API_URL points to a ForgeAgent back-end. */
export const isDemo = !import.meta.env.VITE_API_URL

export const api: ForgeApi = isDemo ? mockApi : httpApi

export { ApiError } from './client'
export type { ForgeApi } from './client'
export * from './types'
