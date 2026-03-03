/**
 * Integration tests for publish/unpublish endpoints
 * 
 * These tests verify that the publish and unpublish endpoints work correctly
 * with the ContentEngine and handle all edge cases properly.
 * 
 * Requirements: 5.1, 5.2, 13.6
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ContentRouteHandler } from '../content'
import type { ContentRequest, ContentEntry, RequestContext } from '@cms/core'
import { ContentEngine } from '@cms/core'
import { FileEngine } from '@cms/core'
import { SchemaEngine } from '@cms/core'
import { QueryEngine } from '@cms/core'
import { GitEngine } from '@cms/core'
import { RBACEngine } from '@cms/core'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

describe('Publish/Unpublish Integration Tests', () => {
  let handler: ContentRouteHandler
  let contentEngine: ContentEngine
  let testDir: string
  let adminContext: RequestContext

  beforeEach(async () => {
    // Create temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-publish-test-'))

    // Initialize engines
    const fileEngine = new FileEngine(testDir)
    const schemaEngine = new SchemaEngine(path.join(testDir, 'schema'))
    const queryEngine = new QueryEngine(path.join(testDir, 'content'))
    const gitEngine = new GitEngine(testDir)
    
    // Create RBAC config
    const rbacConfigDir = path.join(testDir, '.cms')
    await fs.mkdir(rbacConfigDir, { recursive: true })
    await fs.writeFile(
      path.join(rbacConfigDir, 'rbac.json'),
      JSON.stringify({
        roles: {
          admin: {
            id: 'admin',
            name: 'Admin',
            description: 'Administrator',
            type: 'admin',
            permissions: [
              { action: '*', subject: 'all' }
            ]
          },
          public: {
            id: 'public',
            name: 'Public',
            description: 'Public role',
            type: 'public',
            permissions: [
              { action: 'read', subject: 'all' }
            ]
          }
        },
        defaultRole: 'public'
      })
    )
    
    const rbacEngine = new RBACEngine(testDir)
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
          }
        },
        options: {
          draftAndPublish: true
        }
      })
    )

    await schemaEngine.loadAllSchemas()
    await queryEngine.rebuildAllIndexes()

    // Create handler
    handler = new ContentRouteHandler()

    // Create admin context
    adminContext = {
      user: {
        id: 'admin-user',
        email: 'admin@test.com',
        role: 'admin'
      },
      role: 'admin'
    }
  })

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('POST /api/:contentType/:id/publish', () => {
    it('should publish a draft entry', async () => {
      // Create a draft entry
      const createRequest: ContentRequest = {
        params: { contentType: 'article' },
        body: {
          data: {
            title: 'Test Article',
            content: 'This is a test article'
          }
        },
        context: adminContext
      }

      const createResponse = await handler.create(createRequest, contentEngine)
      expect(createResponse.data).toBeDefined()
      expect(createResponse.data?.publishedAt).toBeNull()

      const entryId = createResponse.data!.id

      // Publish the entry
      const publishRequest: ContentRequest = {
        params: { contentType: 'article', id: entryId },
        context: adminContext
      }

      const publishResponse = await handler.publish(publishRequest, contentEngine)

      // Verify response
      expect(publishResponse.data).toBeDefined()
      expect(publishResponse.data?.id).toBe(entryId)
      expect(publishResponse.data?.publishedAt).toBeDefined()
      expect(publishResponse.data?.publishedAt).not.toBeNull()
      expect(typeof publishResponse.data?.publishedAt).toBe('string')

      // Verify the entry is actually published
      const findRequest: ContentRequest = {
        params: { contentType: 'article', id: entryId },
        context: adminContext
      }

      const findResponse = await handler.findOne(findRequest, contentEngine)
      expect(findResponse.data?.publishedAt).toBeDefined()
      expect(findResponse.data?.publishedAt).not.toBeNull()
    })

    it('should return 400 if id is missing', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        context: adminContext
      }

      const response = await handler.publish(request, contentEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.message).toContain('Entry ID is required')
    })

    it('should return error if entry does not exist', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article', id: 'non-existent-id' },
        context: adminContext
      }

      const response = await handler.publish(request, contentEngine)

      expect(response.error).toBeDefined()
      // Error handler maps "Index not found" to 404
      expect(response.error?.status).toBe(404)
    })
  })

  describe('POST /api/:contentType/:id/unpublish', () => {
    it('should unpublish a published entry', async () => {
      // Create and publish an entry
      const createRequest: ContentRequest = {
        params: { contentType: 'article' },
        body: {
          data: {
            title: 'Published Article',
            content: 'This article will be unpublished'
          }
        },
        context: adminContext
      }

      const createResponse = await handler.create(createRequest, contentEngine)
      const entryId = createResponse.data!.id

      // Publish it first
      const publishRequest: ContentRequest = {
        params: { contentType: 'article', id: entryId },
        context: adminContext
      }

      await handler.publish(publishRequest, contentEngine)

      // Unpublish the entry
      const unpublishRequest: ContentRequest = {
        params: { contentType: 'article', id: entryId },
        context: adminContext
      }

      const unpublishResponse = await handler.unpublish(unpublishRequest, contentEngine)

      // Verify response
      expect(unpublishResponse.data).toBeDefined()
      expect(unpublishResponse.data?.id).toBe(entryId)
      expect(unpublishResponse.data?.publishedAt).toBeNull()

      // Verify the entry is actually unpublished
      const findRequest: ContentRequest = {
        params: { contentType: 'article', id: entryId },
        context: adminContext
      }

      const findResponse = await handler.findOne(findRequest, contentEngine)
      expect(findResponse.data?.publishedAt).toBeNull()
    })

    it('should return 400 if id is missing', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article' },
        context: adminContext
      }

      const response = await handler.unpublish(request, contentEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.message).toContain('Entry ID is required')
    })

    it('should return error if entry does not exist', async () => {
      const request: ContentRequest = {
        params: { contentType: 'article', id: 'non-existent-id' },
        context: adminContext
      }

      const response = await handler.unpublish(request, contentEngine)

      expect(response.error).toBeDefined()
      // Error handler maps "Index not found" to 404
      expect(response.error?.status).toBe(404)
    })
  })

  describe('Complete publish/unpublish workflow', () => {
    it('should handle draft -> publish -> unpublish -> publish cycle', async () => {
      // Step 1: Create draft
      const createRequest: ContentRequest = {
        params: { contentType: 'article' },
        body: {
          data: {
            title: 'Workflow Test Article',
            content: 'Testing the complete workflow'
          }
        },
        context: adminContext
      }

      const createResponse = await handler.create(createRequest, contentEngine)
      const entryId = createResponse.data!.id
      expect(createResponse.data?.publishedAt).toBeNull()

      // Step 2: Publish
      const publishRequest: ContentRequest = {
        params: { contentType: 'article', id: entryId },
        context: adminContext
      }

      const publishResponse = await handler.publish(publishRequest, contentEngine)
      expect(publishResponse.data?.publishedAt).not.toBeNull()
      const firstPublishedAt = publishResponse.data?.publishedAt

      // Step 3: Unpublish
      const unpublishRequest: ContentRequest = {
        params: { contentType: 'article', id: entryId },
        context: adminContext
      }

      const unpublishResponse = await handler.unpublish(unpublishRequest, contentEngine)
      expect(unpublishResponse.data?.publishedAt).toBeNull()

      // Step 4: Publish again
      const republishResponse = await handler.publish(publishRequest, contentEngine)
      expect(republishResponse.data?.publishedAt).not.toBeNull()
      expect(republishResponse.data?.publishedAt).not.toBe(firstPublishedAt) // Should have new timestamp

      // Verify final state
      const findRequest: ContentRequest = {
        params: { contentType: 'article', id: entryId },
        context: adminContext
      }

      const findResponse = await handler.findOne(findRequest, contentEngine)
      expect(findResponse.data?.publishedAt).not.toBeNull()
      expect(findResponse.data?.title).toBe('Workflow Test Article')
    })
  })

  describe('Publication state filtering', () => {
    it('should filter entries based on publication state', async () => {
      // Create multiple entries with different publication states
      const entries = []
      
      for (let i = 0; i < 3; i++) {
        const createRequest: ContentRequest = {
          params: { contentType: 'article' },
          body: {
            data: {
              title: `Article ${i}`,
              content: `Content ${i}`
            }
          },
          context: adminContext
        }

        const response = await handler.create(createRequest, contentEngine)
        entries.push(response.data!)
      }

      // Publish only the first two entries
      for (let i = 0; i < 2; i++) {
        const publishRequest: ContentRequest = {
          params: { contentType: 'article', id: entries[i].id },
          context: adminContext
        }

        await handler.publish(publishRequest, contentEngine)
      }

      // Query for live entries only
      const liveRequest: ContentRequest = {
        params: { contentType: 'article' },
        query: {
          publicationState: 'live'
        },
        context: adminContext
      }

      const liveResponse = await handler.findMany(liveRequest, contentEngine)
      expect(liveResponse.data).toBeDefined()
      expect(liveResponse.data?.length).toBe(2)
      expect(liveResponse.data?.every(e => e.publishedAt !== null)).toBe(true)

      // Query for all entries (preview mode)
      const previewRequest: ContentRequest = {
        params: { contentType: 'article' },
        query: {
          publicationState: 'preview'
        },
        context: adminContext
      }

      const previewResponse = await handler.findMany(previewRequest, contentEngine)
      expect(previewResponse.data).toBeDefined()
      expect(previewResponse.data?.length).toBe(3)
    })
  })
})
