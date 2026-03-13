import { AuthEngine } from '@cms/core'
import jwt from 'jsonwebtoken'

/**
 * Create Auth route handlers
 */
const isValidEmail = (email: any): boolean => typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
const isValidPassword = (password: any): boolean => typeof password === 'string' && password.length >= 8

export function createAuthRouteHandler() {
  return {
    /**
     * POST /api/auth/local
     * Handle user login
     */
    async login(req: any, authEngine: AuthEngine, jwtSecret: string) {
      try {
        const body = req.body || {}
        const { identifier, password } = body

        if (!identifier || typeof identifier !== 'string' || !password || typeof password !== 'string') {
          return {
            error: {
              status: 400,
              name: 'ValidationError',
              message: 'Identifier and password must be valid strings'
            }
          }
        }

        const user = await authEngine.authenticate(identifier, password)

        if (!user) {
          return {
            error: {
              status: 401,
              name: 'UnauthorizedError',
              message: 'Invalid credentials'
            }
          }
        }

        // Generate JWT
        const token = jwt.sign(
          { id: user.id, role: user.role },
          jwtSecret,
          { expiresIn: '1h' } // Short JWT expiry for security
        )

        // Generate Refresh Token
        const refreshToken = await authEngine.generateRefreshToken(user.id, (req as any).ip || 'unknown')

        return {
          jwt: token,
          refreshToken,
          user
        }
      } catch (error: any) {
        return {
          error: {
            status: 500,
            name: 'InternalServerError',
            message: error.message
          }
        }
      }
    },

    /**
     * POST /api/auth/register
     * Handle user registration (initial admin or admin-created)
     */
    async register(req: any, authEngine: AuthEngine) {
      try {
        const body = req.body || {}
        
        if (!body.username || typeof body.username !== 'string') {
          return { error: { status: 400, name: 'ValidationError', message: 'Valid username is required' } }
        }
        if (!isValidEmail(body.email)) {
          return { error: { status: 400, name: 'ValidationError', message: 'Valid email is required' } }
        }
        if (!isValidPassword(body.password)) {
          return { error: { status: 400, name: 'ValidationError', message: 'Password must be a string at least 8 characters long' } }
        }

        // Check if there are already users
        const users = await authEngine.listUsers()
        
        let assignedRole = 'author' // Default safe role
        
        // If users exist, require authentication to register new ones / assign roles
        if (users.length > 0) {
          if (req.context && req.context.role === 'admin' && typeof body.role === 'string') {
            assignedRole = body.role
          }
        } else {
          // First user gets admin role or specified role
          assignedRole = typeof body.role === 'string' ? body.role : 'admin'
        }

        const user = await authEngine.register({
          username: body.username,
          email: body.email,
          password: body.password,
          role: assignedRole
        })

        return {
          user
        }
      } catch (error: any) {
        return {
          error: {
            status: 400,
            name: 'RegistrationError',
            message: error.message
          }
        }
      }
    },

    /**
     * GET /api/auth/me
     * Get current authenticated user
     */
    async me(req: any, authEngine: AuthEngine) {
      const context = req.context
      if (!context || !context.userId) {
        return {
          error: {
            status: 401,
            name: 'UnauthorizedError',
            message: 'Not authenticated'
          }
        }
      }

      const user = await authEngine.getUser(context.userId)
      if (!user) {
        return {
          error: {
            status: 404,
            name: 'NotFoundError',
            message: 'User not found'
          }
        }
      }

      return {
        user
      }
    },

    /**
     * PUT /api/auth/me
     * Update current user profile
     */
    async updateMe(req: any, authEngine: AuthEngine) {
      try {
        const context = req.context
        if (!context || !context.userId) {
          return { error: { status: 401, name: 'UnauthorizedError', message: 'Not authenticated' } }
        }

        const body = req.body || {}
        
        const updates: any = {}
        if (body.username !== undefined) {
          if (typeof body.username !== 'string') return { error: { status: 400, name: 'ValidationError', message: 'Username must be a string' } }
          updates.username = body.username
        }
        if (body.email !== undefined) {
          if (!isValidEmail(body.email)) return { error: { status: 400, name: 'ValidationError', message: 'Valid email is required' } }
          updates.email = body.email
        }

        const user = await authEngine.updateUser(context.userId, updates)

        return { user }
      } catch (error: any) {
        return { error: { status: 400, name: 'UpdateError', message: error.message } }
      }
    },

    /**
     * PATCH /api/auth/me
     * Change current user password
     */
    async changePassword(req: any, authEngine: AuthEngine) {
      try {
        const context = req.context
        if (!context || !context.userId) {
          return { error: { status: 401, name: 'UnauthorizedError', message: 'Not authenticated' } }
        }

        const body = req.body || {}
        const { currentPassword, newPassword } = body

        if (!currentPassword || typeof currentPassword !== 'string') {
          return { error: { status: 400, name: 'ValidationError', message: 'Current password must be a string' } }
        }
        if (!isValidPassword(newPassword)) {
          return { error: { status: 400, name: 'ValidationError', message: 'New password must be a string at least 8 characters long' } }
        }

        // Verify current password first
        const user = await authEngine.getUser(context.userId)
        if (!user) {
          return { error: { status: 404, name: 'NotFoundError', message: 'User not found' } }
        }

        // We need authEngine.authenticate to verify
        const authenticated = await authEngine.authenticate(user.username, currentPassword)
        if (!authenticated) {
          return { error: { status: 401, name: 'UnauthorizedError', message: 'Invalid current password' } }
        }

        await authEngine.updateUser(context.userId, { password: newPassword })

        return { success: true }
      } catch (error: any) {
        return { error: { status: 400, name: 'UpdateError', message: error.message } }
      }
    },

    /**
     * POST /api/auth/refresh
     * Refresh JWT using refresh token
     */
    async refresh(req: any, authEngine: AuthEngine, jwtSecret: string) {
      try {
        const body = req.body || {}
        const { refreshToken } = body

        if (!refreshToken) {
          return { error: { status: 400, name: 'ValidationError', message: 'Refresh token is required' } }
        }

        const { userId, newToken } = await authEngine.rotateRefreshToken(refreshToken, req.ip || 'unknown')
        const user = await authEngine.getUser(userId)

        if (!user) {
          throw new Error('User not found')
        }

        const jwtToken = jwt.sign(
          { id: user.id, role: user.role },
          jwtSecret,
          { expiresIn: '1h' }
        )

        return {
          jwt: jwtToken,
          refreshToken: newToken,
          user
        }
      } catch (error: any) {
        return { error: { status: 401, name: 'UnauthorizedError', message: error.message } }
      }
    },

    /**
     * POST /api/auth/logout
     * Revoke refresh token
     */
    async logout(req: any, authEngine: AuthEngine) {
      try {
        const { refreshToken } = req.body || {}
        if (refreshToken) {
          await authEngine.revokeRefreshToken(refreshToken)
        }
        return { success: true }
      } catch (error: any) {
        return { error: { status: 500, name: 'InternalServerError', message: error.message } }
      }
    }
  }
}
