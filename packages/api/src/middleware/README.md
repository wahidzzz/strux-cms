# Authentication Middleware

JWT-based authentication middleware for the Jayson CMS API.

## Overview

The authentication middleware provides JWT token extraction, verification, and request context creation. It validates tokens from the `Authorization` header and attaches user information to the request context.

## Features

- **JWT Token Extraction**: Extracts Bearer tokens from Authorization header
- **Token Verification**: Verifies JWT signature and expiration
- **User Context**: Decodes user ID and role from token payload
- **Error Handling**: Returns 401 Unauthorized for invalid/missing tokens
- **Optional Authentication**: Supports endpoints with optional authentication

## Usage

### Required Authentication

Use `authenticate()` for endpoints that require authentication:

```typescript
import { authenticate } from './middleware/auth'
import { CMS } from '@cms/core'

// Initialize CMS to get JWT secret
const cms = new CMS('./data')
await cms.initialize()
const jwtSecret = cms.getConfig().jwt.secret

// In your route handler
const request = {
  headers: {
    authorization: req.headers.authorization
  }
}

const authResult = authenticate(request, jwtSecret)

if (!authResult.success) {
  // Return 401 error
  return {
    error: authResult.error
  }
}

// Use authenticated context
const context = authResult.context
// Access user ID if needed
const userId = (context as any).userId
const result = await contentEngine.create(
  'articles',
  data,
  context
)
```

### Optional Authentication

Use `optionalAuthenticate()` for endpoints that support both authenticated and public access:

```typescript
import { optionalAuthenticate } from './middleware/auth'

const authResult = optionalAuthenticate(request, jwtSecret)

if (!authResult.success) {
  // Token was provided but invalid
  return {
    error: authResult.error
  }
}

// Context will have either user info or public role
const context = authResult.context
const results = await contentEngine.findMany(
  'articles',
  queryParams,
  context
)
```

## API Reference

### `extractToken(authHeader: string | undefined): string | null`

Extracts JWT token from Authorization header.

**Parameters:**
- `authHeader` - Authorization header value (e.g., "Bearer <token>")

**Returns:**
- JWT token string or `null` if not found

**Example:**
```typescript
const token = extractToken('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
// Returns: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

### `verifyToken(token: string, secret: string): JWTPayload | null`

Verifies JWT token signature and decodes payload.

**Parameters:**
- `token` - JWT token string
- `secret` - JWT secret key for verification

**Returns:**
- Decoded `JWTPayload` or `null` if invalid

**Example:**
```typescript
const payload = verifyToken(token, jwtSecret)
if (payload) {
  console.log(`User ID: ${payload.id}, Role: ${payload.role}`)
}
```

### `authenticate(request: AuthRequest, jwtSecret: string): AuthResult`

Main authentication middleware. Requires valid JWT token.

**Parameters:**
- `request` - Request object with headers
- `jwtSecret` - JWT secret key

**Returns:**
- `AuthResult` with success status, context, or error

**Example:**
```typescript
const result = authenticate(request, jwtSecret)

if (result.success) {
  // Access user context
  const userId = (result.context as any).userId
  const role = result.context.role
} else {
  // Handle authentication error
  return { error: result.error }
}
```

### `optionalAuthenticate(request: AuthRequest, jwtSecret: string): AuthResult`

Optional authentication middleware. Allows requests without tokens.

**Parameters:**
- `request` - Request object with headers
- `jwtSecret` - JWT secret key

**Returns:**
- `AuthResult` with success status and context (always succeeds if no token)

**Example:**
```typescript
const result = optionalAuthenticate(request, jwtSecret)

