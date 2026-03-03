/**
 * Tests for Schema Route Handlers
 * 
 * Tests the Content Type Builder API endpoints for schema management.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SchemaRouteHandler } from './schema'
import type { SchemaRequest } from './schema'
import type { ContentTypeSchema, RequestContext } from '@cms/core'

describe('SchemaRouteHandler', () => {
  let handler: SchemaRouteHandler
  let mockSchemaEngine: any
  let mockContext: RequestContext

  beforeEach(() => {
    handler = new SchemaRouteHandler()
    mockContext = {
      role: 'admin',
      user: { id: 'user-123', role: 'admin' }
    } as RequestContext

    // Create mock schema engine
    mockSchemaEngine = {
      loadAllSchemas: vi.fn(),
      loadSchema: vi.fn(),
      saveSchema: vi.fn(),
      deleteSchema: vi.fn()
    }
  })

  describe('list', () => {
    it('should return all content type schemas', async () => {
      const mockSchemas = new Map<string, ContentTypeSchema>([
        ['articles', {
          apiId: 'articles',
          displayName: 'Article',
          singularName: 'article',
          pluralName: 'articles',
          attributes: {
            title: { type: 'string', required: true }
          }
        }],
        ['categories', {
          apiId: 'categories',
          displayName: 'Category',
          singularName: 'category',
          pluralName: 'categories',
          attributes: {
            name: { type: 'string', required: true }
          }
        }]
      ])

      mockSchemaEngine.loadAllSchemas.mockResolvedValue(mockSchemas)

      const request: SchemaRequest = {
        params: {},
        context: mockContext
      }

      const response = await handler.list(request, mockSchemaEngine)

      expect(response.data).toBeDefined()
      expect(Array.isArray(response.data)).toBe(true)
      expect(response.data).toHaveLength(2)
      expect(response.data?.[0].apiId).toBe('articles')
      expect(response.data?.[1].apiId).toBe('categories')
      expect(mockSchemaEngine.loadAllSchemas).toHaveBeenCalledTimes(1)
    })

    it('should return empty array when no schemas exist', async () => {
      mockSchemaEngine.loadAllSchemas.mockResolvedValue(new Map())

      const request: SchemaRequest = {
        params: {},
        context: mockContext
      }

      const response = await handler.list(request, mockSchemaEngine)

      expect(response.data).toBeDefined()
      expect(Array.isArray(response.data)).toBe(true)
      expect(response.data).toHaveLength(0)
    })

    it('should handle errors from schema engine', async () => {
      mockSchemaEngine.loadAllSchemas.mockRejectedValue(
        new Error('Failed to read schema directory')
      )

      const request: SchemaRequest = {
        params: {},
        context: mockContext
      }

      const response = await handler.list(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(500)
      expect(response.data).toBeUndefined()
    })
  })

  describe('get', () => {
    it('should return a single content type schema', async () => {
      const mockSchema: ContentTypeSchema = {
        apiId: 'articles',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true },
          content: { type: 'richtext', required: true }
        },
        options: {
          draftAndPublish: true,
          timestamps: true
        }
      }

      mockSchemaEngine.loadSchema.mockResolvedValue(mockSchema)

      const request: SchemaRequest = {
        params: { apiId: 'articles' },
        context: mockContext
      }

      const response = await handler.get(request, mockSchemaEngine)

      expect(response.data).toBeDefined()
      expect(response.data?.apiId).toBe('articles')
      expect(response.data?.displayName).toBe('Article')
      expect(response.data?.attributes.title).toBeDefined()
      expect(mockSchemaEngine.loadSchema).toHaveBeenCalledWith('articles')
    })

    it('should return 400 when apiId is missing', async () => {
      const request: SchemaRequest = {
        params: {},
        context: mockContext
      }

      const response = await handler.get(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('BadRequestError')
      expect(response.error?.message).toContain('apiId is required')
      expect(mockSchemaEngine.loadSchema).not.toHaveBeenCalled()
    })

    it('should return 404 when schema does not exist', async () => {
      mockSchemaEngine.loadSchema.mockRejectedValue(
        new Error('Schema not found for content type: nonexistent')
      )

      const request: SchemaRequest = {
        params: { apiId: 'nonexistent' },
        context: mockContext
      }

      const response = await handler.get(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(404)
      expect(response.error?.name).toBe('NotFoundError')
      expect(response.error?.message).toContain('not found')
    })
  })

  describe('create', () => {
    it('should create a new content type schema', async () => {
      const newSchema: ContentTypeSchema = {
        apiId: 'products',
        displayName: 'Product',
        singularName: 'product',
        pluralName: 'products',
        attributes: {
          name: { type: 'string', required: true },
          price: { type: 'number', required: true }
        }
      }

      // Mock loadSchema to throw "not found" on first call (checking existence)
      // and return the schema on second call (after save)
      mockSchemaEngine.loadSchema
        .mockRejectedValueOnce(new Error('Schema not found for content type: products'))
        .mockResolvedValueOnce(newSchema)

      mockSchemaEngine.saveSchema.mockResolvedValue(undefined)

      const request: SchemaRequest = {
        params: {},
        body: { data: newSchema },
        context: mockContext
      }

      const response = await handler.create(request, mockSchemaEngine)

      expect(response.data).toBeDefined()
      expect(response.data?.apiId).toBe('products')
      expect(mockSchemaEngine.saveSchema).toHaveBeenCalledWith('products', newSchema)
      expect(mockSchemaEngine.loadSchema).toHaveBeenCalledTimes(2)
    })

    it('should return 400 when body data is missing', async () => {
      const request: SchemaRequest = {
        params: {},
        body: {},
        context: mockContext
      }

      const response = await handler.create(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('BadRequestError')
      expect(response.error?.message).toContain('data object')
      expect(mockSchemaEngine.saveSchema).not.toHaveBeenCalled()
    })

    it('should return 400 when apiId is missing', async () => {
      const request: SchemaRequest = {
        params: {},
        body: {
          data: {
            displayName: 'Product',
            singularName: 'product',
            pluralName: 'products',
            attributes: {
              name: { type: 'string' }
            }
          } as any
        },
        context: mockContext
      }

      const response = await handler.create(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('ValidationError')
      expect(response.error?.message).toContain('validation failed')
      expect(mockSchemaEngine.saveSchema).not.toHaveBeenCalled()
    })

    it('should return 409 when schema already exists', async () => {
      const existingSchema: ContentTypeSchema = {
        apiId: 'articles',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string' }
        }
      }

      mockSchemaEngine.loadSchema.mockResolvedValue(existingSchema)

      const request: SchemaRequest = {
        params: {},
        body: { data: existingSchema },
        context: mockContext
      }

      const response = await handler.create(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(409)
      expect(response.error?.name).toBe('ConflictError')
      expect(response.error?.message).toContain('already exists')
      expect(mockSchemaEngine.saveSchema).not.toHaveBeenCalled()
    })

    it('should handle validation errors from schema engine', async () => {
      const invalidSchema = {
        apiId: 'invalid',
        displayName: 'Invalid',
        singularName: 'invalid',
        pluralName: 'invalids',
        attributes: {}
      }

      mockSchemaEngine.loadSchema.mockRejectedValue(
        new Error('Schema not found for content type: invalid')
      )
      mockSchemaEngine.saveSchema.mockRejectedValue(
        new Error('Invalid schema structure: attributes must contain at least one field')
      )

      const request: SchemaRequest = {
        params: {},
        body: { data: invalidSchema },
        context: mockContext
      }

      const response = await handler.create(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      // Error handler may return 400 for validation errors
      expect([400, 500]).toContain(response.error?.status)
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

      mockSchemaEngine.loadSchema.mockRejectedValue(
        new Error('Schema not found for content type: test')
      )

      const request: SchemaRequest = {
        params: {},
        body: { data: invalidSchema },
        context: mockContext
      }

      const response = await handler.create(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('ValidationError')
      expect(response.error?.message).toContain('validation failed')
      expect(mockSchemaEngine.saveSchema).not.toHaveBeenCalled()
    })

    it('should reject schema with field missing type property', async () => {
      const invalidSchema = {
        apiId: 'test',
        displayName: 'Test',
        singularName: 'test',
        pluralName: 'tests',
        attributes: {
          title: { required: true }
        }
      }

      mockSchemaEngine.loadSchema.mockRejectedValue(
        new Error('Schema not found for content type: test')
      )

      const request: SchemaRequest = {
        params: {},
        body: { data: invalidSchema },
        context: mockContext
      }

      const response = await handler.create(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('ValidationError')
      expect(response.error?.message).toContain('validation failed')
      expect(mockSchemaEngine.saveSchema).not.toHaveBeenCalled()
    })

    it('should reject schema with reserved field names', async () => {
      const invalidSchema = {
        apiId: 'test',
        displayName: 'Test',
        singularName: 'test',
        pluralName: 'tests',
        attributes: {
          id: { type: 'string' }
        }
      }

      mockSchemaEngine.loadSchema.mockRejectedValue(
        new Error('Schema not found for content type: test')
      )

      const request: SchemaRequest = {
        params: {},
        body: { data: invalidSchema },
        context: mockContext
      }

      const response = await handler.create(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('ValidationError')
      expect(response.error?.message).toContain('validation failed')
      expect(mockSchemaEngine.saveSchema).not.toHaveBeenCalled()
    })

    it('should reject schema with invalid apiId format', async () => {
      const invalidSchema = {
        apiId: 'InvalidApiId',
        displayName: 'Test',
        singularName: 'test',
        pluralName: 'tests',
        attributes: {
          title: { type: 'string' }
        }
      }

      mockSchemaEngine.loadSchema.mockRejectedValue(
        new Error('Schema not found for content type: InvalidApiId')
      )

      const request: SchemaRequest = {
        params: {},
        body: { data: invalidSchema },
        context: mockContext
      }

      const response = await handler.create(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('ValidationError')
      expect(response.error?.message).toContain('validation failed')
      expect(mockSchemaEngine.saveSchema).not.toHaveBeenCalled()
    })

    it('should reject schema where singularName equals pluralName', async () => {
      const invalidSchema = {
        apiId: 'test',
        displayName: 'Test',
        singularName: 'test',
        pluralName: 'test',
        attributes: {
          title: { type: 'string' }
        }
      }

      mockSchemaEngine.loadSchema.mockRejectedValue(
        new Error('Schema not found for content type: test')
      )

      const request: SchemaRequest = {
        params: {},
        body: { data: invalidSchema },
        context: mockContext
      }

      const response = await handler.create(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('ValidationError')
      expect(response.error?.message).toContain('validation failed')
      expect(mockSchemaEngine.saveSchema).not.toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('should update an existing content type schema', async () => {
      const existingSchema: ContentTypeSchema = {
        apiId: 'articles',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true }
        }
      }

      const updatedSchema: ContentTypeSchema = {
        ...existingSchema,
        displayName: 'Blog Article',
        attributes: {
          title: { type: 'string', required: true },
          content: { type: 'richtext', required: true }
        }
      }

      mockSchemaEngine.loadSchema
        .mockResolvedValueOnce(existingSchema) // First call to check existence
        .mockResolvedValueOnce(updatedSchema)  // Second call after save

      mockSchemaEngine.saveSchema.mockResolvedValue(undefined)

      const request: SchemaRequest = {
        params: { apiId: 'articles' },
        body: {
          data: {
            displayName: 'Blog Article',
            attributes: {
              title: { type: 'string', required: true },
              content: { type: 'richtext', required: true }
            }
          }
        },
        context: mockContext
      }

      const response = await handler.update(request, mockSchemaEngine)

      expect(response.data).toBeDefined()
      expect(response.data?.displayName).toBe('Blog Article')
      expect(response.data?.attributes.content).toBeDefined()
      expect(mockSchemaEngine.saveSchema).toHaveBeenCalledWith('articles', expect.objectContaining({
        apiId: 'articles',
        displayName: 'Blog Article'
      }))
    })

    it('should return 400 when apiId is missing', async () => {
      const request: SchemaRequest = {
        params: {},
        body: { data: { displayName: 'Updated' } },
        context: mockContext
      }

      const response = await handler.update(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('BadRequestError')
      expect(mockSchemaEngine.saveSchema).not.toHaveBeenCalled()
    })

    it('should return 400 when body data is missing', async () => {
      const request: SchemaRequest = {
        params: { apiId: 'articles' },
        body: {},
        context: mockContext
      }

      const response = await handler.update(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('BadRequestError')
      expect(mockSchemaEngine.saveSchema).not.toHaveBeenCalled()
    })

    it('should return 404 when schema does not exist', async () => {
      mockSchemaEngine.loadSchema.mockRejectedValue(
        new Error('Schema not found for content type: nonexistent')
      )

      const request: SchemaRequest = {
        params: { apiId: 'nonexistent' },
        body: { data: { displayName: 'Updated' } },
        context: mockContext
      }

      const response = await handler.update(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(404)
      expect(response.error?.name).toBe('NotFoundError')
      expect(mockSchemaEngine.saveSchema).not.toHaveBeenCalled()
    })

    it('should preserve apiId even if update tries to change it', async () => {
      const existingSchema: ContentTypeSchema = {
        apiId: 'articles',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string' }
        }
      }

      mockSchemaEngine.loadSchema
        .mockResolvedValueOnce(existingSchema)
        .mockResolvedValueOnce(existingSchema)

      mockSchemaEngine.saveSchema.mockResolvedValue(undefined)

      const request: SchemaRequest = {
        params: { apiId: 'articles' },
        body: {
          data: {
            apiId: 'different-id', // Attempt to change apiId
            displayName: 'Updated'
          }
        },
        context: mockContext
      }

      const response = await handler.update(request, mockSchemaEngine)

      expect(response.data).toBeDefined()
      // Verify that apiId was preserved
      expect(mockSchemaEngine.saveSchema).toHaveBeenCalledWith('articles', expect.objectContaining({
        apiId: 'articles' // Should be original, not 'different-id'
      }))
    })

    it('should reject update with invalid schema validation', async () => {
      const existingSchema: ContentTypeSchema = {
        apiId: 'articles',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string' }
        }
      }

      mockSchemaEngine.loadSchema.mockResolvedValue(existingSchema)

      const request: SchemaRequest = {
        params: { apiId: 'articles' },
        body: {
          data: {
            attributes: {
              id: { type: 'string' } // Reserved field name
            }
          }
        },
        context: mockContext
      }

      const response = await handler.update(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('ValidationError')
      expect(response.error?.message).toContain('validation failed')
      expect(mockSchemaEngine.saveSchema).not.toHaveBeenCalled()
    })

    it('should reject update with invalid field type', async () => {
      const existingSchema: ContentTypeSchema = {
        apiId: 'articles',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string' }
        }
      }

      mockSchemaEngine.loadSchema.mockResolvedValue(existingSchema)

      const request: SchemaRequest = {
        params: { apiId: 'articles' },
        body: {
          data: {
            attributes: {
              title: { type: 'invalidType' as any }
            }
          }
        },
        context: mockContext
      }

      const response = await handler.update(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('ValidationError')
      expect(mockSchemaEngine.saveSchema).not.toHaveBeenCalled()
    })
  })

  describe('delete', () => {
    it('should delete an existing content type schema', async () => {
      const existingSchema: ContentTypeSchema = {
        apiId: 'articles',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {}
      }

      mockSchemaEngine.loadSchema.mockResolvedValue(existingSchema)
      mockSchemaEngine.deleteSchema.mockResolvedValue(undefined)

      const request: SchemaRequest = {
        params: { apiId: 'articles' },
        context: mockContext
      }

      const response = await handler.delete(request, mockSchemaEngine)

      expect(response.data).toBeDefined()
      expect(response.data?.apiId).toBe('articles')
      expect(response.data?.deleted).toBe(true)
      expect(mockSchemaEngine.deleteSchema).toHaveBeenCalledWith('articles')
    })

    it('should return 400 when apiId is missing', async () => {
      const request: SchemaRequest = {
        params: {},
        context: mockContext
      }

      const response = await handler.delete(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('BadRequestError')
      expect(mockSchemaEngine.deleteSchema).not.toHaveBeenCalled()
    })

    it('should return 404 when schema does not exist', async () => {
      mockSchemaEngine.loadSchema.mockRejectedValue(
        new Error('Schema not found for content type: nonexistent')
      )

      const request: SchemaRequest = {
        params: { apiId: 'nonexistent' },
        context: mockContext
      }

      const response = await handler.delete(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(404)
      expect(response.error?.name).toBe('NotFoundError')
      expect(mockSchemaEngine.deleteSchema).not.toHaveBeenCalled()
    })

    it('should handle errors from schema engine during deletion', async () => {
      const existingSchema: ContentTypeSchema = {
        apiId: 'articles',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {}
      }

      mockSchemaEngine.loadSchema.mockResolvedValue(existingSchema)
      mockSchemaEngine.deleteSchema.mockRejectedValue(
        new Error('Permission denied')
      )

      const request: SchemaRequest = {
        params: { apiId: 'articles' },
        context: mockContext
      }

      const response = await handler.delete(request, mockSchemaEngine)

      expect(response.error).toBeDefined()
      // Error handler may return 403 or 500 depending on error type
      expect([403, 500]).toContain(response.error?.status)
    })
  })

  describe('createSchemaRouteHandler', () => {
    it('should create a new handler instance', async () => {
      const { createSchemaRouteHandler } = await import('./schema.js')
      const handler = createSchemaRouteHandler()
      
      expect(handler).toBeInstanceOf(SchemaRouteHandler)
      expect(handler.list).toBeDefined()
      expect(handler.get).toBeDefined()
      expect(handler.create).toBeDefined()
      expect(handler.update).toBeDefined()
      expect(handler.delete).toBeDefined()
    })
  })
})
