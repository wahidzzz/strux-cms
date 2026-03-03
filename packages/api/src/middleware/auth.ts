/**
 * Authentication Middleware
 * 
 * Provides JWT-based authentication for API requests.
 * Extracts and verifies JWT tokens from Authorization header.
 * 
 * @module middleware/auth
 */

import jwt from 'jsonwebtoken'
import type { RequestContext } from '@cms/core'

/**
 * JWT payload structure
 */
export interface JWTPayload {
  id: string
  role: string
  iat: number
  exp: number
}

/**
 * Authentication request interface
 */
export interface AuthRequest {
  headers: {
    authorization?: string
  }
  context?: RequestContext
}

/**
 * Authentication result
 */
export interface AuthResult {
  success: boolean
  context?: RequestContext
  error?: {
    status: number
    name: string
    message: string
  }
}

/**
 * Extract JWT token from Authorization header
 * 
 * Supports Bearer token format: "Bearer <token>"
 * 
 * @param authHeader - Authorization header value
 * @returns JWT token string or null if not found
 */
export function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null
  }

  // Check for Bearer token format
  const parts = authHeader.split(' ')
  
  if (parts.length !== 2) {
    return null
  }

  const [scheme, token] = parts

  if (scheme.toLowerCase() !== 'bearer') {
    return null
  }

  return token
}

/**
 * Verify JWT token and decode payload
 * 
 * @param token - JWT token string
 * @param secret - JWT secret key
 * @returns Decoded JWT payload or null if invalid
 */
export function verifyToken(token: string, secret: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, secret) as JWTPayload
    
    // Validate required fields
    if (!decoded.id || !decoded.role) {
      return null
    }

    return decoded
  } catch (error) {
    // Token is invalid, expired, or malformed
    return null
  }
}

/**
 * Authentication middleware
 * 
 * Extracts JWT from Authorization header, verifies signature,
 * decodes user ID and role, and attaches to request context.
 * 
 * Returns 401 Unauthorized if:
 * - Token is missing
 * - Token is invalid
 * - Token is expired
 * - Token signature verification fails
 * 
 * @param request - Request object with headers
 * @param jwtSecret - JWT secret key for verification
 * @returns Authentication result with context or error
 */
export function authenticate(
  request: AuthRequest,
  jwtSecret: string
): AuthResult {
  // Step 1: Extract token from Authorization header
  const token = extractToken(request.headers.authorization)

  if (!token) {
    return {
      success: false,
      error: {
        status: 401,
        name: 'UnauthorizedError',
        message: 'Missing or invalid Authorization header'
      }
    }
  }

  // Step 2: Verify token signature and decode payload
  const payload = verifyToken(token, jwtSecret)

  if (!payload) {
    return {
      success: false,
      error: {
        status: 401,
        name: 'UnauthorizedError',
        message: 'Invalid or expired token'
      }
    }
  }

  // Step 3: Create request context with user information
  // Note: We only set the role here. The user field requires full User object
  // with username and email, which are not in the JWT payload.
  // The userId can be accessed from payload.id if needed by the caller.
  const context: RequestContext = {
    role: payload.role
  }

  // Attach userId to context for reference (as a custom property)
  // This allows engines to track who performed the action
  ;(context as any).userId = payload.id

  // Step 4: Return success with context
  return {
    success: true,
    context
  }
}

/**
 * Optional authentication middleware
 * 
 * Similar to authenticate() but allows requests without tokens.
 * If token is present, it must be valid.
 * If token is missing, assigns public role.
 * 
 * Useful for endpoints that support both authenticated and public access.
 * 
 * @param request - Request object with headers
 * @param jwtSecret - JWT secret key for verification
 * @returns Authentication result with context (always succeeds)
 */
export function optionalAuthenticate(
  request: AuthRequest,
  jwtSecret: string
): AuthResult {
  // Step 1: Extract token from Authorization header
  const token = extractToken(request.headers.authorization)

  // If no token, assign public role
  if (!token) {
    return {
      success: true,
      context: {
        role: 'public'
      }
    }
  }

  // Step 2: Verify token if present
  const payload = verifyToken(token, jwtSecret)

  // If token is invalid, return error (token must be valid if provided)
  if (!payload) {
    return {
      success: false,
      error: {
        status: 401,
        name: 'UnauthorizedError',
        message: 'Invalid or expired token'
      }
    }
  }

  // Step 3: Create request context with user information
  const context: RequestContext = {
    role: payload.role
  }

  // Attach userId to context for reference
  ;(context as any).userId = payload.id

  return {
    success: true,
    context
  }
}
