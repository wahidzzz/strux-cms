/**
 * Comprehensive Integration Tests for Content API
 * 
 * Tests complete CRUD workflow, query parameters, authentication,
 * authorization, and error responses for the content API.
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ContentRouteHandler } from '../content'
import type { ContentRequest, RequestContext } from '@cms/core'
import { ContentEngine, FileEngine, SchemaEngine, QueryEngine, GitEngine, RBACEngine } from '@cms/core'
import { authenticate } from '../../middleware/auth'
import { checkPermissions } from '../../middleware/rbac'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import jwt from 'jsonwebtoken'

describe('Content API Integration Tests', () => {
  let handler: ContentRouteHandler
  let contentEngine: ContentEngine
  let rbacEngine: RBACEngine
  let testDir: string
  let jwtSecret: string
  
  // Test contexts for different roles
  let adminContext: RequestContext
  let editorContext: RequestContext
  let authenticatedContext: RequestContext
  let publicContext: RequestContext
  
  // Test tokens
  let adminToken: string
  let editorToken: string
  let authenticatedToken: string

  beforeEach(async () => {
    // Create temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-api-test-'))
    jwtSecret = 'test-secret-key-for-integration-tests'

    // Initialize engines
    const fileEngine = new FileEngine(testDir)
    const schemaEngine = new SchemaEngine(path.join(testDir, 'schema'))
    const queryEngine = new QueryEngine(path.join(testDir, 'content'))
    const gitEngine = new GitEngine(testDir)
    
    // Create RBAC config with all roles
    const rbacConfigDir = path.join(testDir, '.cms')
    await fs.mkdir(rbacConfigDir, { recursive: true })
    await fs.writeFile(
      path.join(rbacConfigDir, 'rbac.json'),
      JSON.stringify({
        roles: {
          admin: {
            id: 'admin',
            name: 'Admin',
            description: 'Administrator with full access',
            type: 'admin',
            permissions: [
              { action: '*', subject: 'all' }
            ]
          },
          editor: {
            id: 'editor',
            name: 'Editor',
            description: 'Content editor',
            type: 'editor',
            permissions: [
              { action: 'create', subject: 'all' },
              { action: 'read', subject: 'all' },
              { action: 'update', subject: 'all' },
              { action: 'publish', subject: 'all' },
              { action: 'unpublish', subject: 'all' }
            ]
          },
          authenticated: {
            id: 'authenticated',
            name: 'Authenticated',
            description: 'Authenticated user',
            type: 'authenticated',
            permissions: [
              { action: 'read', subject: 'all' },
              { action: 'create', subject: 'all' }
            ]
          },
          public: {
            id: 'public',
            name: 'Public',
            description: 'Public access',
            type: 'public',
            permissions: [
              { action: 'read', subject: 'all' }
            ]
          }
        },
        defaultRole: 'public'
      })
    )
    
    rbacEngine = new RBACEngine(testDir)
    await rbacEngine.loadRBACConfig()

    // Initialize Git
    await gitEngine.execGit(['init'])
    await gitEngine.execGit(['config', 'user.name', 'Test User'])
    await gitEngine.execGit(['config', 'user.email', 'test@example.com'])

    // Create content engine
    contentEngine = new ContentEngine(
      testDir,
      fileEngine,
      schemaEngine,
      queryEngine,
      gitEngine,
      rbacEngine
    )

    // Create test schema
    await fs.mkdir(path.join(testDir, 'schema'), { recursive: true })
    await fs.writeFile(
      path.join(testDir, 'schema', 'article.schema.json'),
      JSON.stringify({
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: {
            type: 'string',
            required: true
          },
          content: {
            type: 'text',
            required: true
          },
          slug: {
            type: 'uid',
            targetField: 'title'
          },
          views: {
            type: 'number',
            default: 0
          },
          status: {
            type: 'enumeration',
            enum: ['draft', 'published', 'archived']
          }
        },
        options: {
          draftAndPublish: true
        }
      })
    )

    await schemaEngine.loadAllSchemas()
    
    // Create content directory for the article content type
    await fs.mkdir(path.join(testDir, 'content', 'api', 'article'), { recursive: true })
    
    await queryEngine.rebuildAllIndexes()

    // Create handler
    handler = new ContentRouteHandler()

    // Create test contexts
    adminContext = {
      user: {
        id: 'admin-user',
        email: 'admin@test.com',
        role: 'admin'
      },
      role: 'admin'
    }

    editorContext = {
      user: {
        id: 'editor-user',
        email: 'editor@test.com',
        role: 'editor'
      },
      role: 'editor'
    }

    authenticatedContext = {
      user: {
        id: 'auth-user',
        email: 'user@test.com',
        role: 'authenticated'
      },
      role: 'authenticated'
    }

    publicContext = {
      role: 'public'
    }

    // Create test tokens
    adminToken = jwt.sign(
      { id: 'admin-user', role: 'admin' },
      jwtSecret,
      { expiresIn: '7d' }
    )

    editorToken = jwt.sign(
      { id: 'editor-user', role: 'editor' },
      jwtSecret,
      { expiresIn: '7d' }
    )

    authenticatedToken = jwt.sign(
      { id: 'auth-user', role: 'authenticated' },
      jwtSecret,
      { expiresIn: '7d' }
    )
  })

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('Complete CRUD Workflow', () => {
    it('should complete full CRUD lifecycle: create → read → update → delete', async () => {
      // Step 1: Create entry
      const createRequest: ContentRequest = {
        params: { contentType: 'article' },
        body: {
          data: {
            title: 'Test Article',
            content: 'This is test content',
            status: 'draft'
          }
        },
        context: adminContext
      }

      const createResponse = await handler.create(createRequest, contentEngine)
      expect(createResponse.data).toBeDefined()
      expect(createResponse.data?.title).toBe('Test Article')
      expect(createResponse.data?.id).toBeDefined()
      expect(createResponse.data?.createdAt).toBeDefined()
      expect(createResponse.data?.updatedAt).toBeDefined()

      const entryId = createResponse.data!.id

      // Step 2: Read entry (findOne)
      const findOneRequest: ContentRequest = {
        params: { contentType: 'article', id: entryId },
        context: adminContext
      }

      const findOneResponse = await handler.findOne(findOneRequest, contentEngine)
      expect(findOneResponse.data).toBeDefined()
      expect(findOneResponse.data?.id).toBe(entryId)
      expect(findOneResponse.data?.title).toBe('Test Article')

      // Step 3: Read entries (findMany)
      const findManyRequest: ContentRequest = {
        params: { contentType: 'article' },
        context: adminContext
      }

      const findManyResponse = await handler.findMany(findManyRequest, contentEngine)
      expect(findManyResponse.data).toBeDefined()
      expect(findManyResponse.data?.length).toBeGreaterThan(0)
      expect(findManyResponse.meta).toBeDefined()

      // Step 4: Update entry
      const updateRequest: ContentRequest = {
        params: { contentType: 'article', id: entryId },
        body: {
          data: {
            title: 'Updated Article',
            content: 'Updated content'
          }
        },
        context: adminContext
      }

      const updateResponse = await handler.update(updateRequest, contentEngine)
      expect(updateResponse.data).toBeDefined()
      expect(updateResponse.data?.title).toBe('Updated Article')
      expect(updateResponse.data?.content).toBe('Updated content')
      expect(updateResponse.data?.updatedAt).not.toBe(createResponse.data?.updatedAt)

      // Step 5: Delete entry
      const deleteRequest: ContentRequest = {
        params: { contentType: 'article', id: entryId },
        context: adminContext
      }

      const deleteResponse = await handler.delete(deleteRequest, contentEngine)
      expect(deleteResponse.data).toBeDefined()
      expect(deleteResponse.data?.id).toBe(entryId)

      // Step 6: Verify deletion
      const verifyRequest: ContentRequest = {
        params: { contentType: 'article', id: entryId },
        context: adminContext
      }

      const verifyResponse = await handler.findOne(verifyRequest, contentEngine)
      expect(verifyResponse.error).toBeDefined()
      expect(verifyResponse.error?.status).toBe(404)
    })
  })

  describe('Query Parameters', () => {
    beforeEach(async () => {
      // Create test data
      const articles = [
        { title: 'First Article', content: 'Content 1', views: 100, status: 'published' },
        { title: 'Second Article', content: 'Content 2', views: 200, status: 'draft' },
        { title: 'Third Article', content: 'Content 3', views: 150, status: 'published' },
        { title: 'Tutorial: Getting Started', content: 'Tutorial content', views: 300, status: 'published' },
        { title: 'Guide: Advanced Topics', content: 'Guide content', views: 50, status: 'draft' }
      ]

      for (const article of articles) {
        const request: ContentRequest = {
          params: { contentType: 'article' },
          body: { data: article },
          context: adminContext
        }
        const response = await handler.create(request, contentEngine)
        
        // Publish some articles
        if (article.status === 'published') {
          await handler.publish(
            { params: { contentType: 'article', id: response.data!.id }, context: adminContext },
            contentEngine
          )
        }
      }
    })

    it('should filter entries with $eq operator', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        query: {
          filters: {
            status: { $eq: 'draft' }
          }
        },
        context: adminContext
      }

      const response = await handler.findMany(request, contentEngine)
      expect(response.data).toBeDefined()
      expect(response.data?.every(e => e.status === 'draft')).toBe(true)
    })

    it('should filter entries with $gt operator', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        query: {
          filters: {
            views: { $gt: 150 }
          }
        },
        context: adminContext
      }

      const response = await handler.findMany(request, contentEngine)
      expect(response.data).toBeDefined()
      expect(response.data?.every(e => (e.views as number) > 150)).toBe(true)
    })

    it('should filter entries with $contains operator', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        query: {
          filters: {
            title: { $contains: 'Tutorial' }
          }
        },
        context: adminContext
      }

      const response = await handler.findMany(request, contentEngine)
      expect(response.data).toBeDefined()
      expect(response.data?.length).toBeGreaterThan(0)
      expect(response.data?.every(e => (e.title as string).includes('Tutorial'))).toBe(true)
    })

    it('should filter entries with $in operator', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        query: {
          filters: {
            status: { $in: ['draft', 'archived'] }
          }
        },
        context: adminContext
      }

      const response = await handler.findMany(request, contentEngine)
      expect(response.data).toBeDefined()
      expect(response.data?.every(e => ['draft', 'archived'].includes(e.status as string))).toBe(true)
    })

    it('should filter entries with $and logical operator', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        query: {
          filters: {
            $and: [
              { views: { $gte: 100 } },
              { status: { $eq: 'published' } }
            ]
          }
        },
        context: adminContext
      }

      const response = await handler.findMany(request, contentEngine)
      expect(response.data).toBeDefined()
      expect(response.data?.every(e => 
        (e.views as number) >= 100 && e.status === 'published'
      )).toBe(true)
    })

    it('should sort entries ascending', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        query: {
          sort: 'views:asc'
        },
        context: adminContext
      }

      const response = await handler.findMany(request, contentEngine)
      expect(response.data).toBeDefined()
      
      const views = response.data!.map(e => e.views as number)
      for (let i = 1; i < views.length; i++) {
        expect(views[i]).toBeGreaterThanOrEqual(views[i - 1])
      }
    })

    it('should sort entries descending', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        query: {
          sort: 'views:desc'
        },
        context: adminContext
      }

      const response = await handler.findMany(request, contentEngine)
      expect(response.data).toBeDefined()
      
      const views = response.data!.map(e => e.views as number)
      for (let i = 1; i < views.length; i++) {
        expect(views[i]).toBeLessThanOrEqual(views[i - 1])
      }
    })

    it('should paginate results with page/pageSize', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        query: {
          pagination: {
            page: 1,
            pageSize: 2
          }
        },
        context: adminContext
      }

      const response = await handler.findMany(request, contentEngine)
      expect(response.data).toBeDefined()
      expect(response.data?.length).toBeLessThanOrEqual(2)
      expect(response.meta).toBeDefined()
      expect(response.meta?.pagination).toBeDefined()
    })

    it('should paginate results with start/limit', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        query: {
          pagination: {
            start: 1,
            limit: 2
          }
        },
        context: adminContext
      }

      const response = await handler.findMany(request, contentEngine)
      expect(response.data).toBeDefined()
      expect(response.data?.length).toBeLessThanOrEqual(2)
    })

    it('should select specific fields', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        query: {
          fields: 'id,title'
        },
        context: adminContext
      }

      const response = await handler.findMany(request, contentEngine)
      expect(response.data).toBeDefined()
      
      if (response.data && response.data.length > 0) {
        const entry = response.data[0]
        expect(entry.id).toBeDefined()
        expect(entry.title).toBeDefined()
        // Content should not be included
        expect(entry.content).toBeUndefined()
      }
    })

    it('should filter by publication state (live)', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        query: {
          publicationState: 'live'
        },
        context: adminContext
      }

      const response = await handler.findMany(request, contentEngine)
      expect(response.data).toBeDefined()
      expect(response.data?.every(e => e.publishedAt !== null)).toBe(true)
    })

    it('should filter by publication state (preview)', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        query: {
          publicationState: 'preview'
        },
        context: adminContext
      }

      const response = await handler.findMany(request, contentEngine)
      expect(response.data).toBeDefined()
      // Preview should include both published and draft
      expect(response.data?.length).toBeGreaterThan(0)
    })

    it('should combine multiple query parameters', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        query: {
          filters: {
            views: { $gte: 100 }
          },
          sort: 'views:desc',
          pagination: {
            page: 1,
            pageSize: 10
          },
          fields: 'id,title,views',
          publicationState: 'preview'
        },
        context: adminContext
      }

      const response = await handler.findMany(request, contentEngine)
      expect(response.data).toBeDefined()
      expect(response.data?.every(e => (e.views as number) >= 100)).toBe(true)
      
      if (response.data && response.data.length > 1) {
        const views = response.data.map(e => e.views as number)
        for (let i = 1; i < views.length; i++) {
          expect(views[i]).toBeLessThanOrEqual(views[i - 1])
        }
      }
    })
  })

  describe('Authentication', () => {
    it('should authenticate valid admin token', () => {
      const authRequest = {
        headers: {
          authorization: `Bearer ${adminToken}`
        }
      }

      const result = authenticate(authRequest, jwtSecret)
      expect(result.success).toBe(true)
      expect(result.context?.role).toBe('admin')
    })

    it('should authenticate valid editor token', () => {
      const authRequest = {
        headers: {
          authorization: `Bearer ${editorToken}`
        }
      }

      const result = authenticate(authRequest, jwtSecret)
      expect(result.success).toBe(true)
      expect(result.context?.role).toBe('editor')
    })

    it('should reject missing authorization header', () => {
      const authRequest = {
        headers: {}
      }

      const result = authenticate(authRequest, jwtSecret)
      expect(result.success).toBe(false)
      expect(result.error?.status).toBe(401)
      expect(result.error?.name).toBe('UnauthorizedError')
    })

    it('should reject invalid token format', () => {
      const authRequest = {
        headers: {
          authorization: 'InvalidFormat'
        }
      }

      const result = authenticate(authRequest, jwtSecret)
      expect(result.success).toBe(false)
      expect(result.error?.status).toBe(401)
    })

    it('should reject expired token', () => {
      const expiredToken = jwt.sign(
        { id: 'user-123', role: 'admin' },
        jwtSecret,
        { expiresIn: '-1h' } // Expired 1 hour ago
      )

      const authRequest = {
        headers: {
          authorization: `Bearer ${expiredToken}`
        }
      }

      const result = authenticate(authRequest, jwtSecret)
      expect(result.success).toBe(false)
      expect(result.error?.status).toBe(401)
    })

    it('should reject token with invalid signature', () => {
      const invalidToken = jwt.sign(
        { id: 'user-123', role: 'admin' },
        'wrong-secret'
      )

      const authRequest = {
        headers: {
          authorization: `Bearer ${invalidToken}`
        }
      }

      const result = authenticate(authRequest, jwtSecret)
      expect(result.success).toBe(false)
      expect(result.error?.status).toBe(401)
    })

    it('should reject malformed token', () => {
      const authRequest = {
        headers: {
          authorization: 'Bearer not.a.valid.jwt'
        }
      }

      const result = authenticate(authRequest, jwtSecret)
      expect(result.success).toBe(false)
      expect(result.error?.status).toBe(401)
    })
  })

  describe('Authorization (RBAC)', () => {
    it('should allow admin to perform all operations', async () => {
      // Admin can create
      const createResult = await checkPermissions(
        { params: { contentType: 'article' }, context: adminContext },
        'POST',
        '/api/article',
        rbacEngine
      )
      expect(createResult.success).toBe(true)

      // Admin can read
      const readResult = await checkPermissions(
        { params: { contentType: 'article' }, context: adminContext },
        'GET',
        '/api/article',
        rbacEngine
      )
      expect(readResult.success).toBe(true)

      // Admin can update
      const updateResult = await checkPermissions(
        { params: { contentType: 'article', id: '123' }, context: adminContext },
        'PUT',
        '/api/article/123',
        rbacEngine
      )
      expect(updateResult.success).toBe(true)

      // Admin can delete
      const deleteResult = await checkPermissions(
        { params: { contentType: 'article', id: '123' }, context: adminContext },
        'DELETE',
        '/api/article/123',
        rbacEngine
      )
      expect(deleteResult.success).toBe(true)

      // Admin can publish
      const publishResult = await checkPermissions(
        { params: { contentType: 'article', id: '123' }, context: adminContext },
        'POST',
        '/api/article/123/publish',
        rbacEngine
      )
      expect(publishResult.success).toBe(true)
    })

    it('should allow editor to create, read, update, publish but not delete', async () => {
      // Editor can create
      const createResult = await checkPermissions(
        { params: { contentType: 'article' }, context: editorContext },
        'POST',
        '/api/article',
        rbacEngine
      )
      expect(createResult.success).toBe(true)

      // Editor can read
      const readResult = await checkPermissions(
        { params: { contentType: 'article' }, context: editorContext },
        'GET',
        '/api/article',
        rbacEngine
      )
      expect(readResult.success).toBe(true)

      // Editor can update
      const updateResult = await checkPermissions(
        { params: { contentType: 'article', id: '123' }, context: editorContext },
        'PUT',
        '/api/article/123',
        rbacEngine
      )
      expect(updateResult.success).toBe(true)

      // Editor can publish
      const publishResult = await checkPermissions(
        { params: { contentType: 'article', id: '123' }, context: editorContext },
        'POST',
        '/api/article/123/publish',
        rbacEngine
      )
      expect(publishResult.success).toBe(true)

      // Editor cannot delete
      const deleteResult = await checkPermissions(
        { params: { contentType: 'article', id: '123' }, context: editorContext },
        'DELETE',
        '/api/article/123',
        rbacEngine
      )
      expect(deleteResult.success).toBe(false)
      expect(deleteResult.error?.status).toBe(403)
    })

    it('should allow authenticated user to read and create only', async () => {
      // Authenticated can read
      const readResult = await checkPermissions(
        { params: { contentType: 'article' }, context: authenticatedContext },
        'GET',
        '/api/article',
        rbacEngine
      )
      expect(readResult.success).toBe(true)

      // Authenticated can create
      const createResult = await checkPermissions(
        { params: { contentType: 'article' }, context: authenticatedContext },
        'POST',
        '/api/article',
        rbacEngine
      )
      expect(createResult.success).toBe(true)

      // Authenticated cannot update
      const updateResult = await checkPermissions(
        { params: { contentType: 'article', id: '123' }, context: authenticatedContext },
        'PUT',
        '/api/article/123',
        rbacEngine
      )
      expect(updateResult.success).toBe(false)
      expect(updateResult.error?.status).toBe(403)

      // Authenticated cannot delete
      const deleteResult = await checkPermissions(
        { params: { contentType: 'article', id: '123' }, context: authenticatedContext },
        'DELETE',
        '/api/article/123',
        rbacEngine
      )
      expect(deleteResult.success).toBe(false)

      // Authenticated cannot publish
      const publishResult = await checkPermissions(
        { params: { contentType: 'article', id: '123' }, context: authenticatedContext },
        'POST',
        '/api/article/123/publish',
        rbacEngine
      )
      expect(publishResult.success).toBe(false)
    })

    it('should allow public user to read only', async () => {
      // Public can read
      const readResult = await checkPermissions(
        { params: { contentType: 'article' }, context: publicContext },
        'GET',
        '/api/article',
        rbacEngine
      )
      expect(readResult.success).toBe(true)

      // Public cannot create
      const createResult = await checkPermissions(
        { params: { contentType: 'article' }, context: publicContext },
        'POST',
        '/api/article',
        rbacEngine
      )
      expect(createResult.success).toBe(false)
      expect(createResult.error?.status).toBe(403)

      // Public cannot update
      const updateResult = await checkPermissions(
        { params: { contentType: 'article', id: '123' }, context: publicContext },
        'PUT',
        '/api/article/123',
        rbacEngine
      )
      expect(updateResult.success).toBe(false)

      // Public cannot delete
      const deleteResult = await checkPermissions(
        { params: { contentType: 'article', id: '123' }, context: publicContext },
        'DELETE',
        '/api/article/123',
        rbacEngine
      )
      expect(deleteResult.success).toBe(false)
    })

    it('should enforce permissions in actual API calls', async () => {
      // Public user tries to create (should fail)
      const createRequest: ContentRequest = {
        params: { contentType: 'article' },
        body: {
          data: {
            title: 'Unauthorized Article',
            content: 'This should fail'
          }
        },
        context: publicContext
      }

      const createResponse = await handler.create(createRequest, contentEngine)
      expect(createResponse.error).toBeDefined()
      expect(createResponse.error?.status).toBe(403)
      expect(createResponse.error?.name).toBe('ForbiddenError')
    })
  })

  describe('Error Responses', () => {
    it('should return 400 for validation errors', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        body: {
          data: {
            // Missing required fields: title and content
            status: 'draft'
          }
        },
        context: adminContext
      }

      const response = await handler.create(request, contentEngine)
      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('ValidationError')
    })

    it('should return 400 for missing request body', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        body: {},
        context: adminContext
      }

      const response = await handler.create(request, contentEngine)
      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.message).toContain('data object')
    })

    it('should return 400 for missing entry ID', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        context: adminContext
      }

      const response = await handler.findOne(request, contentEngine)
      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.message).toContain('Entry ID is required')
    })

    it('should return 401 for missing authentication', () => {
      const authRequest = {
        headers: {}
      }

      const result = authenticate(authRequest, jwtSecret)
      expect(result.success).toBe(false)
      expect(result.error?.status).toBe(401)
      expect(result.error?.name).toBe('UnauthorizedError')
    })

    it('should return 401 for invalid token', () => {
      const authRequest = {
        headers: {
          authorization: 'Bearer invalid.token.here'
        }
      }

      const result = authenticate(authRequest, jwtSecret)
      expect(result.success).toBe(false)
      expect(result.error?.status).toBe(401)
    })

    it('should return 403 for insufficient permissions', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        body: {
          data: {
            title: 'Test',
            content: 'Test'
          }
        },
        context: publicContext
      }

      const response = await handler.create(request, contentEngine)
      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(403)
      expect(response.error?.name).toBe('ForbiddenError')
    })

    it('should return 404 for non-existent entry', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article', id: 'non-existent-id' },
        context: adminContext
      }

      const response = await handler.findOne(request, contentEngine)
      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(404)
      expect(response.error?.message).toContain('not found')
    })

    it('should return 404 when updating non-existent entry', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article', id: 'non-existent-id' },
        body: {
          data: {
            title: 'Updated'
          }
        },
        context: adminContext
      }

      const response = await handler.update(request, contentEngine)
      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(404)
    })

    it('should return 404 when deleting non-existent entry', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article', id: 'non-existent-id' },
        context: adminContext
      }

      const response = await handler.delete(request, contentEngine)
      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(404)
    })

    it('should return 409 for unique constraint violations', async () => {
      // Create first entry
      const firstRequest: ContentRequest = {
        params: { contentType: 'article' },
        body: {
          data: {
            title: 'Unique Title',
            content: 'Content',
            slug: 'unique-slug'
          }
        },
        context: adminContext
      }

      await handler.create(firstRequest, contentEngine)

      // Try to create second entry with same slug
      const secondRequest: ContentRequest = {
        params: { contentType: 'article' },
        body: {
          data: {
            title: 'Another Title',
            content: 'Content',
            slug: 'unique-slug'
          }
        },
        context: adminContext
      }

      const response = await handler.create(secondRequest, contentEngine)
      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(409)
      expect(response.error?.name).toBe('ConflictError')
    })

    it('should return 500 for internal server errors', async () => {
      // Create a mock engine that throws an unexpected error
      const brokenEngine = {
        ...contentEngine,
        findMany: async () => {
          throw new Error('Unexpected internal error')
        }
      }

      const request: ContentRequest = {
        params: { contentType: 'article' },
        context: adminContext
      }

      const response = await handler.findMany(request, brokenEngine)
      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(500)
      // 500 errors use generic message
      expect(response.error?.message).toBe('An unexpected error occurred. Please try again later.')
    })
  })

  describe('Publish/Unpublish Workflow', () => {
    it('should publish draft entry', async () => {
      // Create draft
      const createRequest: ContentRequest = {
        params: { contentType: 'article' },
        body: {
          data: {
            title: 'Draft Article',
            content: 'Draft content'
          }
        },
        context: adminContext
      }

      const createResponse = await handler.create(createRequest, contentEngine)
      expect(createResponse.data?.publishedAt).toBeNull()

      const entryId = createResponse.data!.id

      // Publish
      const publishRequest: ContentRequest = {
        params: { contentType: 'article', id: entryId },
        context: adminContext
      }

      const publishResponse = await handler.publish(publishRequest, contentEngine)
      expect(publishResponse.data?.publishedAt).not.toBeNull()
      expect(typeof publishResponse.data?.publishedAt).toBe('string')
    })

    it('should unpublish published entry', async () => {
      // Create and publish
      const createRequest: ContentRequest = {
        params: { contentType: 'article' },
        body: {
          data: {
            title: 'Published Article',
            content: 'Published content'
          }
        },
        context: adminContext
      }

      const createResponse = await handler.create(createRequest, contentEngine)
      const entryId = createResponse.data!.id

      await handler.publish(
        { params: { contentType: 'article', id: entryId }, context: adminContext },
        contentEngine
      )

      // Unpublish
      const unpublishRequest: ContentRequest = {
        params: { contentType: 'article', id: entryId },
        context: adminContext
      }

      const unpublishResponse = await handler.unpublish(unpublishRequest, contentEngine)
      expect(unpublishResponse.data?.publishedAt).toBeNull()
    })

    it('should filter published entries with publicationState=live', async () => {
      // Create multiple entries
      const entries = []
      for (let i = 0; i < 3; i++) {
        const request: ContentRequest = {
          params: { contentType: 'article' },
          body: {
            data: {
              title: `Article ${i}`,
              content: `Content ${i}`
            }
          },
          context: adminContext
        }
        const response = await handler.create(request, contentEngine)
        entries.push(response.data!)
      }

      // Publish only first two
      for (let i = 0; i < 2; i++) {
        await handler.publish(
          { params: { contentType: 'article', id: entries[i].id }, context: adminContext },
          contentEngine
        )
      }

      // Query for live entries
      const liveRequest: ContentRequest = {
        params: { contentType: 'article' },
        query: {
          publicationState: 'live'
        },
        context: adminContext
      }

      const liveResponse = await handler.findMany(liveRequest, contentEngine)
      expect(liveResponse.data?.length).toBe(2)
      expect(liveResponse.data?.every(e => e.publishedAt !== null)).toBe(true)
    })

    it('should include all entries with publicationState=preview', async () => {
      // Create entries with mixed publication states
      const draftRequest: ContentRequest = {
        params: { contentType: 'article' },
        body: {
          data: {
            title: 'Draft',
            content: 'Draft'
          }
        },
        context: adminContext
      }

      const publishedRequest: ContentRequest = {
        params: { contentType: 'article' },
        body: {
          data: {
            title: 'Published',
            content: 'Published'
          }
        },
        context: adminContext
      }

      const draftResponse = await handler.create(draftRequest, contentEngine)
      const publishedResponse = await handler.create(publishedRequest, contentEngine)

      await handler.publish(
        { params: { contentType: 'article', id: publishedResponse.data!.id }, context: adminContext },
        contentEngine
      )

      // Query for preview (all entries)
      const previewRequest: ContentRequest = {
        params: { contentType: 'article' },
        query: {
          publicationState: 'preview'
        },
        context: adminContext
      }

      const previewResponse = await handler.findMany(previewRequest, contentEngine)
      expect(previewResponse.data?.length).toBeGreaterThanOrEqual(2)
    })

    it('should handle publish → unpublish → publish cycle', async () => {
      const createRequest: ContentRequest = {
        params: { contentType: 'article' },
        body: {
          data: {
            title: 'Cycle Test',
            content: 'Testing cycle'
          }
        },
        context: adminContext
      }

      const createResponse = await handler.create(createRequest, contentEngine)
      const entryId = createResponse.data!.id

      // First publish
      const publishRequest: ContentRequest = {
        params: { contentType: 'article', id: entryId },
        context: adminContext
      }

      const firstPublish = await handler.publish(publishRequest, contentEngine)
      expect(firstPublish.data?.publishedAt).not.toBeNull()
      const firstPublishedAt = firstPublish.data?.publishedAt

      // Unpublish
      const unpublishResponse = await handler.unpublish(publishRequest, contentEngine)
      expect(unpublishResponse.data?.publishedAt).toBeNull()

      // Second publish
      const secondPublish = await handler.publish(publishRequest, contentEngine)
      expect(secondPublish.data?.publishedAt).not.toBeNull()
      expect(secondPublish.data?.publishedAt).not.toBe(firstPublishedAt)
    })
  })

  describe('Edge Cases and Complex Scenarios', () => {
    it('should handle concurrent creates', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => ({
        params: { contentType: 'article' },
        body: {
          data: {
            title: `Concurrent Article ${i}`,
            content: `Content ${i}`
          }
        },
        context: adminContext
      }))

      const responses = await Promise.all(
        requests.map(req => handler.create(req as ContentRequest, contentEngine))
      )

      // All should succeed
      expect(responses.every(r => r.data !== undefined)).toBe(true)
      
      // All should have unique IDs
      const ids = responses.map(r => r.data!.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(5)
    })

    it('should handle empty result sets', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        query: {
          filters: {
            title: { $eq: 'Non-existent Title That Will Never Match' }
          }
        },
        context: adminContext
      }

      const response = await handler.findMany(request, contentEngine)
      expect(response.data).toBeDefined()
      expect(response.data?.length).toBe(0)
      expect(response.meta).toBeDefined()
    })

    it('should handle updates to non-existent fields gracefully', async () => {
      const createRequest: ContentRequest = {
        params: { contentType: 'article' },
        body: {
          data: {
            title: 'Test',
            content: 'Test'
          }
        },
        context: adminContext
      }

      const createResponse = await handler.create(createRequest, contentEngine)
      const entryId = createResponse.data!.id

      // Update with extra field (should be allowed by schema)
      const updateRequest: ContentRequest = {
        params: { contentType: 'article', id: entryId },
        body: {
          data: {
            title: 'Updated',
            nonExistentField: 'This should be ignored or cause validation error'
          }
        },
        context: adminContext
      }

      const updateResponse = await handler.update(updateRequest, contentEngine)
      // Should either succeed (ignoring extra field) or fail with validation error
      if (updateResponse.error) {
        expect(updateResponse.error.status).toBe(400)
      } else {
        expect(updateResponse.data?.title).toBe('Updated')
      }
    })

    it('should maintain data integrity across operations', async () => {
      // Create entry
      const createRequest: ContentRequest = {
        params: { contentType: 'article' },
        body: {
          data: {
            title: 'Integrity Test',
            content: 'Original content',
            views: 100
          }
        },
        context: adminContext
      }

      const createResponse = await handler.create(createRequest, contentEngine)
      const entryId = createResponse.data!.id
      const createdAt = createResponse.data!.createdAt

      // Update entry
      const updateRequest: ContentRequest = {
        params: { contentType: 'article', id: entryId },
        body: {
          data: {
            content: 'Updated content',
            views: 200
          }
        },
        context: adminContext
      }

      const updateResponse = await handler.update(updateRequest, contentEngine)

      // Verify integrity
      expect(updateResponse.data?.id).toBe(entryId)
      expect(updateResponse.data?.title).toBe('Integrity Test') // Unchanged
      expect(updateResponse.data?.content).toBe('Updated content') // Changed
      expect(updateResponse.data?.views).toBe(200) // Changed
      expect(updateResponse.data?.createdAt).toBe(createdAt) // Unchanged
      expect(updateResponse.data?.updatedAt).not.toBe(createdAt) // Changed
    })
  })
})