if (result.success) {
  if ((result.context as any).userId) {
    // Authenticated user
    console.log(`User: ${(result.context as any).userId}`)
  } else {
    // Public access
    console.log(`Role: ${result.context.role}`) // 'public'
  }
}
```

## Types

### `JWTPayload`

```typescript
interface JWTPayload {
  id: string        // User ID
  role: string      // User role (admin, editor, authenticated, public)
  iat: number       // Issued at timestamp
  exp: number       // Expiration timestamp
}
```

### `AuthRequest`

```typescript
interface AuthRequest {
  headers: {
    authorization?: string
  }
  context?: RequestContext
}
```

### `AuthResult`

```typescript
interface AuthResult {
  success: boolean
  context?: RequestContext
  error?: {
    status: number
    name: string
    message: string
  }
}
```

## Error Responses

### 401 Unauthorized - Missing Token

```json
{
  "status": 401,
  "name": "UnauthorizedError",
  "message": "Missing or invalid Authorization header"
}
```

### 401 Unauthorized - Invalid Token

```json
{
  "status": 401,
  "name": "UnauthorizedError",
  "message": "Invalid or expired token"
}
```

## Security Considerations

1. **Token Expiration**: Tokens expire after the configured duration (default 7 days)
2. **Signature Verification**: All tokens are verified against the JWT secret
3. **Required Fields**: Tokens must contain `id` and `role` fields
4. **Bearer Scheme**: Only Bearer token format is supported
5. **Case Insensitive**: Bearer scheme is case-insensitive (Bearer, bearer, BEARER)

## Integration with Content Routes

Example integration with ContentRouteHandler:

```typescript
import { ContentRouteHandler } from './routes/content'
import { authenticate } from './middleware/auth'
import { CMS } from '@cms/core'

const cms = new CMS('./data')
await cms.initialize()
const jwtSecret = cms.getConfig().jwt.secret
const contentEngine = cms.getContentEngine()
const handler = new ContentRouteHandler()

// Wrap route handler with authentication
async function handleCreateRequest(req: any) {
  // Authenticate request
  const authResult = authenticate(
    { headers: req.headers },
    jwtSecret
  )

  if (!authResult.success) {
    return { error: authResult.error }
  }

  // Create content request with authenticated context
  const contentRequest = {
    params: { contentType: req.params.contentType },
    body: req.body,
    context: authResult.context
  }

  // Handle request
  return await handler.create(contentRequest, contentEngine)
}
```

## Testing

The middleware includes comprehensive tests covering:

- Token extraction from various header formats
- Token verification with valid/invalid/expired tokens
- Authentication with missing/invalid tokens
- Optional authentication with and without tokens
- Integration scenarios with complete auth flow

Run tests:

```bash
npm test -- auth.test.ts
```

## Requirements

Validates requirements:
- **8.1**: Password hashing and user storage
- **8.2**: JWT token generation and verification
- **8.3**: JWT token signature and expiration
- **8.4**: Token verification on authenticated requests
- **8.5**: Return 401 for expired/invalid tokens


---

# Error Handler Middleware

Centralized error handling middleware for the Jayson CMS API.

## Overview

The error handler middleware provides consistent error transformation, logging, and response formatting across all API endpoints. It catches errors from engines and route handlers, maps them to appropriate HTTP status codes, and sanitizes error messages to avoid leaking sensitive information.

## Features

- **Automatic Error Mapping**: Maps error types to HTTP status codes (400, 401, 403, 404, 409, 500)
- **Consistent Error Format**: Transforms all errors to a standard API error response format
- **Error Logging**: Logs errors with context for debugging and monitoring
- **Message Sanitization**: Removes file paths, stack traces, and internal details from error messages
- **Sensitive Field Redaction**: Automatically redacts passwords, tokens, secrets, and API keys
- **Security**: Uses generic messages for 500 errors to avoid leaking internal implementation details

## Error Status Code Mapping

| Status Code | Error Types | Description |
|-------------|-------------|-------------|
| 400 | ValidationError, BadRequestError, InvalidInputError | Client input errors |
| 401 | UnauthorizedError, AuthenticationError, InvalidTokenError | Authentication failures |
| 403 | ForbiddenError, PermissionDeniedError, AccessDeniedError | Authorization failures |
| 404 | NotFoundError, ResourceNotFoundError, EntryNotFoundError | Resource not found |
| 409 | ConflictError, UniqueConstraintError, SlugConflictError | Resource conflicts |
| 500 | All other errors | Internal server errors |

## Usage

### Basic Error Handling

```typescript
import { handleError } from './middleware/error-handler'

try {
  const entry = await contentEngine.create('articles', data, context)
  return { data: entry }
} catch (error) {
  return handleError(error, {
    method: 'POST',
    path: '/api/articles',
    contentType: 'articles',
    userId: 'user-123',
    role: 'editor'
  })
}
```

### Create Error Handler with Base Context

```typescript
import { createErrorHandler } from './middleware/error-handler'

const errorHandler = createErrorHandler({
  service: 'api',
  version: '1.0',
  environment: 'production'
})

