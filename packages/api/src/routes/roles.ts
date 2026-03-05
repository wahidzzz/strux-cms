import { RBACEngine } from '@cms/core'

/**
 * Create Roles route handlers
 */
export function createRolesRouteHandler() {
  return {
    /**
     * GET /api/roles
     * List all roles
     */
    async list(_req: any, rbacEngine: RBACEngine) {
      try {
        const roles = rbacEngine.getAllRoles()
        return { data: roles }
      } catch (error: any) {
        return {
          error: { status: 500, name: 'InternalServerError', message: error.message }
        }
      }
    },

    /**
     * POST /api/roles
     * Create a custom role
     */
    async create(req: any, rbacEngine: RBACEngine) {
      try {
        const body = req.body || {}
        
        // Ensure type is 'custom' if provided through API
        const roleData = { ...body, type: 'custom' }
        
        const newRole = await rbacEngine.createRole(roleData)
        return { data: newRole, status: 201 }
      } catch (error: any) {
        return {
          error: {
            status: error.message.includes('already exists') ? 409 : 400,
            name: error.message.includes('already exists') ? 'ConflictError' : 'ValidationError',
            message: error.message
          }
        }
      }
    },

    /**
     * GET /api/roles/:id
     * Get specific role details
     */
    async get(req: any, rbacEngine: RBACEngine) {
      try {
        const { id } = req.params
        if (!id) {
          return { error: { status: 400, name: 'ValidationError', message: 'Role ID is required' } }
        }

        const role = rbacEngine.getRole(id)
        if (!role) {
          return { error: { status: 404, name: 'NotFoundError', message: 'Role not found' } }
        }

        return { data: role }
      } catch (error: any) {
        return { error: { status: 500, name: 'InternalServerError', message: error.message } }
      }
    },

    /**
     * PUT /api/roles/:id
     * Update role permissions/details
     */
    async update(req: any, rbacEngine: RBACEngine) {
      try {
        const { id } = req.params
        const body = req.body || {}
        
        if (!id) {
          return { error: { status: 400, name: 'ValidationError', message: 'Role ID is required' } }
        }

        const updatedRole = await rbacEngine.updateRole(id, body)
        return { data: updatedRole }
      } catch (error: any) {
        return {
          error: {
            status: error.message.includes('not found') ? 404 : 400,
            name: error.message.includes('not found') ? 'NotFoundError' : 'ValidationError',
            message: error.message
          }
        }
      }
    },

    /**
     * DELETE /api/roles/:id
     * Delete a custom role
     */
    async delete(req: any, rbacEngine: RBACEngine) {
      try {
        const { id } = req.params
        if (!id) {
          return { error: { status: 400, name: 'ValidationError', message: 'Role ID is required' } }
        }

        await rbacEngine.deleteRole(id)
        return { data: { success: true }, status: 200 }
      } catch (error: any) {
        return {
          error: {
            status: error.message.includes('not found') ? 404 : (error.message.includes('Cannot delete') ? 403 : 500),
            name: error.message.includes('not found') ? 'NotFoundError' : (error.message.includes('Cannot delete') ? 'ForbiddenError' : 'InternalServerError'),
            message: error.message
          }
        }
      }
    }
  }
}
