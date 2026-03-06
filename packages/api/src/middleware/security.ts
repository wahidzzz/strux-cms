/**
 * Security Middleware
 * 
 * Provides security utilities:
 * - Rate limiting (in-memory token bucket)
 * - Input sanitization
 * - Security headers
 */

/**
 * Security headers to add to all responses
 */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache'
}

/**
 * Simple in-memory rate limiter using token bucket
 */
interface RateBucket {
  tokens: number
  lastRefill: number
}

const rateBuckets = new Map<string, RateBucket>()
const DEFAULT_MAX_TOKENS = 60         // 60 requests
const DEFAULT_REFILL_RATE = 60 * 1000 // per minute
const CLEANUP_INTERVAL = 5 * 60 * 1000 // cleanup every 5 minutes

// Periodic cleanup of stale buckets
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of rateBuckets.entries()) {
    if (now - bucket.lastRefill > (DEFAULT_REFILL_RATE * 10)) {
      rateBuckets.delete(key)
    }
  }
}, CLEANUP_INTERVAL)

/**
 * Check if an IP address is blocked based on configuration
 * 
 * @param ip IP address to check
 * @param config IP blocking configuration
 * @returns true if blocked, false if allowed
 */
export function isIpBlocked(ip: string, config?: { enabled: boolean; blacklist: string[]; whitelist: string[] }): boolean {
  if (!config || !config.enabled) return false

  // Whitelist takes precedence
  if (config.whitelist.length > 0 && config.whitelist.includes(ip)) {
    return false
  }

  // Then check blacklist
  if (config.blacklist.length > 0 && config.blacklist.includes(ip)) {
    return true
  }

  return false
}

/**
 * Check rate limit for an identifier (typically IP address)
 * 
 * @param identifier Unique identifier (e.g., IP address)
 * @param config Rate limit configuration
 * @returns Object with allowed flag and remaining tokens
 */
export function checkRateLimit(
  identifier: string, 
  config?: { enabled: boolean; maxRequests: number; windowMs: number }
): { allowed: boolean; remaining: number; retryAfter?: number } {
  if (config && !config.enabled) {
    return { allowed: true, remaining: 999 }
  }

  const now = Date.now()
  let bucket = rateBuckets.get(identifier)
  const maxTokens = config?.maxRequests || DEFAULT_MAX_TOKENS
  const refillRate = config?.windowMs || DEFAULT_REFILL_RATE

  if (!bucket) {
    bucket = { tokens: maxTokens, lastRefill: now }
    rateBuckets.set(identifier, bucket)
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill
  if (elapsed > refillRate) {
    bucket.tokens = maxTokens
    bucket.lastRefill = now
  }

  if (bucket.tokens <= 0) {
    const retryAfter = Math.ceil((refillRate - elapsed) / 1000)
    return { allowed: false, remaining: 0, retryAfter }
  }

  bucket.tokens--
  return { allowed: true, remaining: bucket.tokens }
}

/**
 * Sanitize string input to prevent XSS
 * Strips HTML tags and dangerous characters from string values
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
}

/**
 * Deep sanitize an object's string values
 */
export function sanitizeInput(input: unknown): unknown {
  if (typeof input === 'string') {
    return sanitizeString(input)
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeInput)
  }

  if (input && typeof input === 'object') {
    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input)) {
      sanitized[sanitizeString(key)] = sanitizeInput(value)
    }
    return sanitized
  }

  return input
}
