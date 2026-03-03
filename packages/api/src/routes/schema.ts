/**
 * Schema Management API Route Handlers
 * 
 * Provides REST endpoints for content type schema management (Content Type Builder).
 * Implements Strapi-compatible API for schema CRUD operations.
 * 
 * @module routes/schema
 */

import type {
  ContentTypeSchema,
  RequestContext
} from '@cms/core'
import { handleError as errorHandler, type ErrorContext } from '../middleware/error-handler'
import { validateSchema } from '../utils/schema-validator'

/**
 * Request object interface for schema operations
 */
export interface SchemaRequest {
  params: {
    apiId?: string
  }
  body?: {
    data?: ContentTypeSchema | Partial<ContentTypeSchema>
  }
  context: RequestContext
}

/**
 * Response object interface for API responses
 */
export interface SchemaResponse<T = unknown> {
  data?: T
  error?: {
    status: number
    name: string
    message: string
    details?: unknown
  }
}

/**
 * Schema route handler class
 * 
 * Provides methods for handling schema management API requests.
 * Each method corresponds to a REST endpoint for the Content Type Builder.
 */
export class SchemaRouteHandler {
  /**
   * Handle GET /api/content-type-builder/content-types - List all content types
   * 
   * @param request - Request object
   * @param schemaEngine - SchemaEngine instance
   * @returns Response with array of content type schemas
   */
  async list(
    request: SchemaRequest,
    schemaEngine: any
  ): Promise<SchemaResponse<ContentTypeSchema[]>> {
    try {
      // Load all schemas from the schema engine
      const schemasMap = await schemaEngine.loadAllSchemas()
      
      // Convert Map to array
      const schemas = Array.from(schemasMap.values())

      return {
        data: schemas
      }
    } catch (error) {
      return this.handleError(error, {
        method: 'GET',
        path: '/api/content-type-builder/content-types',
        userId: (request.context as any).userId,
        role: request.context.role
      })
    }
  }

  /**
   * Handle GET /api/content-type-builder/content-types/:apiId - Get single content type
   * 
   * @param request - Request object with apiId parameter
   * @param schemaEngine - SchemaEngine instance
   * @returns Response with single content type schema
   */
  async get(
    request: SchemaRequest,
    schemaEngine: any
  ): Promise<SchemaResponse<ContentTypeSchema>> {
    try {
      const { apiId } = request.params

      if (!apiId) {
        return {
          error: {
            status: 400,
            name: 'BadRequestError',
            message: 'Content type apiId is required'
          }
        }
      }

      // Load schema from engine
      const schema = await schemaEngine.loadSchema(apiId)

      return {
        data: schema
      }
    } catch (error) {
      // Check if it's a "not found" error
      if (error instanceof Error && error.message.includes('Schema not found')) {
        return {
          error: {
            status: 404,
            name: 'NotFoundError',
            message: `Content type with apiId ${request.params.apiId} not found`
          }
        }
      }

      return this.handleError(error, {
        method: 'GET',
        path: `/api/content-type-builder/content-types/${request.params.apiId}`,
        userId: (request.context as any).userId,
        role: request.context.role
      })
    }
  }

  /**
   * Handle POST /api/content-type-builder/content-types - Create content type
   * 
   * @param request - Request object with schema data in body
   * @param schemaEngine - SchemaEngine instance
   * @returns Response with created content type schema
   */
  async create(
    request: SchemaRequest,
    schemaEngine: any
  ): Promise<SchemaResponse<ContentTypeSchema>> {
    try {
      const schema = request.body?.data

      if (!schema || typeof schema !== 'object') {
        return {
          error: {
            status: 400,
            name: 'BadRequestError',
            message: 'Request body must contain data object with schema'
          }
        }
      }

      // Validate schema structure
      const validationResult = validateSchema(schema)
      if (!validationResult.valid) {
        return {
          error: {
            status: 400,
            name: 'ValidationError',
            message: 'Schema validation failed',
            details: validationResult.errors
          }
        }
      }

      // Check if schema already exists
      try {
        await schemaEngine.loadSchema(schema.apiId)
        // If we get here, schema exists
        return {
          error: {
            status: 409,
            name: 'ConflictError',
            message: `Content type with apiId ${schema.apiId} already exists`
          }
        }
      } catch (error) {
        // Schema doesn't exist, which is what we want for creation
        if (error instanceof Error && !error.message.includes('Schema not found')) {
          throw error
        }
      }

      // Save the schema
      await schemaEngine.saveSchema(schema.apiId, schema as ContentTypeSchema)

      // Load and return the saved schema
      const savedSchema = await schemaEngine.loadSchema(schema.apiId)

      return {
        data: savedSchema
      }
    } catch (error) {
      return this.handleError(error, {
        method: 'POST',
        path: '/api/content-type-builder/content-types',
        userId: (request.context as any).userId,
        role: request.context.role
      })
    }
  }

