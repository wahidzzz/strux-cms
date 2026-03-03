/**
 * Content API Route Handlers
 * 
 * Provides REST endpoints for CRUD operations on content entries.
 * Implements Strapi-compatible API with query parameter parsing.
 * 
 * @module routes/content
 */

import type {
  ContentEntry,
  QueryParams,
  FilterGroup,
  SortParam,
  PaginationParam,
  PopulateParam,
  RequestContext,
  CreateData,
  UpdateData
} from '@cms/core'
import { handleError as errorHandler, type ErrorContext } from '../middleware/error-handler'

/**
 * Request object interface for content operations
 */
export interface ContentRequest {
  params: {
    contentType: string
    id?: string
  }
  query?: Record<string, unknown>
  body?: {
    data?: CreateData | UpdateData
  }
  context: RequestContext
}

/**
 * Response object interface for API responses
 */
export interface ContentResponse<T = unknown> {
  data?: T
  meta?: unknown
  error?: {
    status: number
    name: string
    message: string
    details?: unknown
  }
}

/**
 * Parse query parameters from request into QueryParams format
 * 
 * Supports Strapi-compatible query syntax:
 * - filters[field][$operator]=value
 * - sort=field:asc,field2:desc
 * - pagination[page]=1&pagination[pageSize]=25
 * - fields=field1,field2
 * - populate=relation1,relation2
 * - publicationState=live|preview
 * 
 * @param query - Raw query parameters from request
 * @returns Parsed QueryParams object
 */
export function parseQueryParams(query: Record<string, unknown>): QueryParams {
  const params: QueryParams = {}

  // Parse filters
  if (query.filters && typeof query.filters === 'object') {
    params.filters = parseFilters(query.filters as Record<string, unknown>)
  }

  // Parse sort
  if (query.sort && typeof query.sort === 'string') {
    params.sort = parseSort(query.sort)
  }

  // Parse pagination
  if (query.pagination && typeof query.pagination === 'object') {
    params.pagination = parsePagination(query.pagination as Record<string, unknown>)
  }

  // Parse fields
  if (query.fields) {
    if (typeof query.fields === 'string') {
      params.fields = query.fields.split(',').map(f => f.trim())
    } else if (Array.isArray(query.fields)) {
      params.fields = query.fields.map(f => String(f).trim())
    }
  }

  // Parse populate
  if (query.populate) {
    params.populate = parsePopulate(query.populate)
  }

  // Parse publicationState
  if (query.publicationState === 'live' || query.publicationState === 'preview') {
    params.publicationState = query.publicationState
  }

  return params
}

/**
 * Parse filter parameters into FilterGroup format
 * 
 * @param filters - Raw filter object
 * @returns Parsed FilterGroup
 */
function parseFilters(filters: Record<string, unknown>): FilterGroup {
  const result: FilterGroup = {}

  for (const [key, value] of Object.entries(filters)) {
    if (key === '$and' && Array.isArray(value)) {
      result.$and = value.map(f => parseFilters(f as Record<string, unknown>))
    } else if (key === '$or' && Array.isArray(value)) {
      result.$or = value.map(f => parseFilters(f as Record<string, unknown>))
    } else if (key === '$not' && typeof value === 'object' && value !== null) {
      result.$not = parseFilters(value as Record<string, unknown>)
    } else if (typeof value === 'object' && value !== null) {
      // Field with operators
      result[key] = value
    } else {
      // Direct equality
      result[key] = { $eq: value }
    }
  }

  return result
}

/**
 * Parse sort parameter into SortParam array
 * 
 * Format: "field:asc,field2:desc" or "field:asc"
 * 
 * @param sort - Sort string
 * @returns Array of SortParam
 */
