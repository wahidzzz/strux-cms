/**
 * Error Handler Middleware Tests
 * 
 * Tests for error handling middleware including:
 * - Status code mapping
 * - Message sanitization
 * - Sensitive field redaction
 * - Error transformation
 * - Logging
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getStatusCode,
  sanitizeMessage,
  redactSensitiveFields,
  extractErrorDetails,
  transformError,
  handleError,
  createErrorHandler,
  withErrorHandling,
  type ErrorContext,
  type ErrorHandlerOptions
} from './error-handler'

describe('Error Handler Middleware', () => {
  describe('getStatusCode', () => {
    it('should return 400 for ValidationError', () => {
      const error = new Error('Validation failed')
      error.name = 'ValidationError'
      
      expect(getStatusCode(error)).toBe(400)
    })

    it('should return 401 for UnauthorizedError', () => {
      const error = new Error('Unauthorized')
      error.name = 'UnauthorizedError'
      
      expect(getStatusCode(error)).toBe(401)
    })

    it('should return 403 for ForbiddenError', () => {
      const error = new Error('Forbidden')
      error.name = 'ForbiddenError'
      
      expect(getStatusCode(error)).toBe(403)
    })

    it('should return 404 for NotFoundError', () => {
      const error = new Error('Not found')
      error.name = 'NotFoundError'
      
      expect(getStatusCode(error)).toBe(404)
    })

    it('should return 409 for ConflictError', () => {
      const error = new Error('Conflict')
      error.name = 'ConflictError'
      
      expect(getStatusCode(error)).toBe(409)
    })

    it('should return 500 for unknown error types', () => {
      const error = new Error('Something went wrong')
      error.name = 'UnknownError'
      
      expect(getStatusCode(error)).toBe(500)
    })

    it('should infer 404 from message containing "not found"', () => {
      const error = new Error('Entry not found')
      
      expect(getStatusCode(error)).toBe(404)
    })

    it('should infer 403 from message containing "permission denied"', () => {
      const error = new Error('Permission denied')
      
      expect(getStatusCode(error)).toBe(403)
    })

    it('should infer 401 from message containing "unauthorized"', () => {
      const error = new Error('Unauthorized access')
      
      expect(getStatusCode(error)).toBe(401)
    })

    it('should infer 400 from message containing "validation"', () => {
      const error = new Error('Validation error occurred')
      
      expect(getStatusCode(error)).toBe(400)
    })

    it('should infer 409 from message containing "conflict"', () => {
      const error = new Error('Resource conflict detected')
      
      expect(getStatusCode(error)).toBe(409)
    })
  })

  describe('sanitizeMessage', () => {
    it('should remove absolute file paths', () => {
      const message = 'Error in /home/user/project/src/file.ts'
      const sanitized = sanitizeMessage(message)
      
      expect(sanitized).toBe('Error in [path]/file.ts')
      expect(sanitized).not.toContain('/home/user')
    })

    it('should remove stack trace lines', () => {
      const message = 'Error occurred\n    at Function.test (file.ts:10:5)'
      const sanitized = sanitizeMessage(message)
      
      expect(sanitized).toBe('Error occurred')
      expect(sanitized).not.toContain('at Function')
    })

    it('should remove internal error codes', () => {
      const message = 'Operation failed [Error: ENOENT]'
      const sanitized = sanitizeMessage(message)
      
      expect(sanitized).toBe('Operation failed')
      expect(sanitized).not.toContain('[Error:')
    })

    it('should trim whitespace', () => {
      const message = '  Error message  '
      const sanitized = sanitizeMessage(message)
      
      expect(sanitized).toBe('Error message')
    })

    it('should handle empty messages', () => {
      const message = ''
      const sanitized = sanitizeMessage(message)
      
      expect(sanitized).toBe('')
    })
  })

  describe('redactSensitiveFields', () => {
    it('should redact password fields', () => {
      const details = {
        username: 'john',
        password: 'secret123',
        email: 'john@example.com'
      }
      
      const redacted = redactSensitiveFields(details) as Record<string, unknown>
      
      expect(redacted.username).toBe('john')
      expect(redacted.password).toBe('[REDACTED]')
      expect(redacted.email).toBe('john@example.com')
    })

    it('should redact token fields', () => {
      const details = {
        userId: '123',
        accessToken: 'abc123',
        refreshToken: 'def456'
      }
      
      const redacted = redactSensitiveFields(details) as Record<string, unknown>
      
      expect(redacted.userId).toBe('123')
      expect(redacted.accessToken).toBe('[REDACTED]')
      expect(redacted.refreshToken).toBe('[REDACTED]')
    })

    it('should redact secret fields', () => {
      const details = {
        apiKey: 'key123',
        apiSecret: 'secret456',
        jwtSecret: 'jwt789'
      }
      
      const redacted = redactSensitiveFields(details) as Record<string, unknown>
      
      expect(redacted.apiKey).toBe('[REDACTED]')
      expect(redacted.apiSecret).toBe('[REDACTED]')
      expect(redacted.jwtSecret).toBe('[REDACTED]')
    })

    it('should handle nested objects', () => {
      const details = {
        user: {
          username: 'john',
          password: 'secret123'
        },
        config: {
          apiKey: 'key123'
        }
      }
      
      const redacted = redactSensitiveFields(details) as Record<string, unknown>
      const user = redacted.user as Record<string, unknown>
      const config = redacted.config as Record<string, unknown>
      
      expect(user.username).toBe('john')
      expect(user.password).toBe('[REDACTED]')
      expect(config.apiKey).toBe('[REDACTED]')
    })

    it('should handle arrays', () => {
      const details = {
        users: [
          { username: 'john', password: 'secret1' },
          { username: 'jane', password: 'secret2' }
        ]
      }
      
      const redacted = redactSensitiveFields(details) as Record<string, unknown>
      const users = redacted.users as Array<Record<string, unknown>>
      
      expect(users[0].username).toBe('john')
      expect(users[0].password).toBe('[REDACTED]')
      expect(users[1].username).toBe('jane')
      expect(users[1].password).toBe('[REDACTED]')
    })

    it('should handle null and undefined', () => {
      expect(redactSensitiveFields(null)).toBe(null)
      expect(redactSensitiveFields(undefined)).toBe(undefined)
    })

    it('should handle primitive values', () => {
      expect(redactSensitiveFields('string')).toBe('string')
      expect(redactSensitiveFields(123)).toBe(123)
      expect(redactSensitiveFields(true)).toBe(true)
    })
  })

  describe('extractErrorDetails', () => {
    it('should extract details property', () => {
      const error = new Error('Test error') as any
      error.details = { field: 'title', value: 'test' }
      
      const details = extractErrorDetails(error)
      
      expect(details).toEqual({ field: 'title', value: 'test' })
    })

    it('should extract validation errors', () => {
      const error = new Error('Validation failed') as any
      error.errors = [
        { path: ['title'], message: 'Required', type: 'required' },
        { path: ['email'], message: 'Invalid email', type: 'format' }
      ]
      
      const details = extractErrorDetails(error) as any
      
      expect(details.errors).toHaveLength(2)
      expect(details.errors[0]).toEqual({
        path: ['title'],
        message: 'Required',
        type: 'required'
      })
    })

    it('should extract field property for conflict errors', () => {
      const error = new Error('Conflict') as any
      error.field = 'slug'
      error.value = 'existing-slug'
      
      const details = extractErrorDetails(error) as any
      
      expect(details.field).toBe('slug')
      expect(details.value).toBe('[REDACTED]')
    })

    it('should return undefined for errors without details', () => {
      const error = new Error('Simple error')
      
      const details = extractErrorDetails(error)
      
      expect(details).toBeUndefined()
    })

    it('should redact sensitive fields in details', () => {
      const error = new Error('Test error') as any
      error.details = {
        username: 'john',
        password: 'secret123'
      }
      
      const details = extractErrorDetails(error) as any
      
      expect(details.username).toBe('john')
      expect(details.password).toBe('[REDACTED]')
    })
  })

  describe('transformError', () => {
    it('should transform ValidationError to API error', () => {
      const error = new Error('Validation failed')
      error.name = 'ValidationError'
      
      const apiError = transformError(error)
      
      expect(apiError.status).toBe(400)
      expect(apiError.name).toBe('ValidationError')
      expect(apiError.message).toBe('Validation failed')
    })

    it('should transform UnauthorizedError to API error', () => {
      const error = new Error('Invalid token')
      error.name = 'UnauthorizedError'
      
      const apiError = transformError(error)
      
      expect(apiError.status).toBe(401)
      expect(apiError.name).toBe('UnauthorizedError')
      expect(apiError.message).toBe('Invalid token')
    })

    it('should use generic message for 500 errors', () => {
      const error = new Error('Internal database connection failed')
      error.name = 'InternalServerError'
      
      const apiError = transformError(error)
      
      expect(apiError.status).toBe(500)
      expect(apiError.message).toBe('An unexpected error occurred. Please try again later.')
      expect(apiError.message).not.toContain('database')
    })

    it('should include error details when present', () => {
      const error = new Error('Validation failed') as any
      error.name = 'ValidationError'
      error.details = { field: 'title' }
      
      const apiError = transformError(error)
      
      expect(apiError.details).toEqual({ field: 'title' })
    })

    it('should include stack trace in development mode', () => {
      const error = new Error('Test error')
      error.stack = 'Error: Test error\n    at test.ts:10:5'
      
      const apiError = transformError(error, { includeStackTrace: true })
      
      expect(apiError.details).toBeDefined()
      expect((apiError.details as any).stack).toContain('Error: Test error')
    })

    it('should not include stack trace by default', () => {
      const error = new Error('Test error')
      error.stack = 'Error: Test error\n    at test.ts:10:5'
      
      const apiError = transformError(error)
      
      if (apiError.details) {
        expect((apiError.details as any).stack).toBeUndefined()
      }
    })

    it('should sanitize error messages', () => {
      const error = new Error('Error in /home/user/project/file.ts')
      error.name = 'ValidationError'
      
      const apiError = transformError(error)
      
      expect(apiError.message).not.toContain('/home/user')
      expect(apiError.message).toContain('[path]')
    })
  })

  describe('handleError', () => {
    let mockLogger: ReturnType<typeof vi.fn>

    beforeEach(() => {
      mockLogger = vi.fn()
    })

    it('should handle Error objects', () => {
      const error = new Error('Test error')
      error.name = 'ValidationError'
      
      const response = handleError(error, {}, { logger: mockLogger })
      
      expect(response.error.status).toBe(400)
      expect(response.error.name).toBe('ValidationError')
      expect(mockLogger).toHaveBeenCalledWith(error, {})
    })

    it('should handle string errors', () => {
      const response = handleError('Something went wrong', {}, { logger: mockLogger })
      
      expect(response.error.status).toBe(500)
      expect(response.error.message).toBe('An unexpected error occurred. Please try again later.')
      expect(mockLogger).toHaveBeenCalled()
    })

    it('should handle unknown error types', () => {
      const response = handleError({ unknown: 'error' }, {}, { logger: mockLogger })
      
      expect(response.error.status).toBe(500)
      expect(response.error.name).toBe('UnexpectedError')
      expect(mockLogger).toHaveBeenCalled()
    })

    it('should log error with context', () => {
      const error = new Error('Test error')
      const context: ErrorContext = {
        method: 'POST',
        path: '/api/articles',
        userId: 'user-123'
      }
      
      handleError(error, context, { logger: mockLogger })
      
      expect(mockLogger).toHaveBeenCalledWith(error, context)
    })

    it('should use default logger when not provided', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      const error = new Error('Test error')
      handleError(error)
      
      expect(consoleSpy).toHaveBeenCalled()
      
      consoleSpy.mockRestore()
    })
  })

  describe('createErrorHandler', () => {
    it('should create error handler with base context', () => {
      const mockLogger = vi.fn()
      const baseContext: ErrorContext = {
        method: 'GET',
        path: '/api/articles'
      }
      
      const errorHandler = createErrorHandler(baseContext, { logger: mockLogger })
      
      const error = new Error('Test error')
      const response = errorHandler(error, { userId: 'user-123' })
      
      expect(response.error).toBeDefined()
      expect(mockLogger).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          method: 'GET',
          path: '/api/articles',
          userId: 'user-123'
        })
      )
    })

    it('should merge base and additional context', () => {
      const mockLogger = vi.fn()
      const baseContext: ErrorContext = {
        service: 'api'
      }
      
      const errorHandler = createErrorHandler(baseContext, { logger: mockLogger })
      
      const error = new Error('Test error')
      errorHandler(error, { operation: 'create' })
      
      expect(mockLogger).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          service: 'api',
          operation: 'create'
        })
      )
    })
  })

  describe('withErrorHandling', () => {
    it('should return result when function succeeds', async () => {
      const fn = async (value: number) => value * 2
      const wrapped = withErrorHandling(fn)
      
      const result = await wrapped(5)
      
      expect(result).toBe(10)
    })

    it('should return error response when function throws', async () => {
      const fn = async () => {
        throw new Error('Test error')
      }
      const wrapped = withErrorHandling(fn)
      
      const result = await wrapped()
      
      expect(result).toHaveProperty('error')
      expect((result as any).error.message).toBeDefined()
    })

    it('should pass context to error handler', async () => {
      const mockLogger = vi.fn()
      const context: ErrorContext = {
        operation: 'test'
      }
      
      const fn = async () => {
        throw new Error('Test error')
      }
      const wrapped = withErrorHandling(fn, context, { logger: mockLogger })
      
      await wrapped()
      
      expect(mockLogger).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ operation: 'test' })
      )
    })

    it('should preserve function arguments', async () => {
      const fn = async (a: number, b: string, c: boolean) => {
        return { a, b, c }
      }
      const wrapped = withErrorHandling(fn)
      
      const result = await wrapped(42, 'test', true)
      
      expect(result).toEqual({ a: 42, b: 'test', c: true })
    })
  })

  describe('Integration scenarios', () => {
    it('should handle validation error with details', () => {
      const error = new Error('Validation failed') as any
      error.name = 'ValidationError'
      error.errors = [
        { path: ['title'], message: 'Required', type: 'required' }
      ]
      
      const response = handleError(error, {
        method: 'POST',
        path: '/api/articles'
      })
      
      expect(response.error.status).toBe(400)
      expect(response.error.name).toBe('ValidationError')
      expect(response.error.details).toBeDefined()
      expect((response.error.details as any).errors).toHaveLength(1)
    })

    it('should handle permission denied error', () => {
      const error = new Error('Permission denied: User does not have permission to delete articles/123')
      error.name = 'ForbiddenError'
      
      const response = handleError(error, {
        method: 'DELETE',
        path: '/api/articles/123',
        userId: 'user-456',
        role: 'editor'
      })
      
      expect(response.error.status).toBe(403)
      expect(response.error.name).toBe('ForbiddenError')
    })

    it('should handle not found error', () => {
      const error = new Error('Entry not found: articles/999')
      error.name = 'NotFoundError'
      
      const response = handleError(error, {
        method: 'GET',
        path: '/api/articles/999'
      })
      
      expect(response.error.status).toBe(404)
      expect(response.error.name).toBe('NotFoundError')
    })

    it('should handle conflict error with field details', () => {
      const error = new Error('Slug conflict: "my-article" already exists') as any
      error.name = 'ConflictError'
      error.field = 'slug'
      error.value = 'my-article'
      
      const response = handleError(error, {
        method: 'POST',
        path: '/api/articles'
      })
      
      expect(response.error.status).toBe(409)
      expect(response.error.name).toBe('ConflictError')
      expect(response.error.details).toBeDefined()
      expect((response.error.details as any).field).toBe('slug')
    })

    it('should handle file system error with sanitized message', () => {
      const error = new Error('Failed to write file: /home/user/cms/content/articles/1.json')
      error.name = 'FileSystemError'
      
      const response = handleError(error)
      
      expect(response.error.status).toBe(500)
      expect(response.error.message).toBe('An unexpected error occurred. Please try again later.')
      expect(response.error.message).not.toContain('/home/user')
    })
  })
})
