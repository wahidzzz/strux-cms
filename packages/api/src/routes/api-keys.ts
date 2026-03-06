import { ApiKeyEngine } from '@cms/core'

/**
 * Create API Keys route handlers
 */
export function createApiKeysRouteHandler(): Record<string, (...args: any[]) => Promise<any>> {
  return {
    /**
     * GET /api/api-keys
     * List all API keys (masked)
     */
    async list(_req: any, apiKeyEngine: ApiKeyEngine) {
      try {
        const keys = await apiKeyEngine.listKeys()
        return { data: keys }
      } catch (error: any) {
        return {
          error: { status: 500, name: 'InternalServerError', message: error.message }
        }
      }
    },

    /**
     * POST /api/api-keys
     * Generate a new API key
     */
    async create(req: any, apiKeyEngine: ApiKeyEngine) {
      try {
        const body = req.body || {}
        const { name, permissions, expiresAt } = body
        const userId = req.context?.userId || 'system'

        if (!name) {
          return {
            error: { status: 400, name: 'ValidationError', message: 'API key name is required' }
          }
        }

        const key = await apiKeyEngine.generateKey(
          name,
          userId,
          permissions || ['*'],
          expiresAt
        )

        return { data: key, status: 201 }
      } catch (error: any) {
        return {
          error: { status: 400, name: 'ValidationError', message: error.message }
        }
      }
    },

    /**
     * DELETE /api/api-keys/:id
     * Revoke an API key
     */
    async delete(req: any, apiKeyEngine: ApiKeyEngine) {
      try {
        const { id } = req.params
        if (!id) {
          return { error: { status: 400, name: 'ValidationError', message: 'Key ID is required' } }
        }

        await apiKeyEngine.revokeKey(id)
        return { data: { success: true }, status: 200 }
      } catch (error: any) {
        return {
          error: {
            status: error.message.includes('not found') ? 404 : 500,
            name: error.message.includes('not found') ? 'NotFoundError' : 'InternalServerError',
            message: error.message
          }
        }
      }
    }
  }
}
