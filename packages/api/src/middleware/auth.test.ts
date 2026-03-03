/**
 * Authentication Middleware Tests
 * 
 * Tests JWT extraction, verification, and authentication flow.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import jwt from 'jsonwebtoken'
import {
  extractToken,
  verifyToken,
  authenticate,
  optionalAuthenticate,
  type AuthRequest,
  type JWTPayload
} from './auth'

describe('Authentication Middleware', () => {
  const jwtSecret = 'test-secret-key-for-testing'
  const validUserId = 'user-123'
  const validRole = 'editor'

  let validToken: string
  let expiredToken: string

  beforeAll(() => {
    // Create a valid token
    validToken = jwt.sign(
      { id: validUserId, role: validRole },
      jwtSecret,
      { expiresIn: '1h' }
    )

    // Create an expired token
    expiredToken = jwt.sign(
      { id: validUserId, role: validRole },
      jwtSecret,
      { expiresIn: '-1h' } // Already expired
    )
  })

  describe('extractToken', () => {
    it('should extract token from valid Bearer header', () => {
      const authHeader = `Bearer ${validToken}`
      const token = extractToken(authHeader)
      
      expect(token).toBe(validToken)
    })

    it('should return null for missing header', () => {
      const token = extractToken(undefined)
      
      expect(token).toBeNull()
    })

    it('should return null for empty header', () => {
      const token = extractToken('')
      
      expect(token).toBeNull()
    })

    it('should return null for header without Bearer scheme', () => {
      const authHeader = validToken // Missing "Bearer " prefix
      const token = extractToken(authHeader)
      
      expect(token).toBeNull()
    })

    it('should return null for header with wrong scheme', () => {
      const authHeader = `Basic ${validToken}`
      const token = extractToken(authHeader)
      
      expect(token).toBeNull()
    })

    it('should return null for malformed header', () => {
      const authHeader = 'Bearer'
      const token = extractToken(authHeader)
      
      expect(token).toBeNull()
    })

    it('should handle Bearer with different casing', () => {
      const authHeader = `bearer ${validToken}`
      const token = extractToken(authHeader)
      
      expect(token).toBe(validToken)
    })

    it('should handle BEARER with uppercase', () => {
      const authHeader = `BEARER ${validToken}`
      const token = extractToken(authHeader)
      
      expect(token).toBe(validToken)
    })
  })

  describe('verifyToken', () => {
    it('should verify and decode valid token', () => {
      const payload = verifyToken(validToken, jwtSecret)
      
      expect(payload).toBeDefined()
      expect(payload?.id).toBe(validUserId)
      expect(payload?.role).toBe(validRole)
      expect(payload?.iat).toBeDefined()
      expect(payload?.exp).toBeDefined()
    })

    it('should return null for expired token', () => {
      const payload = verifyToken(expiredToken, jwtSecret)
      
      expect(payload).toBeNull()
    })

    it('should return null for invalid signature', () => {
      const wrongSecret = 'wrong-secret'
      const payload = verifyToken(validToken, wrongSecret)
      
      expect(payload).toBeNull()
    })

    it('should return null for malformed token', () => {
      const malformedToken = 'not.a.valid.jwt'
      const payload = verifyToken(malformedToken, jwtSecret)
      
      expect(payload).toBeNull()
    })

    it('should return null for token without id', () => {
      const tokenWithoutId = jwt.sign(
        { role: validRole },
        jwtSecret,
        { expiresIn: '1h' }
      )
      
      const payload = verifyToken(tokenWithoutId, jwtSecret)
      
      expect(payload).toBeNull()
    })

    it('should return null for token without role', () => {
      const tokenWithoutRole = jwt.sign(
        { id: validUserId },
        jwtSecret,
        { expiresIn: '1h' }
      )
      
      const payload = verifyToken(tokenWithoutRole, jwtSecret)
      
      expect(payload).toBeNull()
    })

    it('should return null for empty token', () => {
      const payload = verifyToken('', jwtSecret)
      
      expect(payload).toBeNull()
    })
  })

  describe('authenticate', () => {
    it('should authenticate valid request with Bearer token', () => {
      const request: AuthRequest = {
        headers: {
          authorization: `Bearer ${validToken}`
        }
      }

      const result = authenticate(request, jwtSecret)

      expect(result.success).toBe(true)
      expect(result.context).toBeDefined()
      expect((result.context as any).userId).toBe(validUserId)
      expect(result.context?.role).toBe(validRole)
      expect(result.error).toBeUndefined()
    })

    it('should return 401 for missing Authorization header', () => {
      const request: AuthRequest = {
        headers: {}
      }

      const result = authenticate(request, jwtSecret)

      expect(result.success).toBe(false)
      expect(result.context).toBeUndefined()
      expect(result.error).toBeDefined()
      expect(result.error?.status).toBe(401)
      expect(result.error?.name).toBe('UnauthorizedError')
      expect(result.error?.message).toContain('Missing or invalid')
    })

    it('should return 401 for malformed Authorization header', () => {
      const request: AuthRequest = {
        headers: {
          authorization: 'InvalidFormat'
        }
      }

      const result = authenticate(request, jwtSecret)

      expect(result.success).toBe(false)
      expect(result.error?.status).toBe(401)
    })

    it('should return 401 for expired token', () => {
      const request: AuthRequest = {
        headers: {
          authorization: `Bearer ${expiredToken}`
        }
      }

      const result = authenticate(request, jwtSecret)

      expect(result.success).toBe(false)
      expect(result.error?.status).toBe(401)
      expect(result.error?.message).toContain('Invalid or expired')
    })

    it('should return 401 for invalid token signature', () => {
      const wrongSecret = 'wrong-secret'
      const request: AuthRequest = {
        headers: {
          authorization: `Bearer ${validToken}`
        }
      }

      const result = authenticate(request, wrongSecret)

      expect(result.success).toBe(false)
      expect(result.error?.status).toBe(401)
    })

    it('should return 401 for malformed JWT', () => {
      const request: AuthRequest = {
        headers: {
          authorization: 'Bearer not.a.valid.jwt'
        }
      }

      const result = authenticate(request, jwtSecret)

      expect(result.success).toBe(false)
      expect(result.error?.status).toBe(401)
    })

    it('should handle different user roles', () => {
      const roles = ['admin', 'editor', 'authenticated', 'public']

      for (const role of roles) {
        const token = jwt.sign(
          { id: 'user-123', role },
          jwtSecret,
          { expiresIn: '1h' }
        )

        const request: AuthRequest = {
          headers: {
            authorization: `Bearer ${token}`
          }
        }

        const result = authenticate(request, jwtSecret)

        expect(result.success).toBe(true)
        expect(result.context?.role).toBe(role)
      }
    })
  })

  describe('optionalAuthenticate', () => {
    it('should authenticate valid request with Bearer token', () => {
      const request: AuthRequest = {
        headers: {
          authorization: `Bearer ${validToken}`
        }
      }

      const result = optionalAuthenticate(request, jwtSecret)

      expect(result.success).toBe(true)
      expect(result.context).toBeDefined()
      expect((result.context as any).userId).toBe(validUserId)
      expect(result.context?.role).toBe(validRole)
    })

    it('should allow request without Authorization header', () => {
      const request: AuthRequest = {
        headers: {}
      }

      const result = optionalAuthenticate(request, jwtSecret)

      expect(result.success).toBe(true)
      expect(result.context).toBeDefined()
      expect(result.context?.role).toBe('public')
      expect((result.context as any).userId).toBeUndefined()
    })

    it('should return 401 for invalid token when provided', () => {
      const request: AuthRequest = {
        headers: {
          authorization: `Bearer ${expiredToken}`
        }
      }

      const result = optionalAuthenticate(request, jwtSecret)

      expect(result.success).toBe(false)
      expect(result.error?.status).toBe(401)
    })

    it('should return 401 for malformed token when provided', () => {
      const request: AuthRequest = {
        headers: {
          authorization: 'Bearer not.a.valid.jwt'
        }
      }

      const result = optionalAuthenticate(request, jwtSecret)

      expect(result.success).toBe(false)
      expect(result.error?.status).toBe(401)
    })

    it('should assign public role for empty Authorization header', () => {
      const request: AuthRequest = {
        headers: {
          authorization: ''
        }
      }

      const result = optionalAuthenticate(request, jwtSecret)

      expect(result.success).toBe(true)
      expect(result.context?.role).toBe('public')
    })
  })

  describe('Integration scenarios', () => {
    it('should handle complete authentication flow', () => {
      // Step 1: Create token
      const userId = 'user-456'
      const role = 'admin'
      const token = jwt.sign(
        { id: userId, role },
        jwtSecret,
        { expiresIn: '7d' }
      )

      // Step 2: Create request with token
      const request: AuthRequest = {
        headers: {
          authorization: `Bearer ${token}`
        }
      }

      // Step 3: Authenticate
      const result = authenticate(request, jwtSecret)

      // Step 4: Verify context
      expect(result.success).toBe(true)
      expect((result.context as any).userId).toBe(userId)
      expect(result.context?.role).toBe(role)
    })

    it('should reject token after expiration', () => {
      // Create token that expires in 1 second
      const token = jwt.sign(
        { id: 'user-789', role: 'editor' },
        jwtSecret,
        { expiresIn: '0s' } // Expires immediately
      )

      const request: AuthRequest = {
        headers: {
          authorization: `Bearer ${token}`
        }
      }

      // Wait a bit to ensure expiration
      const result = authenticate(request, jwtSecret)

      expect(result.success).toBe(false)
      expect(result.error?.status).toBe(401)
    })

    it('should handle token with additional claims', () => {
      const token = jwt.sign(
        {
          id: 'user-999',
          role: 'editor',
          email: 'user@example.com',
          name: 'Test User'
        },
        jwtSecret,
        { expiresIn: '1h' }
      )

      const request: AuthRequest = {
        headers: {
          authorization: `Bearer ${token}`
        }
      }

      const result = authenticate(request, jwtSecret)

      expect(result.success).toBe(true)
      expect((result.context as any).userId).toBe('user-999')
      expect(result.context?.role).toBe('editor')
    })
  })
})
