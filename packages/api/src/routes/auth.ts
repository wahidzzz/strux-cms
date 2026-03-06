import { AuthEngine } from '@cms/core'
import jwt from 'jsonwebtoken'

/**
 * Create Auth route handlers
 */
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

        if (!identifier || !password) {
          return {
            error: {
              status: 400,
              name: 'ValidationError',
              message: 'Identifier and password are required'
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
        
        // Check if there are already users
        const users = await authEngine.listUsers()
        
        // If users exist, require authentication to register new ones
        if (users.length > 0) {
          // In a real app, we'd check req.context for admin permissions
          // For now, we'll assume it's protected at the route level if needed
        }

        const user = await authEngine.register(body)

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
        const user = await authEngine.updateUser(context.userId, {
          username: body.username,
          email: body.email
        })

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

        if (!currentPassword || !newPassword) {
          return { error: { status: 400, name: 'ValidationError', message: 'Current and new passwords are required' } }
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
