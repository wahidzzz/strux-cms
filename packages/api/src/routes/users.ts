import { AuthEngine } from '@cms/core'

/**
 * Create Users route handlers
 */
const isValidEmail = (email: any): boolean => typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
const isValidPassword = (password: any): boolean => typeof password === 'string' && password.length >= 8

export function createUsersRouteHandler() {
  return {
    /**
     * GET /api/users
     * List all users
     */
    async list(_req: any, authEngine: AuthEngine) {
      try {
        const users = await authEngine.listUsers()
        return { data: users }
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
     * POST /api/users
     * Create a new user
     */
    async create(req: any, authEngine: AuthEngine) {
      try {
        const body = req.body || {}
        const { username, email, password, role } = body

        if (!username || typeof username !== 'string') {
          return { error: { status: 400, name: 'ValidationError', message: 'Valid username is required' } }
        }
        if (!isValidEmail(email)) {
          return { error: { status: 400, name: 'ValidationError', message: 'Valid email is required' } }
        }
        if (!isValidPassword(password)) {
          return { error: { status: 400, name: 'ValidationError', message: 'Password must be a string at least 8 characters long' } }
        }
        if (role !== undefined && typeof role !== 'string') {
          return { error: { status: 400, name: 'ValidationError', message: 'Role must be a string' } }
        }

        const user = await authEngine.register({ username, email, password, role })
        return { data: user, status: 201 }
      } catch (error: any) {
        return {
          error: {
            status: error.message.includes('already exists') ? 409 : 500,
            name: error.message.includes('already exists') ? 'ConflictError' : 'InternalServerError',
            message: error.message
          }
        }
      }
    },

    /**
     * GET /api/users/:id
     * Get a specific user
     */
    async get(req: any, authEngine: AuthEngine) {
      try {
        const { id } = req.params
        if (!id) {
          return { error: { status: 400, name: 'ValidationError', message: 'User ID is required' } }
        }

        const user = await authEngine.getUser(id)
        if (!user) {
          return { error: { status: 404, name: 'NotFoundError', message: 'User not found' } }
        }

        return { data: user }
      } catch (error: any) {
        return { error: { status: 500, name: 'InternalServerError', message: error.message } }
      }
    },

    /**
     * PUT /api/users/:id
     * Update user details/role
     */
    async update(req: any, authEngine: AuthEngine) {
      try {
        const { id } = req.params
        const body = req.body || {}
        
        if (!id) {
          return { error: { status: 400, name: 'ValidationError', message: 'User ID is required' } }
        }

        // Validate user exists
        const existingUser = await authEngine.getUser(id)
        if (!existingUser) {
          return { error: { status: 404, name: 'NotFoundError', message: 'User not found' } }
        }

        const updates: any = {}
        if (body.username !== undefined) {
          if (typeof body.username !== 'string') return { error: { status: 400, name: 'ValidationError', message: 'Username must be a string' } }
          updates.username = body.username
        }
        if (body.email !== undefined) {
          if (!isValidEmail(body.email)) return { error: { status: 400, name: 'ValidationError', message: 'Valid email is required' } }
          updates.email = body.email
        }
        if (body.password !== undefined) {
          if (!isValidPassword(body.password)) return { error: { status: 400, name: 'ValidationError', message: 'Password must be a string at least 8 characters long' } }
          updates.password = body.password
        }
        if (body.role !== undefined) {
          if (typeof body.role !== 'string') return { error: { status: 400, name: 'ValidationError', message: 'Role must be a string' } }
          updates.role = body.role
        }

        const updatedUser = await authEngine.updateUser(id, updates)
        return { data: updatedUser }
      } catch (error: any) {
        return { error: { status: 500, name: 'InternalServerError', message: error.message } }
      }
    },

    /**
     * DELETE /api/users/:id
     * Delete a user
     */
    async delete(req: any, authEngine: AuthEngine) {
      try {
        const { id } = req.params
        if (!id) {
          return { error: { status: 400, name: 'ValidationError', message: 'User ID is required' } }
        }

        // Prevent self-deletion if we could, but that requires knowing who's making the request (handled in middleware/app-level instead)

        const existingUser = await authEngine.getUser(id)
        if (!existingUser) {
           return { error: { status: 404, name: 'NotFoundError', message: 'User not found' } }
        }

        await authEngine.deleteUser(id)
        return { data: { success: true }, status: 200 }
      } catch (error: any) {
        return { error: { status: 500, name: 'InternalServerError', message: error.message } }
      }
    }
  }
}