// Use in route handlers
try {
  // Your code here
} catch (error) {
  return errorHandler(error, { operation: 'create', contentType: 'articles' })
}
```

### Wrap Async Functions

```typescript
import { withErrorHandling } from './middleware/error-handler'

const safeCreateEntry = withErrorHandling(
  async (contentType: string, data: any, context: RequestContext) => {
    return await contentEngine.create(contentType, data, context)
  },
  { operation: 'create' }
)

// Returns either the result or an error response
const result = await safeCreateEntry('articles', data, context)
```

### Integration with Route Handlers

```typescript
import { handleError, type ErrorContext } from './middleware/error-handler'

class ContentRouteHandler {
  private handleError(error: unknown, context: ErrorContext = {}) {
    const errorResponse = handleError(error, context)
    return { error: errorResponse.error }
  }

  async create(request: ContentRequest, contentEngine: any) {
    try {
      const entry = await contentEngine.create(
        request.params.contentType,
        request.body.data,
        request.context
      )
      return { data: entry }
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
}
```

## API Reference

### `handleError(error: unknown, context?: ErrorContext, options?: ErrorHandlerOptions): ErrorResponse`

Main error handling function.

**Parameters:**
- `error` - Error object or unknown value
- `context` - Error context for logging (optional)
- `options` - Error handler options (optional)

**Returns:**
- `ErrorResponse` with error details

**Example:**
```typescript
const response = handleError(error, {
  method: 'POST',
  path: '/api/articles',
  userId: 'user-123'
})
```

### `transformError(error: Error, options?: ErrorHandlerOptions): APIError`

Transforms error to API error format.

**Parameters:**
- `error` - Error object
- `options` - Error handler options (optional)

**Returns:**
- `APIError` with status, name, message, and optional details

**Example:**
```typescript
const apiError = transformError(error, { includeStackTrace: true })
```

### `getStatusCode(error: Error): number`

Determines HTTP status code from error.

**Parameters:**
- `error` - Error object

**Returns:**
- HTTP status code (400, 401, 403, 404, 409, or 500)

**Example:**
```typescript
const status = getStatusCode(error) // 400, 404, 500, etc.
```

### `sanitizeMessage(message: string): string`

Sanitizes error message to remove sensitive information.

**Parameters:**
- `message` - Original error message

**Returns:**
- Sanitized error message

**Example:**
```typescript
const sanitized = sanitizeMessage('Error in /home/user/project/file.ts')
// Returns: 'Error in [path]/file.ts'
```

### `redactSensitiveFields(details: unknown): unknown`

Redacts sensitive fields from error details.

**Parameters:**
- `details` - Error details object

**Returns:**
- Redacted error details

**Example:**
```typescript
const redacted = redactSensitiveFields({
  username: 'john',
  password: 'secret123'
})
// Returns: { username: 'john', password: '[REDACTED]' }
```

### `createErrorHandler(baseContext?: ErrorContext, options?: ErrorHandlerOptions)`

Creates error handler with pre-configured context.

**Parameters:**
- `baseContext` - Base context to include in all error logs (optional)
- `options` - Error handler options (optional)

**Returns:**
- Error handler function

**Example:**
```typescript
const errorHandler = createErrorHandler(
  { service: 'api' },
  { includeStackTrace: false }
)
```

### `withErrorHandling<T, Args>(fn: (...args: Args) => Promise<T>, context?: ErrorContext, options?: ErrorHandlerOptions)`

Wraps async function with automatic error handling.

**Parameters:**
- `fn` - Async function to wrap
- `context` - Error context (optional)
- `options` - Error handler options (optional)

**Returns:**
- Wrapped function that returns result or error response

**Example:**
```typescript
const safeFunction = withErrorHandling(
  async (id: string) => await fetchData(id),
  { operation: 'fetch' }
)
```

## Types

### `APIError`

```typescript
interface APIError {
  status: number
  name: string
  message: string
  details?: unknown
}
```

### `ErrorResponse`

```typescript
interface ErrorResponse {
  error: APIError
}
```

### `ErrorContext`

```typescript
interface ErrorContext {
  method?: string
  path?: string
  contentType?: string
  entryId?: string
  userId?: string
  role?: string
  [key: string]: unknown
}
```

### `ErrorHandlerOptions`

```typescript
interface ErrorHandlerOptions {
  includeStackTrace?: boolean
  logger?: (error: Error, context: ErrorContext) => void
}
```

## Error Response Format

### Validation Error (400)

```json
{
  "error": {
    "status": 400,
    "name": "ValidationError",
    "message": "Validation failed",
    "details": {
      "errors": [
        {
          "path": ["title"],
          "message": "Title is required",
          "type": "required"
        }
      ]
    }
  }
}
```

### Unauthorized Error (401)

```json
{
  "error": {
    "status": 401,
    "name": "UnauthorizedError",
    "message": "Invalid or expired token"
  }
}
```

### Forbidden Error (403)

```json
{
  "error": {
    "status": 403,
    "name": "ForbiddenError",
    "message": "Permission denied: User does not have permission to delete articles"
  }
}
```

### Not Found Error (404)

```json
{
  "error": {
    "status": 404,
    "name": "NotFoundError",
    "message": "Entry not found: articles/999"
  }
}
```

### Conflict Error (409)

```json
{
  "error": {
    "status": 409,
    "name": "ConflictError",
    "message": "Slug conflict: 'my-article' already exists",
    "details": {
      "field": "slug",
      "value": "[REDACTED]"
    }
  }
}
```

### Internal Server Error (500)

```json
{
  "error": {
    "status": 500,
    "name": "FileSystemError",
    "message": "An unexpected error occurred. Please try again later."
  }
}
```

## Security Features

### Message Sanitization

The middleware automatically sanitizes error messages to remove:
- Absolute file paths (replaced with `[path]`)
- Stack trace lines
- Internal error codes
- Excessive whitespace

### Sensitive Field Redaction

The following field patterns are automatically redacted:
- `password`, `Password`, `PASSWORD`
- `secret`, `Secret`, `SECRET`
- `token`, `Token`, `TOKEN`
- `api_key`, `apiKey`, `API_KEY`
- `auth`, `Auth`, `AUTH`
- `credential`, `Credential`, `CREDENTIAL`

### Generic 500 Messages

All 500-level errors use a generic message to avoid leaking internal implementation details:
```
"An unexpected error occurred. Please try again later."
```

The full error details are logged server-side for debugging.

## Logging

### Default Logger

The middleware includes a default logger that outputs structured JSON logs to console:

```json
{
  "timestamp": "2024-01-15T10:00:00.000Z",
  "level": "error",
  "name": "ValidationError",
  "message": "Validation failed",
  "stack": "ValidationError: Validation failed\n    at ...",
  "context": {
    "method": "POST",
    "path": "/api/articles",
    "userId": "user-123",
    "role": "editor"
  }
}
```

### Custom Logger

Provide a custom logger for integration with your logging service:

```typescript
import { handleError } from './middleware/error-handler'
import pino from 'pino'

const logger = pino()

const customLogger = (error: Error, context: ErrorContext) => {
  logger.error({
    err: error,
    context,
    msg: error.message
  })
}

const response = handleError(error, context, { logger: customLogger })
```

## Best Practices

1. **Always provide context** - Include method, path, contentType, userId, and role for better debugging
2. **Use appropriate error types** - Name your errors correctly (ValidationError, NotFoundError, etc.) for proper status code mapping
3. **Don't include sensitive data in error messages** - The middleware sanitizes errors, but avoid including sensitive data in the first place
4. **Use custom logger in production** - Integrate with your logging service (pino, winston, etc.) for better monitoring
5. **Enable stack traces in development only** - Set `includeStackTrace: true` in development for easier debugging
6. **Catch errors at route handler level** - Use the middleware in route handlers to ensure consistent error responses

## Testing

The middleware includes comprehensive tests covering:

- Status code mapping for all error types
- Message sanitization (file paths, stack traces, etc.)
- Sensitive field redaction (passwords, tokens, secrets)
- Error detail extraction and transformation
- Logging with context
- Integration scenarios with route handlers

Run tests:

```bash
npm test -- error-handler.test.ts
```

## Requirements

Validates requirements:
- **12.1**: Return 400 Bad Request for validation errors
- **12.2**: Return 401 Unauthorized for authentication errors
- **12.3**: Return 403 Forbidden for authorization errors
- **12.4**: Return 404 Not Found for missing resources
- **12.5**: Return 409 Conflict for unique constraint violations
- **12.6**: Retry file system errors with exponential backoff
- **12.7**: Retry Git operations once before returning error
- **NFR-9**: Avoid leaking sensitive information in error messages
- **NFR-12**: Log all errors with context for debugging
