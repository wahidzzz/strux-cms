/**
 * Error Handling Middleware
 * 
 * Provides centralized error handling for API requests.
 * Catches all errors from engines and route handlers, transforms them
 * to consistent API error format, and returns appropriate HTTP status codes.
 * 
 * @module middleware/error-handler
 */

/**
 * API error response format
 */
export interface APIError {
  status: number
  name: string
  message: string
  details?: unknown
}

/**
 * API error response wrapper
 */
export interface ErrorResponse {
  error: APIError
}

/**
 * Error context for logging
 */
export interface ErrorContext {
  method?: string
  path?: string
  contentType?: string
  entryId?: string
  userId?: string
  role?: string
  [key: string]: unknown
}

/**
 * Error handler options
 */
export interface ErrorHandlerOptions {
  /**
   * Whether to include stack traces in error responses (development only)
   */
  includeStackTrace?: boolean
  
  /**
   * Custom logger function
   */
  logger?: (error: Error, context: ErrorContext) => void
}

/**
 * Map of error names to HTTP status codes
 */
const ERROR_STATUS_MAP: Record<string, number> = {
  // 400 Bad Request - Client errors
  ValidationError: 400,
  BadRequestError: 400,
  InvalidInputError: 400,
  
  // 401 Unauthorized - Authentication errors
  UnauthorizedError: 401,
  AuthenticationError: 401,
  InvalidTokenError: 401,
  ExpiredTokenError: 401,
  
  // 403 Forbidden - Authorization errors
  ForbiddenError: 403,
  PermissionDeniedError: 403,
  AccessDeniedError: 403,
  
  // 404 Not Found - Resource not found
  NotFoundError: 404,
  ResourceNotFoundError: 404,
  EntryNotFoundError: 404,
  
  // 409 Conflict - Resource conflicts
  ConflictError: 409,
  UniqueConstraintError: 409,
  SlugConflictError: 409,
  DuplicateError: 409,
  
  // 500 Internal Server Error - Server errors
  InternalServerError: 500,
  FileSystemError: 500,
  GitError: 500,
  DatabaseError: 500,
  UnexpectedError: 500
}

/**
 * Sensitive field patterns to redact from error details
 */
const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /credential/i
]

/**
 * Default logger implementation
 * 
 * Logs errors to console with structured format.
 * In production, this should be replaced with a proper logging service.
 * 
 * @param error - Error object
 * @param context - Error context
 */
function defaultLogger(error: Error, context: ErrorContext): void {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    level: 'error',
    name: error.name,
    message: error.message,
    stack: error.stack,
    context
  }
  
  // In production, use structured logging (e.g., pino, winston)
  console.error(JSON.stringify(logEntry))
}

/**
 * Determine HTTP status code from error
 * 
 * Maps error names to appropriate HTTP status codes.
 * Falls back to 500 for unknown error types.
 * 
 * @param error - Error object
 * @returns HTTP status code
 */
export function getStatusCode(error: Error): number {
  // Check error name
  const errorName = error.name || error.constructor.name
  
  if (errorName in ERROR_STATUS_MAP) {
    return ERROR_STATUS_MAP[errorName]
  }
  
  // Check if error message contains specific patterns
  const message = error.message.toLowerCase()
  
  if (message.includes('not found')) {
    return 404
  }
  
  if (message.includes('permission denied') || message.includes('forbidden')) {
    return 403
  }
  
  if (message.includes('unauthorized') || message.includes('authentication')) {
    return 401
  }
  
  if (message.includes('validation') || message.includes('invalid')) {
    return 400
  }
  
  if (message.includes('conflict') || message.includes('already exists')) {
    return 409
  }
  
  // Default to 500 for unknown errors
  return 500
}

/**
 * Sanitize error message to avoid leaking sensitive information
 * 
 * Removes file paths, stack traces, and other internal details
 * that should not be exposed to clients.
 * 
 * @param message - Original error message
 * @returns Sanitized error message
 */
export function sanitizeMessage(message: string): string {
  // Remove absolute file paths
  let sanitized = message.replace(/\/[^\s]+\//g, '[path]/')
  
  // Remove stack trace lines
  sanitized = sanitized.split('\n')[0]
  
  // Remove internal error codes
  sanitized = sanitized.replace(/\[Error: [^\]]+\]/g, '')
  
  // Trim whitespace
  sanitized = sanitized.trim()
  
  return sanitized
}

/**
 * Redact sensitive fields from error details
 * 
 * Recursively traverses error details and redacts fields
 * that match sensitive patterns (password, token, etc.).
 * 
 * @param details - Error details object
 * @returns Redacted error details
 */
