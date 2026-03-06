/**
 * API Key Middleware
 * 
 * Validates API keys for protected endpoints.
 * Public routes (content reads, auth) are exempt.
 */

import type { ApiKeyEntry } from '@cms/core'

/**
 * Routes that are publicly accessible without API key or JWT
 */
const PUBLIC_ROUTES: Array<{ method: string; pattern: RegExp }> = [
  // Auth routes - always public
  { method: 'POST', pattern: /^\/api\/auth\/local$/ },
  { method: 'POST', pattern: /^\/api\/auth\/register$/ },
  // Content read routes - public by default
  { method: 'GET', pattern: /^\/api\/content\// },
  // Schema listing (needed for public consumption)
  { method: 'GET', pattern: /^\/api\/schemas$/ },
  // Upload serving
  { method: 'GET', pattern: /^\/uploads\// },
]

/**
 * Check if a route is public (doesn't need API key or auth)
 */
export function isPublicRoute(method: string, path: string): boolean {
  return PUBLIC_ROUTES.some(
    r => r.method === method.toUpperCase() && r.pattern.test(path)
  )
}

/**
 * API Key validation result
 */
export interface ApiKeyResult {
  success: boolean
  keyEntry?: ApiKeyEntry
  error?: {
    status: number
    name: string
    message: string
  }
}

/**
 * Extract API key from request
 * Checks X-API-Key header or apiKey query parameter
 */
export function extractApiKey(headers: Record<string, string | undefined>, queryParams?: Record<string, string>): string | null {
  // Check X-API-Key header first
  const headerKey = headers['x-api-key'] || headers['X-API-Key']
  if (headerKey) return headerKey

  // Check query parameter
  if (queryParams?.apiKey) return queryParams.apiKey

  return null
}
