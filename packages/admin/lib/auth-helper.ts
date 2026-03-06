/**
 * Auth Helper for Admin Panel
 * 
 * Extracts JWT from NextRequest cookies/headers and returns request context.
 * Uses the CMS config's JWT secret for verification.
 */

import { getCMS } from './cms'
import { authenticate, optionalAuthenticate } from '@cms/api'
import type { RequestContext } from '@cms/core'
import { cookies } from 'next/headers'

/**
 * Get request context from a NextRequest.
 * Returns authenticated user context or a public context.
 */
export async function getRequestContext(request: Request): Promise<RequestContext & { userId?: string }> {
  const cms = await getCMS()
  const config = cms.getConfig()

  // Try to get token from header or cookie
  let authHeader = request.headers.get('authorization')
  
  if (!authHeader) {
    const cookieStore = cookies()
    const token = cookieStore.get('token')?.value
    if (token) {
      authHeader = `Bearer ${token}`
    }
  }

  const authResult = optionalAuthenticate(
    {
      headers: {
        authorization: authHeader || undefined
      }
    },
    config.jwt.secret
  )

  if (!authResult.success || !authResult.context) {
    return { role: 'public' }
  }

  return {
    role: authResult.context.role,
    userId: (authResult.context as any).userId
  }
}

/**
 * Require authentication - returns context or throws with error response data
 */
export async function requireAuth(request: Request): Promise<RequestContext & { userId: string }> {
  const cms = await getCMS()
  const config = cms.getConfig()

  // Try to get token from header or cookie
  let authHeader = request.headers.get('authorization')
  
  if (!authHeader) {
    const cookieStore = cookies()
    const token = cookieStore.get('token')?.value
    if (token) {
      authHeader = `Bearer ${token}`
    }
  }

  const authResult = authenticate(
    {
      headers: {
        authorization: authHeader || undefined
      }
    },
    config.jwt.secret
  )

  if (!authResult.success || !authResult.context) {
    throw {
      status: 401,
      name: 'UnauthorizedError',
      message: authResult.error?.message || 'Authentication required'
    }
  }

  const userId = (authResult.context as any).userId
  if (!userId) {
    throw {
      status: 401,
      name: 'UnauthorizedError',
      message: 'Authentication required'
    }
  }

  return { ...authResult.context, userId }
}

/**
 * Require super_admin role
 */
export async function requireSuperAdmin(request: Request): Promise<RequestContext & { userId: string }> {
  const context = await requireAuth(request)
  
  const cms = await getCMS()
  const rbacEngine = cms.getRBACEngine()
  
  if (!rbacEngine.isSuperAdmin(context.role)) {
    throw {
      status: 403,
      name: 'ForbiddenError',
      message: 'Super Admin access required'
    }
  }

  return context
}