export function redactSensitiveFields(details: unknown): unknown {
  if (!details || typeof details !== 'object') {
    return details
  }
  
  if (Array.isArray(details)) {
    return details.map(item => redactSensitiveFields(item))
  }
  
  const redacted: Record<string, unknown> = {}
  
  for (const [key, value] of Object.entries(details)) {
    // Check if field name matches sensitive pattern
    const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(key))
    
    if (isSensitive) {
      redacted[key] = '[REDACTED]'
    } else if (value && typeof value === 'object') {
      redacted[key] = redactSensitiveFields(value)
    } else {
      redacted[key] = value
    }
  }
  
  return redacted
}

/**
 * Extract error details from error object
 * 
 * Extracts additional error information like validation errors,
 * field paths, and other contextual details.
 * 
 * @param error - Error object
 * @returns Error details or undefined
 */
export function extractErrorDetails(error: Error): unknown {
  const errorAny = error as any
  
  // Check for details property
  if (errorAny.details) {
    return redactSensitiveFields(errorAny.details)
  }
  
  // Check for errors array (validation errors)
  if (errorAny.errors && Array.isArray(errorAny.errors)) {
    return {
      errors: errorAny.errors.map((e: any) => ({
        path: e.path,
        message: e.message,
        type: e.type
      }))
    }
  }
  
  // Check for field property (conflict errors)
  if (errorAny.field) {
    return {
      field: errorAny.field,
      value: errorAny.value ? '[REDACTED]' : undefined
    }
  }
  
  return undefined
}

/**
 * Transform error to API error response format
 * 
 * Converts any error to a consistent API error response with
 * appropriate status code, sanitized message, and optional details.
 * 
 * @param error - Error object
 * @param options - Error handler options
 * @returns API error response
 */
export function transformError(
  error: Error,
  options: ErrorHandlerOptions = {}
): APIError {
  const status = getStatusCode(error)
  const name = error.name || error.constructor.name || 'Error'
  
  // Sanitize message for client consumption
  let message = sanitizeMessage(error.message)
  
  // For 500 errors, use generic message to avoid leaking internal details
  if (status === 500) {
    message = 'An unexpected error occurred. Please try again later.'
  }
  
  // Extract and redact error details
  const details = extractErrorDetails(error)
  
  // Build API error response
  const apiError: APIError = {
    status,
    name,
    message
  }
  
  // Include details if present
  if (details) {
    apiError.details = details
  }
  
  // Include stack trace in development mode
  if (options.includeStackTrace && error.stack) {
    if (typeof apiError.details === 'object' && apiError.details !== null) {
      apiError.details = {
        ...(apiError.details as Record<string, unknown>),
        stack: error.stack
      }
    } else {
      apiError.details = { stack: error.stack }
    }
  }
  
  return apiError
}

/**
 * Handle error and return API error response
 * 
 * Main error handling function that:
 * 1. Logs error with context
 * 2. Transforms error to API format
 * 3. Returns error response
 * 
 * @param error - Error object or unknown value
 * @param context - Error context for logging
 * @param options - Error handler options
 * @returns Error response
 */
export function handleError(
  error: unknown,
  context: ErrorContext = {},
  options: ErrorHandlerOptions = {}
): ErrorResponse {
  // Convert unknown error to Error object
  let errorObj: Error
  
  if (error instanceof Error) {
    errorObj = error
  } else if (typeof error === 'string') {
    errorObj = new Error(error)
  } else {
    errorObj = new Error('An unexpected error occurred')
    errorObj.name = 'UnexpectedError'
  }
  
  // Log error with context
  const logger = options.logger || defaultLogger
  logger(errorObj, context)
  
  // Transform error to API format
  const apiError = transformError(errorObj, options)
  
  return {
    error: apiError
  }
}

/**
 * Create error handler middleware for specific context
 * 
 * Returns a function that handles errors with pre-configured context.
 * Useful for route handlers that want to provide consistent error handling.
 * 
 * @param baseContext - Base context to include in all error logs
 * @param options - Error handler options
 * @returns Error handler function
 */
export function createErrorHandler(
  baseContext: ErrorContext = {},
  options: ErrorHandlerOptions = {}
) {
  return (error: unknown, additionalContext: ErrorContext = {}): ErrorResponse => {
    const context = { ...baseContext, ...additionalContext }
    return handleError(error, context, options)
  }
}

/**
 * Wrap async function with error handling
 * 
 * Wraps an async function to automatically catch and handle errors.
 * Useful for route handlers that want automatic error handling.
 * 
 * @param fn - Async function to wrap
 * @param context - Error context
 * @param options - Error handler options
 * @returns Wrapped function that returns result or error response
 */
export function withErrorHandling<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T>,
  context: ErrorContext = {},
  options: ErrorHandlerOptions = {}
): (...args: Args) => Promise<T | ErrorResponse> {
  return async (...args: Args): Promise<T | ErrorResponse> => {
    try {
      return await fn(...args)
    } catch (error) {
      return handleError(error, context, options)
    }
  }
}
