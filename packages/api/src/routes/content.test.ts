/**
 * Tests for Content API Route Handlers
 * 
 * Tests query parameter parsing and route handler methods.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseQueryParams,
  ContentRouteHandler,
  createContentRouteHandler,
  type ContentRequest
} from './content.js'
import type { ContentEntry, RequestContext } from '@cms/core'

describe('parseQueryParams', () => {
  it('should parse empty query parameters', () => {
    const result = parseQueryParams({})
    expect(result).toEqual({})
  })

  it('should parse simple filters', () => {
    const result = parseQueryParams({
      filters: {
        title: 'Test Article'
      }
    })
    
    expect(result.filters).toEqual({
      title: { $eq: 'Test Article' }
    })
  })

  it('should parse filter operators', () => {
    const result = parseQueryParams({
      filters: {
        views: { $gt: 100 },
        status: { $in: ['published', 'draft'] }
      }
    })
    
    expect(result.filters).toEqual({
      views: { $gt: 100 },
      status: { $in: ['published', 'draft'] }
    })
  })

  it('should parse logical operators', () => {
    const result = parseQueryParams({
      filters: {
        $and: [
          { title: { $contains: 'test' } },
          { publishedAt: { $notNull: true } }
        ]
      }
    })
    
    expect(result.filters).toEqual({
      $and: [
        { title: { $contains: 'test' } },
        { publishedAt: { $notNull: true } }
      ]
    })
  })

  it('should parse sort parameter', () => {
    const result = parseQueryParams({
      sort: 'createdAt:desc,title:asc'
    })
    
    expect(result.sort).toEqual([
      { field: 'createdAt', order: 'desc' },
      { field: 'title', order: 'asc' }
    ])
  })

  it('should default sort order to asc', () => {
    const result = parseQueryParams({
      sort: 'title'
    })
    
    expect(result.sort).toEqual([
      { field: 'title', order: 'asc' }
    ])
  })

  it('should parse page-based pagination', () => {
    const result = parseQueryParams({
      pagination: {
        page: 2,
        pageSize: 25
      }
    })
    
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 25
    })
  })

  it('should parse offset-based pagination', () => {
    const result = parseQueryParams({
      pagination: {
        start: 50,
        limit: 25
      }
    })
    
    expect(result.pagination).toEqual({
      start: 50,
      limit: 25
    })
  })

  it('should parse fields as comma-separated string', () => {
    const result = parseQueryParams({
      fields: 'id,title,publishedAt'
    })
    
    expect(result.fields).toEqual(['id', 'title', 'publishedAt'])
  })

  it('should parse fields as array', () => {
    const result = parseQueryParams({
      fields: ['id', 'title', 'publishedAt']
    })
    
    expect(result.fields).toEqual(['id', 'title', 'publishedAt'])
  })

  it('should parse simple populate', () => {
    const result = parseQueryParams({
      populate: 'author,category'
    })
    
    expect(result.populate).toEqual({
      author: true,
      category: true
    })
  })

  it('should parse populate with field selection', () => {
    const result = parseQueryParams({
      populate: {
        author: {
          fields: 'id,username'
        }
      }
    })
    
    expect(result.populate).toEqual({
      author: {
        fields: ['id', 'username']
      }
    })
  })

  it('should parse nested populate', () => {
    const result = parseQueryParams({
      populate: {
        author: {
          fields: ['id', 'username'],
          populate: {
            avatar: true
          }
        }
      }
    })
    
    expect(result.populate).toEqual({
      author: {
        fields: ['id', 'username'],
        populate: {
          avatar: true
        }
      }
    })
  })

  it('should parse publicationState', () => {
    const result1 = parseQueryParams({
      publicationState: 'live'
    })
    expect(result1.publicationState).toBe('live')

    const result2 = parseQueryParams({
      publicationState: 'preview'
    })
    expect(result2.publicationState).toBe('preview')
  })

  it('should ignore invalid publicationState', () => {
    const result = parseQueryParams({
      publicationState: 'invalid'
    })
    expect(result.publicationState).toBeUndefined()
  })

  it('should parse complex query with all parameters', () => {
    const result = parseQueryParams({
      filters: {
        $and: [
          { title: { $contains: 'tutorial' } },
          { views: { $gte: 100 } }
        ]
      },
      sort: 'createdAt:desc',
      pagination: {
        page: 1,
        pageSize: 10
      },
      fields: 'id,title,views',
      populate: {
        author: {
          fields: ['username']
        }
      },
      publicationState: 'live'
    })
    
    expect(result).toEqual({
      filters: {
        $and: [
          { title: { $contains: 'tutorial' } },
          { views: { $gte: 100 } }
        ]
      },
      sort: [{ field: 'createdAt', order: 'desc' }],
      pagination: {
        page: 1,
        pageSize: 10
      },
      fields: ['id', 'title', 'views'],
      populate: {
        author: {
          fields: ['username']
        }
      },
      publicationState: 'live'
    })
  })
})

describe('ContentRouteHandler', () => {
  let handler: ContentRouteHandler
  let mockContentEngine: any
  let mockContext: RequestContext

  beforeEach(() => {
    handler = createContentRouteHandler()
    mockContext = {
      role: 'admin',
      user: {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        role: 'admin'
      }
    }

    mockContentEngine = {
      findMany: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      publish: vi.fn(),
      unpublish: vi.fn()
    }
  })

  describe('findMany', () => {
    it('should call contentEngine.findMany with parsed query params', async () => {
      const mockResult = {
        data: [
          { id: '1', title: 'Article 1', createdAt: '2024-01-01', updatedAt: '2024-01-01' }
        ],
        meta: {
          pagination: {
            page: 1,
            pageSize: 25,
            pageCount: 1,
            total: 1
          }
        }
      }

      mockContentEngine.findMany.mockResolvedValue(mockResult)

      const request: ContentRequest = {
        params: { contentType: 'articles' },
        query: {
          filters: { title: { $contains: 'test' } },
          sort: 'createdAt:desc'
        },
        context: mockContext
      }

      const response = await handler.findMany(request, mockContentEngine)

      expect(mockContentEngine.findMany).toHaveBeenCalledWith(
        'articles',
        {
          filters: { title: { $contains: 'test' } },
          sort: [{ field: 'createdAt', order: 'desc' }]
        },
        mockContext
      )

      expect(response.data).toEqual(mockResult.data)
      expect(response.meta).toEqual(mockResult.meta)
    })

    it('should handle errors', async () => {
      mockContentEngine.findMany.mockRejectedValue(new Error('Database error'))

      const request: ContentRequest = {
        params: { contentType: 'articles' },
        context: mockContext
      }

      const response = await handler.findMany(request, mockContentEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(500)
      // 500 errors use generic message to avoid leaking internal details
      expect(response.error?.message).toBe('An unexpected error occurred. Please try again later.')
    })
  })

  describe('findOne', () => {
    it('should call contentEngine.findOne with id and query params', async () => {
      const mockEntry: ContentEntry = {
        id: '1',
        title: 'Article 1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01'
      }

      mockContentEngine.findOne.mockResolvedValue(mockEntry)

      const request: ContentRequest = {
        params: { contentType: 'articles', id: '1' },
        query: { populate: 'author' },
        context: mockContext
      }

      const response = await handler.findOne(request, mockContentEngine)

      expect(mockContentEngine.findOne).toHaveBeenCalledWith(
        'articles',
        '1',
        { populate: { author: true } },
        mockContext
      )

      expect(response.data).toEqual(mockEntry)
    })

    it('should return 400 if id is missing', async () => {
      const request: ContentRequest = {
        params: { contentType: 'articles' },
        context: mockContext
      }

      const response = await handler.findOne(request, mockContentEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.message).toBe('Entry ID is required')
    })

    it('should return 404 if entry not found', async () => {
      mockContentEngine.findOne.mockResolvedValue(null)

      const request: ContentRequest = {
        params: { contentType: 'articles', id: '999' },
        context: mockContext
      }

      const response = await handler.findOne(request, mockContentEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(404)
      expect(response.error?.message).toContain('not found')
    })
  })

  describe('create', () => {
    it('should call contentEngine.create with data', async () => {
      const mockEntry: ContentEntry = {
        id: '1',
        title: 'New Article',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01'
      }

      mockContentEngine.create.mockResolvedValue(mockEntry)

      const request: ContentRequest = {
        params: { contentType: 'articles' },
        body: {
          data: { title: 'New Article', content: 'Content here' }
        },
        context: mockContext
      }

      const response = await handler.create(request, mockContentEngine)

      expect(mockContentEngine.create).toHaveBeenCalledWith(
        'articles',
        { title: 'New Article', content: 'Content here' },
        mockContext
      )

      expect(response.data).toEqual(mockEntry)
    })

    it('should return 400 if data is missing', async () => {
      const request: ContentRequest = {
        params: { contentType: 'articles' },
        body: {},
        context: mockContext
      }

      const response = await handler.create(request, mockContentEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.message).toContain('data object')
    })

    it('should handle validation errors', async () => {
      const validationError = new Error('Title is required')
      validationError.name = 'ValidationError'
      ;(validationError as any).details = { field: 'title' }

      mockContentEngine.create.mockRejectedValue(validationError)

      const request: ContentRequest = {
        params: { contentType: 'articles' },
        body: { data: {} },
        context: mockContext
      }

      const response = await handler.create(request, mockContentEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('ValidationError')
    })
  })

  describe('update', () => {
    it('should call contentEngine.update with id and data', async () => {
      const mockEntry: ContentEntry = {
        id: '1',
        title: 'Updated Article',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02'
      }

      mockContentEngine.update.mockResolvedValue(mockEntry)

      const request: ContentRequest = {
        params: { contentType: 'articles', id: '1' },
        body: {
          data: { title: 'Updated Article' }
        },
        context: mockContext
      }

      const response = await handler.update(request, mockContentEngine)

      expect(mockContentEngine.update).toHaveBeenCalledWith(
        'articles',
        '1',
        { title: 'Updated Article' },
        mockContext
      )

      expect(response.data).toEqual(mockEntry)
    })

    it('should return 400 if id is missing', async () => {
      const request: ContentRequest = {
        params: { contentType: 'articles' },
        body: { data: { title: 'Updated' } },
        context: mockContext
      }

      const response = await handler.update(request, mockContentEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
    })

    it('should return 400 if data is missing', async () => {
      const request: ContentRequest = {
        params: { contentType: 'articles', id: '1' },
        body: {},
        context: mockContext
      }

      const response = await handler.update(request, mockContentEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
    })
  })

  describe('delete', () => {
    it('should call contentEngine.delete and return deleted entry', async () => {
      const mockEntry: ContentEntry = {
        id: '1',
        title: 'Article to delete',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01'
      }

      mockContentEngine.findOne.mockResolvedValue(mockEntry)
      mockContentEngine.delete.mockResolvedValue(undefined)

      const request: ContentRequest = {
        params: { contentType: 'articles', id: '1' },
        context: mockContext
      }

      const response = await handler.delete(request, mockContentEngine)

      expect(mockContentEngine.findOne).toHaveBeenCalledWith(
        'articles',
        '1',
        {},
        mockContext
      )
      expect(mockContentEngine.delete).toHaveBeenCalledWith(
        'articles',
        '1',
        mockContext
      )

      expect(response.data).toEqual(mockEntry)
    })

    it('should return 400 if id is missing', async () => {
      const request: ContentRequest = {
        params: { contentType: 'articles' },
        context: mockContext
      }

      const response = await handler.delete(request, mockContentEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
    })

    it('should return 404 if entry not found', async () => {
      mockContentEngine.findOne.mockResolvedValue(null)

      const request: ContentRequest = {
        params: { contentType: 'articles', id: '999' },
        context: mockContext
      }

      const response = await handler.delete(request, mockContentEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(404)
    })
  })

  describe('publish', () => {
    it('should call contentEngine.publish', async () => {
      const mockEntry: ContentEntry = {
        id: '1',
        title: 'Article',
        publishedAt: '2024-01-02',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02'
      }

      mockContentEngine.publish.mockResolvedValue(mockEntry)

      const request: ContentRequest = {
        params: { contentType: 'articles', id: '1' },
        context: mockContext
      }

      const response = await handler.publish(request, mockContentEngine)

      expect(mockContentEngine.publish).toHaveBeenCalledWith(
        'articles',
        '1',
        mockContext
      )

      expect(response.data).toEqual(mockEntry)
      expect(response.data?.publishedAt).toBeDefined()
    })

    it('should return 400 if id is missing', async () => {
      const request: ContentRequest = {
        params: { contentType: 'articles' },
        context: mockContext
      }

      const response = await handler.publish(request, mockContentEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
    })
  })

  describe('unpublish', () => {
    it('should call contentEngine.unpublish', async () => {
      const mockEntry: ContentEntry = {
        id: '1',
        title: 'Article',
        publishedAt: null,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02'
      }

      mockContentEngine.unpublish.mockResolvedValue(mockEntry)

      const request: ContentRequest = {
        params: { contentType: 'articles', id: '1' },
        context: mockContext
      }

      const response = await handler.unpublish(request, mockContentEngine)

      expect(mockContentEngine.unpublish).toHaveBeenCalledWith(
        'articles',
        '1',
        mockContext
      )

      expect(response.data).toEqual(mockEntry)
      expect(response.data?.publishedAt).toBeNull()
    })

    it('should return 400 if id is missing', async () => {
      const request: ContentRequest = {
        params: { contentType: 'articles' },
        context: mockContext
      }

      const response = await handler.unpublish(request, mockContentEngine)

      expect(response.error).toBeDefined()
      expect(response.error?.status).toBe(400)
    })
  })

  describe('error handling', () => {
    it('should map ValidationError to 400', async () => {
      const error = new Error('Validation failed')
      error.name = 'ValidationError'

      mockContentEngine.create.mockRejectedValue(error)

      const request: ContentRequest = {
        params: { contentType: 'articles' },
        body: { data: {} },
        context: mockContext
      }

      const response = await handler.create(request, mockContentEngine)

      expect(response.error?.status).toBe(400)
      expect(response.error?.name).toBe('ValidationError')
    })

    it('should map UnauthorizedError to 401', async () => {
      const error = new Error('Unauthorized')
      error.name = 'UnauthorizedError'

      mockContentEngine.findMany.mockRejectedValue(error)

      const request: ContentRequest = {
        params: { contentType: 'articles' },
        context: mockContext
      }

      const response = await handler.findMany(request, mockContentEngine)

      expect(response.error?.status).toBe(401)
    })

    it('should map ForbiddenError to 403', async () => {
      const error = new Error('Forbidden')
      error.name = 'ForbiddenError'

      // Mock findOne to succeed but delete to fail with ForbiddenError
      mockContentEngine.findOne.mockResolvedValue({
        id: '1',
        title: 'Article',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01'
      })
      mockContentEngine.delete.mockRejectedValue(error)

      const request: ContentRequest = {
        params: { contentType: 'articles', id: '1' },
        context: mockContext
      }

      const response = await handler.delete(request, mockContentEngine)

      expect(response.error?.status).toBe(403)
    })

    it('should map NotFoundError to 404', async () => {
      const error = new Error('Not found')
      error.name = 'NotFoundError'

      mockContentEngine.update.mockRejectedValue(error)

      const request: ContentRequest = {
        params: { contentType: 'articles', id: '999' },
        body: { data: {} },
        context: mockContext
      }

      const response = await handler.update(request, mockContentEngine)

      expect(response.error?.status).toBe(404)
    })

    it('should map ConflictError to 409', async () => {
      const error = new Error('Slug already exists')
      error.name = 'ConflictError'

      mockContentEngine.create.mockRejectedValue(error)

      const request: ContentRequest = {
        params: { contentType: 'articles' },
        body: { data: { slug: 'existing-slug' } },
        context: mockContext
      }

      const response = await handler.create(request, mockContentEngine)

      expect(response.error?.status).toBe(409)
    })

    it('should default to 500 for unknown errors', async () => {
      const error = new Error('Unknown error')

      mockContentEngine.findMany.mockRejectedValue(error)

      const request: ContentRequest = {
        params: { contentType: 'articles' },
        context: mockContext
      }

      const response = await handler.findMany(request, mockContentEngine)

      expect(response.error?.status).toBe(500)
    })

    it('should handle non-Error objects', async () => {
      mockContentEngine.findMany.mockRejectedValue('string error')

      const request: ContentRequest = {
        params: { contentType: 'articles' },
        context: mockContext
      }

      const response = await handler.findMany(request, mockContentEngine)

      expect(response.error?.status).toBe(500)
      // String errors are converted to Error objects with name 'Error'
      expect(response.error?.name).toBe('Error')
      expect(response.error?.message).toBe('An unexpected error occurred. Please try again later.')
    })
  })
})