  /**
   * Handle PUT /api/content-type-builder/content-types/:apiId - Update content type
   * 
   * @param request - Request object with apiId and schema data
   * @param schemaEngine - SchemaEngine instance
   * @returns Response with updated content type schema
   */
  async update(
    request: SchemaRequest,
    schemaEngine: any
  ): Promise<SchemaResponse<ContentTypeSchema>> {
    try {
      const { apiId } = request.params
      const updates = request.body?.data

      if (!apiId) {
        return {
          error: {
            status: 400,
            name: 'BadRequestError',
            message: 'Content type apiId is required'
          }
        }
      }

      if (!updates || typeof updates !== 'object') {
        return {
          error: {
            status: 400,
            name: 'BadRequestError',
            message: 'Request body must contain data object with schema updates'
          }
        }
      }

      // Load existing schema
      let existingSchema: ContentTypeSchema
      try {
        existingSchema = await schemaEngine.loadSchema(apiId)
      } catch (error) {
        if (error instanceof Error && error.message.includes('Schema not found')) {
          return {
            error: {
              status: 404,
              name: 'NotFoundError',
              message: `Content type with apiId ${apiId} not found`
            }
          }
        }
        throw error
      }

      // Merge updates with existing schema
      const updatedSchema: ContentTypeSchema = {
        ...existingSchema,
        ...updates,
        apiId // Ensure apiId cannot be changed
      }

      // Validate the updated schema
      const validationResult = validateSchema(updatedSchema)
      if (!validationResult.valid) {
        return {
          error: {
            status: 400,
            name: 'ValidationError',
            message: 'Schema validation failed',
            details: validationResult.errors
          }
        }
      }

      // Save the updated schema
      await schemaEngine.saveSchema(apiId, updatedSchema)

      // Load and return the updated schema
      const savedSchema = await schemaEngine.loadSchema(apiId)

      return {
        data: savedSchema
      }
    } catch (error) {
      return this.handleError(error, {
        method: 'PUT',
        path: `/api/content-type-builder/content-types/${request.params.apiId}`,
        userId: (request.context as any).userId,
        role: request.context.role
      })
    }
  }

  /**
   * Handle DELETE /api/content-type-builder/content-types/:apiId - Delete content type
   * 
   * @param request - Request object with apiId parameter
   * @param schemaEngine - SchemaEngine instance
   * @returns Response confirming deletion
   */
  async delete(
    request: SchemaRequest,
    schemaEngine: any
  ): Promise<SchemaResponse<{ apiId: string; deleted: boolean }>> {
    try {
      const { apiId } = request.params

      if (!apiId) {
        return {
          error: {
            status: 400,
            name: 'BadRequestError',
            message: 'Content type apiId is required'
          }
        }
      }

      // Check if schema exists before deletion
      try {
        await schemaEngine.loadSchema(apiId)
      } catch (error) {
        if (error instanceof Error && error.message.includes('Schema not found')) {
          return {
            error: {
              status: 404,
              name: 'NotFoundError',
              message: `Content type with apiId ${apiId} not found`
            }
          }
        }
        throw error
      }

      // Delete the schema
      await schemaEngine.deleteSchema(apiId)

      return {
        data: {
          apiId,
          deleted: true
        }
      }
    } catch (error) {
      return this.handleError(error, {
        method: 'DELETE',
        path: `/api/content-type-builder/content-types/${request.params.apiId}`,
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
  private handleError(error: unknown, context: ErrorContext = {}): SchemaResponse<never> {
    // Use centralized error handler
    const errorResponse = errorHandler(error, context)
    
    return {
      error: errorResponse.error
    }
  }
}

/**
 * Create a new SchemaRouteHandler instance
 * 
 * @returns SchemaRouteHandler instance
 */
export function createSchemaRouteHandler(): SchemaRouteHandler {
  return new SchemaRouteHandler()
}
