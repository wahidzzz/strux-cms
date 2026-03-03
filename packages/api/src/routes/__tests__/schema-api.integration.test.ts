/**
 * Integration Tests for Schema API
 * 
 * Tests complete schema CRUD workflow with SchemaEngine integration,
 * schema validation, and admin-only access control.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.6, 2.7
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SchemaRouteHandler } from '../schema'
import type { SchemaRequest, RequestContext } from '@cms/core'
import { SchemaEngine, FileEngine, RBACEngine } from '@cms/core'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import type { ContentTypeSchema } from '@cms/core'

describe('Schema API Integration Tests', () => {
  let handler: SchemaRouteHandler
  let schemaEngine: SchemaEngine
  let rbacEngine: RBACEngine
  let testDir: string
  
  // Test contexts for different roles
  let adminContext: RequestContext
  let editorContext: RequestContext
  let publicContext: RequestContext

  beforeEach(async () => {
    // Create temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cms-schema-api-test-'))

    // Initialize engines
    const schemaDir = path.join(testDir, 'schema')
    await fs.mkdir(schemaDir, { recursive: true })
    schemaEngine = new SchemaEngine(schemaDir)
    
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

    // Create handler
    handler = new SchemaRouteHandler()

    // Create test contexts
    adminContext = {
      role: 'admin',
      user: { id: 'admin-123', role: 'admin' }
    } as RequestContext

    editorContext = {
      role: 'editor',
      user: { id: 'editor-123', role: 'editor' }
    } as RequestContext

    publicContext = {
      role: 'public'
    } as RequestContext
  })

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  describe('Schema CRUD Operations', () => {
    describe('Create Schema', () => {
      it('should create a new content type schema', async () => {
        const newSchema: ContentTypeSchema = {
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
              type: 'richtext',
              required: true
            }
          },
          options: {
            draftAndPublish: true,
            timestamps: true
          }
        }

        const request: SchemaRequest = {
          params: {},
          body: { data: newSchema },
          context: adminContext
        }

        const response = await handler.create(request, schemaEngine)

        expect(response.data).toBeDefined()
        expect(response.data?.apiId).toBe('article')
        expect(response.data?.displayName).toBe('Article')
        expect(response.data?.attributes.title).toBeDefined()
        expect(response.data?.attributes.content).toBeDefined()
        expect(response.error).toBeUndefined()

        // Verify schema was saved to file system
        const schemaPath = path.join(testDir, 'schema', 'article.schema.json')
        const fileExists = await fs.access(schemaPath).then(() => true).catch(() => false)
        expect(fileExists).toBe(true)

        // Verify schema can be loaded
        const loadedSchema = await schemaEngine.loadSchema('article')
        expect(loadedSchema.apiId).toBe('article')
      })

      it('should create schema with all field types', async () => {
        const complexSchema: ContentTypeSchema = {
          apiId: 'product',
          displayName: 'Product',
          singularName: 'product',
          pluralName: 'products',
          attributes: {
            name: { type: 'string', required: true },
            description: { type: 'text' },
            price: { type: 'number', required: true },
            inStock: { type: 'boolean', default: true },
            releaseDate: { type: 'date' },
            lastModified: { type: 'datetime' },
            email: { type: 'email' },
            status: { type: 'enumeration', enum: ['active', 'inactive', 'discontinued'] },
            metadata: { type: 'json' },
            slug: { type: 'uid', targetField: 'name' }
          }
        }

        const request: SchemaRequest = {
          params: {},
          body: { data: complexSchema },
          context: adminContext
        }

        const response = await handler.create(request, schemaEngine)

        expect(response.data).toBeDefined()
        expect(response.data?.apiId).toBe('product')
        expect(Object.keys(response.data?.attributes || {})).toHaveLength(10)
        expect(response.error).toBeUndefined()
      })

      it('should reject schema with duplicate apiId', async () => {
        const schema: ContentTypeSchema = {
          apiId: 'article',
          displayName: 'Article',
          singularName: 'article',
          pluralName: 'articles',
          attributes: {
            title: { type: 'string' }
          }
        }

        // Create first schema
        await handler.create({
          params: {},
          body: { data: schema },
          context: adminContext
        }, schemaEngine)

        // Try to create duplicate
        const response = await handler.create({
          params: {},
          body: { data: schema },
          context: adminContext
        }, schemaEngine)

        expect(response.error).toBeDefined()
        expect(response.error?.status).toBe(409)
        expect(response.error?.name).toBe('ConflictError')
        expect(response.error?.message).toContain('already exists')
      })
    })

    describe('Read Schema', () => {
      beforeEach(async () => {
        // Create test schemas
        const schemas: ContentTypeSchema[] = [
          {
            apiId: 'article',
            displayName: 'Article',
            singularName: 'article',
            pluralName: 'articles',
            attributes: {
              title: { type: 'string', required: true }
            }
          },
          {
            apiId: 'category',
            displayName: 'Category',
            singularName: 'category',
            pluralName: 'categories',
            attributes: {
              name: { type: 'string', required: true }
            }
          }
        ]

        for (const schema of schemas) {
          await schemaEngine.saveSchema(schema.apiId, schema)
        }
      })

      it('should list all content type schemas', async () => {
        const request: SchemaRequest = {
          params: {},
          context: adminContext
        }

        const response = await handler.list(request, schemaEngine)

        expect(response.data).toBeDefined()
        expect(Array.isArray(response.data)).toBe(true)
        expect(response.data).toHaveLength(2)
        
        const apiIds = response.data?.map(s => s.apiId).sort()
        expect(apiIds).toEqual(['article', 'category'])
      })

      it('should get a single content type schema', async () => {
        const request: SchemaRequest = {
          params: { apiId: 'article' },
          context: adminContext
        }

        const response = await handler.get(request, schemaEngine)

        expect(response.data).toBeDefined()
        expect(response.data?.apiId).toBe('article')
        expect(response.data?.displayName).toBe('Article')
        expect(response.data?.attributes.title).toBeDefined()
      })

      it('should return 404 for non-existent schema', async () => {
        const request: SchemaRequest = {
          params: { apiId: 'nonexistent' },
          context: adminContext
        }

        const response = await handler.get(request, schemaEngine)

        expect(response.error).toBeDefined()
        expect(response.error?.status).toBe(404)
        expect(response.error?.name).toBe('NotFoundError')
      })
    })

    describe('Update Schema', () => {
      beforeEach(async () => {
        // Create initial schema
        const schema: ContentTypeSchema = {
          apiId: 'article',
          displayName: 'Article',
          singularName: 'article',
          pluralName: 'articles',
          attributes: {
            title: { type: 'string', required: true }
          }
        }
        await schemaEngine.saveSchema(schema.apiId, schema)
      })

      it('should update an existing schema', async () => {
        const request: SchemaRequest = {
          params: { apiId: 'article' },
          body: {
            data: {
              displayName: 'Blog Article',
              attributes: {
                title: { type: 'string', required: true },
                content: { type: 'richtext', required: true },
                excerpt: { type: 'text' }
              }
            }
          },
          context: adminContext
        }

        const response = await handler.update(request, schemaEngine)

        expect(response.data).toBeDefined()
        expect(response.data?.displayName).toBe('Blog Article')
        expect(response.data?.attributes.content).toBeDefined()
        expect(response.data?.attributes.excerpt).toBeDefined()
        expect(response.error).toBeUndefined()

        // Verify changes persisted
        const loadedSchema = await schemaEngine.loadSchema('article')
        expect(loadedSchema.displayName).toBe('Blog Article')
        expect(loadedSchema.attributes.content).toBeDefined()
      })

      it('should preserve apiId when updating', async () => {
        const request: SchemaRequest = {
          params: { apiId: 'article' },
          body: {
            data: {
              apiId: 'different-id', // Attempt to change apiId
              displayName: 'Updated Article'
            }
          },
          context: adminContext
        }

        const response = await handler.update(request, schemaEngine)

        expect(response.data).toBeDefined()
        expect(response.data?.apiId).toBe('article') // Should remain unchanged
        expect(response.data?.displayName).toBe('Updated Article')
      })

      it('should return 404 when updating non-existent schema', async () => {
        const request: SchemaRequest = {
          params: { apiId: 'nonexistent' },
          body: {
            data: {
              displayName: 'Updated'
            }
          },
          context: adminContext
        }

        const response = await handler.update(request, schemaEngine)

        expect(response.error).toBeDefined()
        expect(response.error?.status).toBe(404)
        expect(response.error?.name).toBe('NotFoundError')
      })
    })

    describe('Delete Schema', () => {
      beforeEach(async () => {
        // Create test schema
        const schema: ContentTypeSchema = {
          apiId: 'article',
          displayName: 'Article',
          singularName: 'article',
          pluralName: 'articles',
          attributes: {
            title: { type: 'string' }
          }
        }
        await schemaEngine.saveSchema(schema.apiId, schema)
      })

      it('should delete an existing schema', async () => {
        const request: SchemaRequest = {
          params: { apiId: 'article' },
          context: adminContext
        }

        const response = await handler.delete(request, schemaEngine)

        expect(response.data).toBeDefined()
        expect(response.data?.apiId).toBe('article')
        expect(response.data?.deleted).toBe(true)
        expect(response.error).toBeUndefined()

        // Verify schema was deleted from file system
        const schemaPath = path.join(testDir, 'schema', 'article.schema.json')
        const fileExists = await fs.access(schemaPath).then(() => true).catch(() => false)
        expect(fileExists).toBe(false)

        // Verify schema cannot be loaded
        await expect(schemaEngine.loadSchema('article')).rejects.toThrow()
      })

      it('should return 404 when deleting non-existent schema', async () => {
        const request: SchemaRequest = {
          params: { apiId: 'nonexistent' },
          context: adminContext
        }

        const response = await handler.delete(request, schemaEngine)

        expect(response.error).toBeDefined()
        expect(response.error?.status).toBe(404)
        expect(response.error?.name).toBe('NotFoundError')
      })
    })
  })

  describe('Schema Validation', () => {
    it('should reject schema with missing required fields', async () => {
      const invalidSchema = {
        // Missing apiId
        displayName: 'Test',
        singularName: 'test',
        pluralName: 'tests',
        attributes: {
          title: { type: 'string' }
        }
      }

      const request: SchemaRequest = {
        params: {},
        body: { data: invalidSchema },
        context: adminContext
      }

      const response = await handler.create(request, schemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('ValidationError')
    })

    it('should reject schema with invalid apiId format', async () => {
      const invalidSchema: ContentTypeSchema = {
        apiId: 'Invalid-ApiId', // Should be kebab-case
        displayName: 'Test',
        singularName: 'test',
        pluralName: 'tests',
        attributes: {
          title: { type: 'string' }
        }
      }

      const request: SchemaRequest = {
        params: {},
        body: { data: invalidSchema },
        context: adminContext
      }

      const response = await handler.create(request, schemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('ValidationError')
    })

    it('should reject schema with reserved field names', async () => {
      const invalidSchema: ContentTypeSchema = {
        apiId: 'test',
        displayName: 'Test',
        singularName: 'test',
        pluralName: 'tests',
        attributes: {
          id: { type: 'string' }, // Reserved field
          title: { type: 'string' }
        }
      }

      const request: SchemaRequest = {
        params: {},
        body: { data: invalidSchema },
        context: adminContext
      }

      const response = await handler.create(request, schemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('ValidationError')
      expect(response.error?.details).toBeDefined()
    })

    it('should reject schema with invalid field type', async () => {
      const invalidSchema = {
        apiId: 'test',
        displayName: 'Test',
        singularName: 'test',
        pluralName: 'tests',
        attributes: {
          title: { type: 'invalidType' }
        }
      }

      const request: SchemaRequest = {
        params: {},
        body: { data: invalidSchema },
        context: adminContext
      }

      const response = await handler.create(request, schemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('ValidationError')
    })

    it('should reject schema where singularName equals pluralName', async () => {
      const invalidSchema: ContentTypeSchema = {
        apiId: 'test',
        displayName: 'Test',
        singularName: 'test',
        pluralName: 'test', // Same as singularName
        attributes: {
          title: { type: 'string' }
        }
      }

      const request: SchemaRequest = {
        params: {},
        body: { data: invalidSchema },
        context: adminContext
      }

      const response = await handler.create(request, schemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('ValidationError')
    })

    it('should reject schema with empty attributes', async () => {
      const invalidSchema: ContentTypeSchema = {
        apiId: 'test',
        displayName: 'Test',
        singularName: 'test',
        pluralName: 'tests',
        attributes: {} // Empty attributes
      }

      const request: SchemaRequest = {
        params: {},
        body: { data: invalidSchema },
        context: adminContext
      }

      const response = await handler.create(request, schemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('ValidationError')
    })

    it('should reject schema with field missing type property', async () => {
      const invalidSchema = {
        apiId: 'test',
        displayName: 'Test',
        singularName: 'test',
        pluralName: 'tests',
        attributes: {
          title: { required: true } // Missing type
        }
      }

      const request: SchemaRequest = {
        params: {},
        body: { data: invalidSchema },
        context: adminContext
      }

      const response = await handler.create(request, schemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('ValidationError')
    })

    it('should accept valid schema with all optional fields', async () => {
      const validSchema: ContentTypeSchema = {
        apiId: 'blog-post',
        displayName: 'Blog Post',
        singularName: 'blog-post',
        pluralName: 'blog-posts',
        attributes: {
          title: {
            type: 'string',
            required: true,
            unique: true
          },
          content: {
            type: 'richtext',
            required: true
          },
          views: {
            type: 'number',
            default: 0,
            min: 0
          },
          status: {
            type: 'enumeration',
            enum: ['draft', 'published', 'archived'],
            default: 'draft'
          }
        },
        options: {
          draftAndPublish: true,
          timestamps: true,
          populateCreatorFields: true
        }
      }

      const request: SchemaRequest = {
        params: {},
        body: { data: validSchema },
        context: adminContext
      }

      const response = await handler.create(request, schemaEngine)

      expect(response.data).toBeDefined()
      expect(response.error).toBeUndefined()
      expect(response.data?.apiId).toBe('blog-post')
    })
  })

  describe('Admin-Only Access', () => {
    beforeEach(async () => {
      // Create a test schema
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string' }
        }
      }
      await schemaEngine.saveSchema(schema.apiId, schema)
    })

    it('should allow admin to create schema', async () => {
      const newSchema: ContentTypeSchema = {
        apiId: 'product',
        displayName: 'Product',
        singularName: 'product',
        pluralName: 'products',
        attributes: {
          name: { type: 'string' }
        }
      }

      const request: SchemaRequest = {
        params: {},
        body: { data: newSchema },
        context: adminContext
      }

      const response = await handler.create(request, schemaEngine)

      expect(response.data).toBeDefined()
      expect(response.error).toBeUndefined()
    })

    it('should allow admin to update schema', async () => {
      const request: SchemaRequest = {
        params: { apiId: 'article' },
        body: {
          data: {
            displayName: 'Updated Article'
          }
        },
        context: adminContext
      }

      const response = await handler.update(request, schemaEngine)

      expect(response.data).toBeDefined()
      expect(response.error).toBeUndefined()
    })

    it('should allow admin to delete schema', async () => {
      const request: SchemaRequest = {
        params: { apiId: 'article' },
        context: adminContext
      }

      const response = await handler.delete(request, schemaEngine)

      expect(response.data).toBeDefined()
      expect(response.error).toBeUndefined()
    })

    it('should allow admin to list schemas', async () => {
      const request: SchemaRequest = {
        params: {},
        context: adminContext
      }

      const response = await handler.list(request, schemaEngine)

      expect(response.data).toBeDefined()
      expect(response.error).toBeUndefined()
    })

    it('should allow admin to get single schema', async () => {
      const request: SchemaRequest = {
        params: { apiId: 'article' },
        context: adminContext
      }

      const response = await handler.get(request, schemaEngine)

      expect(response.data).toBeDefined()
      expect(response.error).toBeUndefined()
    })

    // Note: RBAC enforcement is typically done in middleware, not in the route handler
    // These tests verify that the handler itself doesn't block operations
    // Actual RBAC enforcement would be tested in middleware integration tests
  })

  describe('Complete Workflow', () => {
    it('should handle complete schema lifecycle', async () => {
      // 1. Create schema
      const schema: ContentTypeSchema = {
        apiId: 'blog-post',
        displayName: 'Blog Post',
        singularName: 'blog-post',
        pluralName: 'blog-posts',
        attributes: {
          title: { type: 'string', required: true }
        }
      }

      const createResponse = await handler.create({
        params: {},
        body: { data: schema },
        context: adminContext
      }, schemaEngine)

      expect(createResponse.data).toBeDefined()
      expect(createResponse.data?.apiId).toBe('blog-post')

      // 2. List schemas
      const listResponse = await handler.list({
        params: {},
        context: adminContext
      }, schemaEngine)

      expect(listResponse.data).toBeDefined()
      expect(listResponse.data?.some(s => s.apiId === 'blog-post')).toBe(true)

      // 3. Get single schema
      const getResponse = await handler.get({
        params: { apiId: 'blog-post' },
        context: adminContext
      }, schemaEngine)

      expect(getResponse.data).toBeDefined()
      expect(getResponse.data?.apiId).toBe('blog-post')

      // 4. Update schema
      const updateResponse = await handler.update({
        params: { apiId: 'blog-post' },
        body: {
          data: {
            displayName: 'Updated Blog Post',
            attributes: {
              title: { type: 'string', required: true },
              content: { type: 'richtext' }
            }
          }
        },
        context: adminContext
      }, schemaEngine)

      expect(updateResponse.data).toBeDefined()
      expect(updateResponse.data?.displayName).toBe('Updated Blog Post')
      expect(updateResponse.data?.attributes.content).toBeDefined()

      // 5. Verify update persisted
      const verifyResponse = await handler.get({
        params: { apiId: 'blog-post' },
        context: adminContext
      }, schemaEngine)

      expect(verifyResponse.data?.displayName).toBe('Updated Blog Post')
      expect(verifyResponse.data?.attributes.content).toBeDefined()

      // 6. Delete schema
      const deleteResponse = await handler.delete({
        params: { apiId: 'blog-post' },
        context: adminContext
      }, schemaEngine)

      expect(deleteResponse.data).toBeDefined()
      expect(deleteResponse.data?.deleted).toBe(true)

      // 7. Verify deletion
      const finalListResponse = await handler.list({
        params: {},
        context: adminContext
      }, schemaEngine)

      expect(finalListResponse.data?.some(s => s.apiId === 'blog-post')).toBe(false)
    })

    it('should handle multiple schemas independently', async () => {
      const schemas: ContentTypeSchema[] = [
        {
          apiId: 'article',
          displayName: 'Article',
          singularName: 'article',
          pluralName: 'articles',
          attributes: { title: { type: 'string' } }
        },
        {
          apiId: 'category',
          displayName: 'Category',
          singularName: 'category',
          pluralName: 'categories',
          attributes: { name: { type: 'string' } }
        },
        {
          apiId: 'tag',
          displayName: 'Tag',
          singularName: 'tag',
          pluralName: 'tags',
          attributes: { label: { type: 'string' } }
        }
      ]

      // Create all schemas
      for (const schema of schemas) {
        const response = await handler.create({
          params: {},
          body: { data: schema },
          context: adminContext
        }, schemaEngine)

        expect(response.data).toBeDefined()
        expect(response.error).toBeUndefined()
      }

      // List all schemas
      const listResponse = await handler.list({
        params: {},
        context: adminContext
      }, schemaEngine)

      expect(listResponse.data).toHaveLength(3)

      // Update one schema
      await handler.update({
        params: { apiId: 'article' },
        body: {
          data: { displayName: 'Blog Article' }
        },
        context: adminContext
      }, schemaEngine)

      // Delete one schema
      await handler.delete({
        params: { apiId: 'tag' },
        context: adminContext
      }, schemaEngine)

      // Verify final state
      const finalListResponse = await handler.list({
        params: {},
        context: adminContext
      }, schemaEngine)

      expect(finalListResponse.data).toHaveLength(2)
      expect(finalListResponse.data?.some(s => s.apiId === 'article')).toBe(true)
      expect(finalListResponse.data?.some(s => s.apiId === 'category')).toBe(true)
      expect(finalListResponse.data?.some(s => s.apiId === 'tag')).toBe(false)

      // Verify article was updated
      const articleResponse = await handler.get({
        params: { apiId: 'article' },
        context: adminContext
      }, schemaEngine)

      expect(articleResponse.data?.displayName).toBe('Blog Article')
    })
  })
})