function parseSort(sort: string): SortParam[] {
  return sort.split(',').map(s => {
    const [field, order = 'asc'] = s.trim().split(':')
    return {
      field: field.trim(),
      order: (order.toLowerCase() === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc'
    }
  })
}

/**
 * Parse pagination parameters
 * 
 * Supports both page-based and offset-based pagination:
 * - pagination[page]=1&pagination[pageSize]=25
 * - pagination[start]=0&pagination[limit]=25
 * 
 * @param pagination - Pagination object
 * @returns Parsed PaginationParam
 */
function parsePagination(pagination: Record<string, unknown>): PaginationParam {
  const result: PaginationParam = {}

  if (typeof pagination.page === 'number' || typeof pagination.page === 'string') {
    result.page = Number(pagination.page)
  }

  if (typeof pagination.pageSize === 'number' || typeof pagination.pageSize === 'string') {
    result.pageSize = Number(pagination.pageSize)
  }

  if (typeof pagination.start === 'number' || typeof pagination.start === 'string') {
    result.start = Number(pagination.start)
  }

  if (typeof pagination.limit === 'number' || typeof pagination.limit === 'string') {
    result.limit = Number(pagination.limit)
  }

  return result
}

/**
 * Parse populate parameter
 * 
 * Supports:
 * - populate=relation1,relation2 (simple)
 * - populate[relation1]=true (object notation)
 * - populate[relation1][fields]=field1,field2 (selective)
 * 
 * @param populate - Populate parameter
 * @returns Parsed PopulateParam
 */
function parsePopulate(populate: unknown): PopulateParam {
  if (typeof populate === 'string') {
    // Simple comma-separated list
    const result: PopulateParam = {}
    populate.split(',').forEach(rel => {
      result[rel.trim()] = true
    })
    return result
  }

  if (typeof populate === 'object' && populate !== null) {
    const result: PopulateParam = {}
    for (const [key, value] of Object.entries(populate)) {
      if (value === true || value === 'true') {
        result[key] = true
      } else if (typeof value === 'object' && value !== null) {
        const config: { fields?: string[]; populate?: PopulateParam } = {}
        const valueObj = value as Record<string, unknown>
        
        if (valueObj.fields) {
          if (typeof valueObj.fields === 'string') {
            config.fields = valueObj.fields.split(',').map(f => f.trim())
          } else if (Array.isArray(valueObj.fields)) {
            config.fields = valueObj.fields.map(f => String(f).trim())
          }
        }
        
        if (valueObj.populate) {
          config.populate = parsePopulate(valueObj.populate)
        }
        
        result[key] = config
      }
    }
    return result
  }

  return {}
}

/**
 * Content route handler class
 * 
 * Provides methods for handling content API requests.
 * Each method corresponds to a REST endpoint.
 */
export class ContentRouteHandler {
  /**
   * Handle GET /api/:contentType - Find many entries
   * 
   * @param request - Request object with query parameters
   * @param contentEngine - ContentEngine instance
   * @returns Response with paginated results
   */
  async findMany(
    request: ContentRequest,
    contentEngine: any
  ): Promise<ContentResponse<ContentEntry[]>> {
    try {
      const { contentType } = request.params
      const queryParams = parseQueryParams(request.query || {})

      const result = await contentEngine.findMany(
        contentType,
        queryParams,
        request.context
      )

      return {
        data: result.data,
        meta: result.meta
      }
    } catch (error) {
      return this.handleError(error, {
        method: 'GET',
        path: `/api/${request.params.contentType}`,
        contentType: request.params.contentType,
        userId: (request.context as any).userId,
        role: request.context.role
      })
    }
  }

  /**
   * Handle GET /api/:contentType/:id - Find one entry
   * 
   * @param request - Request object with id parameter
   * @param contentEngine - ContentEngine instance
   * @returns Response with single entry
   */
  async findOne(
    request: ContentRequest,
    contentEngine: any
  ): Promise<ContentResponse<ContentEntry>> {
    try {
      const { contentType, id } = request.params
      
      if (!id) {
        return {
          error: {
            status: 400,
            name: 'BadRequestError',
            message: 'Entry ID is required'
          }
        }
      }

      const queryParams = parseQueryParams(request.query || {})

      const entry = await contentEngine.findOne(
        contentType,
        id,
        queryParams,
        request.context
      )

      if (!entry) {
        return {
          error: {
            status: 404,
            name: 'NotFoundError',
            message: `Entry with id ${id} not found in ${contentType}`
          }
        }
      }

      return {
        data: entry
      }
    } catch (error) {
      return this.handleError(error, {
        method: 'GET',
        path: `/api/${request.params.contentType}/${request.params.id}`,
        contentType: request.params.contentType,
        entryId: request.params.id,
        userId: (request.context as any).userId,
        role: request.context.role
      })
    }
  }

  /**
   * Handle POST /api/:contentType - Create entry
   * 
   * @param request - Request object with data in body
   * @param contentEngine - ContentEngine instance
   * @returns Response with created entry
   */
  async create(
    request: ContentRequest,
    contentEngine: any
  ): Promise<ContentResponse<ContentEntry>> {
    try {
      const { contentType } = request.params
      const data = request.body?.data

      if (!data || typeof data !== 'object') {
        return {
          error: {
            status: 400,
            name: 'BadRequestError',
            message: 'Request body must contain data object'
          }
        }
      }

      const entry = await contentEngine.create(
        contentType,
        data,
        request.context
      )

      return {
        data: entry
      }
    } catch (error) {
      return this.handleError(error, {
        method: 'POST',
        path: `/api/${request.params.contentType}`,
        contentType: request.params.contentType,
        userId: (request.context as any).userId,
        role: request.context.role
      })
    }
  }

  /**
   * Handle PUT /api/:contentType/:id - Update entry
   * 
   * @param request - Request object with id and data
   * @param contentEngine - ContentEngine instance
   * @returns Response with updated entry
   */
  async update(
    request: ContentRequest,
    contentEngine: any
  ): Promise<ContentResponse<ContentEntry>> {
    try {
      const { contentType, id } = request.params
      const data = request.body?.data

      if (!id) {
        return {
          error: {
            status: 400,
            name: 'BadRequestError',
            message: 'Entry ID is required'
          }
        }
      }

      if (!data || typeof data !== 'object') {
        return {
          error: {
            status: 400,
            name: 'BadRequestError',
            message: 'Request body must contain data object'
          }
        }
      }

      const entry = await contentEngine.update(
        contentType,
        id,
        data,
        request.context
      )

      return {
        data: entry
      }
    } catch (error) {
      return this.handleError(error, {
        method: 'PUT',
        path: `/api/${request.params.contentType}/${request.params.id}`,
        contentType: request.params.contentType,
        entryId: request.params.id,
        userId: (request.context as any).userId,
        role: request.context.role
      })
    }
  }

  /**
   * Handle DELETE /api/:contentType/:id - Delete entry
   * 
   * @param request - Request object with id parameter
   * @param contentEngine - ContentEngine instance
   * @returns Response with deleted entry
   */
  async delete(
    request: ContentRequest,
    contentEngine: any
  ): Promise<ContentResponse<ContentEntry>> {
    try {
      const { contentType, id } = request.params

      if (!id) {
        return {
          error: {
            status: 400,
            name: 'BadRequestError',
            message: 'Entry ID is required'
          }
        }
      }

      // Get the entry before deletion to return it
      const entry = await contentEngine.findOne(
        contentType,
        id,
        {},
        request.context
      )

      if (!entry) {
        return {
          error: {
            status: 404,
            name: 'NotFoundError',
            message: `Entry with id ${id} not found in ${contentType}`
          }
        }
      }

      await contentEngine.delete(contentType, id, request.context)

      return {
        data: entry
      }
    } catch (error) {
      return this.handleError(error, {
        method: 'DELETE',
        path: `/api/${request.params.contentType}/${request.params.id}`,
        contentType: request.params.contentType,
        entryId: request.params.id,
        userId: (request.context as any).userId,
        role: request.context.role
      })
    }
  }

  /**
   * Handle POST /api/:contentType/:id/publish - Publish entry
   * 
   * @param request - Request object with id parameter
   * @param contentEngine - ContentEngine instance
   * @returns Response with published entry
   */
  async publish(
    request: ContentRequest,
    contentEngine: any
  ): Promise<ContentResponse<ContentEntry>> {
    try {
      const { contentType, id } = request.params

      if (!id) {
        return {
          error: {
            status: 400,
            name: 'BadRequestError',
            message: 'Entry ID is required'
          }
        }
      }

      const entry = await contentEngine.publish(
        contentType,
        id,
        request.context
      )

      return {
        data: entry
      }
    } catch (error) {
      return this.handleError(error, {
        method: 'POST',
        path: `/api/${request.params.contentType}/${request.params.id}/publish`,
        contentType: request.params.contentType,
        entryId: request.params.id,
        userId: (request.context as any).userId,
        role: request.context.role
      })
    }
  }

  /**
   * Handle POST /api/:contentType/:id/unpublish - Unpublish entry
   * 
   * @param request - Request object with id parameter
   * @param contentEngine - ContentEngine instance
   * @returns Response with unpublished entry
   */
  async unpublish(
    request: ContentRequest,
    contentEngine: any
  ): Promise<ContentResponse<ContentEntry>> {
    try {
      const { contentType, id } = request.params

      if (!id) {
        return {
          error: {
            status: 400,
            name: 'BadRequestError',
            message: 'Entry ID is required'
          }
        }
      }

      const entry = await contentEngine.unpublish(
        contentType,
        id,
        request.context
      )

      return {
        data: entry
      }
    } catch (error) {
      return this.handleError(error, {
        method: 'POST',
        path: `/api/${request.params.contentType}/${request.params.id}/unpublish`,
        contentType: request.params.contentType,
        entryId: request.params.id,
        userId: (request.context as any).userId,
        role: request.context.role
      })
    }
  }

  /**
   * Handle errors and convert to API error response format
   * 
   * Uses the centralized error handling middleware for consistent
   * error transformation and logging.
   * 
   * @param error - Error object
   * @param context - Error context for logging
   * @returns Error response
   */
  private handleError(error: unknown, context: ErrorContext = {}): ContentResponse<never> {
    // Use centralized error handler
    const errorResponse = errorHandler(error, context)
    
    return {
      error: errorResponse.error
    }
  }
}

/**
 * Create a new ContentRouteHandler instance
 * 
 * @returns ContentRouteHandler instance
 */
export function createContentRouteHandler(): ContentRouteHandler {
  return new ContentRouteHandler()
}
