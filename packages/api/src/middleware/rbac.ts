/**
 * RBAC Middleware
 * 
 * Provides role-based access control for API requests.
 * Checks permissions before allowing operations.
 * 
 * @module middleware/rbac
 */

import type { RequestContext, Action, Resource } from '@cms/core'

/**
 * RBAC request interface
 */
export interface RBACRequest {
  params: {
    contentType?: string
    id?: string
  }
  context: RequestContext
}

/**
 * RBAC result
 */
export interface RBACResult {
  success: boolean
  error?: {
    status: number
    name: string
    message: string
  }
}

/**
 * Extract action from HTTP method and endpoint
 * 
 * Maps HTTP methods and paths to RBAC actions:
 * - GET -> 'read'
 * - POST (without /publish or /unpublish) -> 'create'
 * - PUT -> 'update'
 * - DELETE -> 'delete'
 * - POST /:id/publish -> 'publish'
 * - POST /:id/unpublish -> 'unpublish'
 * 
 * @param method - HTTP method (GET, POST, PUT, DELETE)
 * @param path - Request path
 * @returns RBAC action
 */
export function extractAction(method: string, path: string): Action {
  const normalizedMethod = method.toUpperCase()
  
  // Check for publish/unpublish endpoints
  if (normalizedMethod === 'POST') {
    if (path.endsWith('/publish')) {
      return 'publish'
    }
    if (path.endsWith('/unpublish')) {
      return 'unpublish'
    }
    // Regular POST is create
    return 'create'
  }
  
  // Map other HTTP methods to actions
  switch (normalizedMethod) {
    case 'GET':
      return 'read'
    case 'PUT':
    case 'PATCH':
      return 'update'
    case 'DELETE':
      return 'delete'
    default:
      return 'read' // Default to read for unknown methods
  }
}

/**
 * Extract resource from request parameters
 * 
 * Creates a Resource object from the content type and optional ID.
 * 
 * @param request - Request object with params
 * @returns Resource object
 */
export function extractResource(request: RBACRequest): Resource {
  const { contentType, id } = request.params
  
  return {
    type: contentType || 'unknown',
    id
  }
}

/**
 * RBAC middleware
 * 
 * Checks permissions before each operation using RBACEngine.
 * Returns 403 Forbidden if user lacks permission.
 * Allows request to proceed if permission is granted.
 * 
 * @param request - Request object with context and params
 * @param method - HTTP method (GET, POST, PUT, DELETE)
 * @param path - Request path
 * @param rbacEngine - RBACEngine instance
 * @returns RBAC result with success or error
 */
export async function checkPermissions(
  request: RBACRequest,
  method: string,
  path: string,
  rbacEngine: any
): Promise<RBACResult> {
  // Step 1: Extract action from HTTP method and path
  const action = extractAction(method, path)
  
  // Step 2: Extract resource from request parameters
  const resource = extractResource(request)
  
  // Step 3: Check permissions using RBAC engine
  try {
    const hasPermission = await rbacEngine.can(
      request.context,
      action,
      resource
    )
    
    // Step 4: Return 403 if permission denied
    if (!hasPermission) {
      return {
        success: false,
        error: {
          status: 403,
          name: 'ForbiddenError',
          message: `Insufficient permissions to ${action} ${resource.type}`
        }
      }
    }
    
    // Step 5: Allow request to proceed if permission granted
    return {
      success: true
    }
  } catch (error) {
    // Handle RBAC engine errors
    return {
      success: false,
      error: {
        status: 500,
        name: 'InternalServerError',
        message: 'Error checking permissions'
      }
    }
  }
}
