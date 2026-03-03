/**
 * RBAC Middleware Tests
 * 
 * Tests for role-based access control middleware.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  extractAction,
  extractResource,
  checkPermissions,
  type RBACRequest
} from './rbac'
import type { RequestContext } from '@cms/core'

describe('RBAC Middleware', () => {
  describe('extractAction', () => {
    it('should extract read action from GET method', () => {
      const action = extractAction('GET', '/api/articles')
      expect(action).toBe('read')
    })

    it('should extract create action from POST method', () => {
      const action = extractAction('POST', '/api/articles')
      expect(action).toBe('create')
    })

    it('should extract update action from PUT method', () => {
      const action = extractAction('PUT', '/api/articles/123')
      expect(action).toBe('update')
    })

    it('should extract update action from PATCH method', () => {
      const action = extractAction('PATCH', '/api/articles/123')
      expect(action).toBe('update')
    })

    it('should extract delete action from DELETE method', () => {
      const action = extractAction('DELETE', '/api/articles/123')
      expect(action).toBe('delete')
    })

    it('should extract publish action from POST to /publish endpoint', () => {
      const action = extractAction('POST', '/api/articles/123/publish')
      expect(action).toBe('publish')
    })

    it('should extract unpublish action from POST to /unpublish endpoint', () => {
      const action = extractAction('POST', '/api/articles/123/unpublish')
      expect(action).toBe('unpublish')
    })

    it('should handle case-insensitive HTTP methods', () => {
      expect(extractAction('get', '/api/articles')).toBe('read')
      expect(extractAction('post', '/api/articles')).toBe('create')
      expect(extractAction('put', '/api/articles/123')).toBe('update')
      expect(extractAction('delete', '/api/articles/123')).toBe('delete')
    })

    it('should default to read for unknown methods', () => {
      const action = extractAction('OPTIONS', '/api/articles')
      expect(action).toBe('read')
    })
  })

  describe('extractResource', () => {
    it('should extract resource from content type', () => {
      const request: RBACRequest = {
        params: {
          contentType: 'articles'
        },
        context: { role: 'editor' }
      }

      const resource = extractResource(request)
      expect(resource).toEqual({
        type: 'articles',
        id: undefined
      })
    })

    it('should extract resource with ID', () => {
      const request: RBACRequest = {
        params: {
          contentType: 'articles',
          id: '123'
        },
        context: { role: 'editor' }
      }

      const resource = extractResource(request)
      expect(resource).toEqual({
        type: 'articles',
        id: '123'
      })
    })

    it('should handle missing content type', () => {
      const request: RBACRequest = {
        params: {},
        context: { role: 'editor' }
      }

      const resource = extractResource(request)
      expect(resource).toEqual({
        type: 'unknown',
        id: undefined
      })
    })
  })

  describe('checkPermissions', () => {
    let mockRBACEngine: any

    beforeEach(() => {
      mockRBACEngine = {
        can: vi.fn()
      }
    })

    it('should allow request when permission is granted', async () => {
      mockRBACEngine.can.mockResolvedValue(true)

      const request: RBACRequest = {
        params: {
          contentType: 'articles'
        },
        context: { role: 'editor' }
      }

      const result = await checkPermissions(
        request,
        'GET',
        '/api/articles',
        mockRBACEngine
      )

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
      expect(mockRBACEngine.can).toHaveBeenCalledWith(
        { role: 'editor' },
        'read',
        { type: 'articles', id: undefined }
      )
    })

    it('should deny request when permission is denied', async () => {
      mockRBACEngine.can.mockResolvedValue(false)

      const request: RBACRequest = {
        params: {
          contentType: 'articles'
        },
        context: { role: 'public' }
      }

      const result = await checkPermissions(
        request,
        'POST',
        '/api/articles',
        mockRBACEngine
      )

      expect(result.success).toBe(false)
      expect(result.error).toEqual({
        status: 403,
        name: 'ForbiddenError',
        message: 'Insufficient permissions to create articles'
      })
    })

    it('should check permissions for update action', async () => {
      mockRBACEngine.can.mockResolvedValue(true)

      const request: RBACRequest = {
        params: {
          contentType: 'articles',
          id: '123'
        },
        context: { role: 'editor' }
      }

      const result = await checkPermissions(
        request,
        'PUT',
        '/api/articles/123',
        mockRBACEngine
      )

      expect(result.success).toBe(true)
      expect(mockRBACEngine.can).toHaveBeenCalledWith(
        { role: 'editor' },
        'update',
        { type: 'articles', id: '123' }
      )
    })

    it('should check permissions for delete action', async () => {
      mockRBACEngine.can.mockResolvedValue(false)

      const request: RBACRequest = {
        params: {
          contentType: 'articles',
          id: '123'
        },
        context: { role: 'editor' }
      }

      const result = await checkPermissions(
        request,
        'DELETE',
        '/api/articles/123',
        mockRBACEngine
      )

      expect(result.success).toBe(false)
      expect(result.error?.status).toBe(403)
      expect(mockRBACEngine.can).toHaveBeenCalledWith(
        { role: 'editor' },
        'delete',
        { type: 'articles', id: '123' }
      )
    })

    it('should check permissions for publish action', async () => {
      mockRBACEngine.can.mockResolvedValue(true)

      const request: RBACRequest = {
        params: {
          contentType: 'articles',
          id: '123'
        },
        context: { role: 'editor' }
      }

      const result = await checkPermissions(
        request,
        'POST',
        '/api/articles/123/publish',
        mockRBACEngine
      )

      expect(result.success).toBe(true)
      expect(mockRBACEngine.can).toHaveBeenCalledWith(
        { role: 'editor' },
        'publish',
        { type: 'articles', id: '123' }
      )
    })

    it('should check permissions for unpublish action', async () => {
      mockRBACEngine.can.mockResolvedValue(true)

      const request: RBACRequest = {
        params: {
          contentType: 'articles',
          id: '123'
        },
        context: { role: 'editor' }
      }

      const result = await checkPermissions(
        request,
        'POST',
        '/api/articles/123/unpublish',
        mockRBACEngine
      )

      expect(result.success).toBe(true)
      expect(mockRBACEngine.can).toHaveBeenCalledWith(
        { role: 'editor' },
        'unpublish',
        { type: 'articles', id: '123' }
      )
    })

    it('should handle RBAC engine errors', async () => {
      mockRBACEngine.can.mockRejectedValue(new Error('RBAC error'))

      const request: RBACRequest = {
        params: {
          contentType: 'articles'
        },
        context: { role: 'editor' }
      }

      const result = await checkPermissions(
        request,
        'GET',
        '/api/articles',
        mockRBACEngine
      )

      expect(result.success).toBe(false)
      expect(result.error).toEqual({
        status: 500,
        name: 'InternalServerError',
        message: 'Error checking permissions'
      })
    })

    it('should work with different roles', async () => {
      mockRBACEngine.can.mockResolvedValue(true)

      const adminRequest: RBACRequest = {
        params: { contentType: 'articles' },
        context: { role: 'admin' }
      }

      const result = await checkPermissions(
        adminRequest,
        'DELETE',
        '/api/articles/123',
        mockRBACEngine
      )

      expect(result.success).toBe(true)
      expect(mockRBACEngine.can).toHaveBeenCalledWith(
        { role: 'admin' },
        'delete',
        expect.any(Object)
      )
    })

    it('should pass resource ID to RBAC engine', async () => {
      mockRBACEngine.can.mockResolvedValue(true)

      const request: RBACRequest = {
        params: {
          contentType: 'articles',
          id: 'abc-123'
        },
        context: { role: 'authenticated' }
      }

      await checkPermissions(
        request,
        'PUT',
        '/api/articles/abc-123',
        mockRBACEngine
      )

      expect(mockRBACEngine.can).toHaveBeenCalledWith(
        { role: 'authenticated' },
        'update',
        { type: 'articles', id: 'abc-123' }
      )
    })
  })
})
