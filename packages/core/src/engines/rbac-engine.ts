/**
 * RBAC Engine - Role-Based Access Control
 * 
 * Manages role-based access control with support for:
 * - Permission evaluation for actions on resources
 * - Conditional permissions (e.g., owner-only access)
 * - Field-level permissions
 * - Wildcard permissions (action: *, subject: all)
 * - Custom roles and permissions
 * 
 * Validates: Requirements 6.1, 6.3, 6.6
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import type {
  Role,
  Action,
  Resource,
  RequestContext,
  PermissionCondition,
} from '../types/index.js'

/**
 * RBAC Configuration structure
 */
export interface RBACConfig {
  roles: Record<string, Role>
  defaultRole: string
  userRoles?: Record<string, string[]> // userId -> roleIds mapping
}

/**
 * RBAC Engine for permission evaluation and role management
 */
export class RBACEngine {
  private config: RBACConfig | null = null
  private configPath: string

  constructor(private readonly basePath: string) {
    this.configPath = join(basePath, '.cms', 'rbac.json')
  }

  /**
   * Load RBAC configuration from .cms/rbac.json
   * 
   * @throws Error if config file doesn't exist or is invalid
   */
  async loadRBACConfig(): Promise<void> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8')
      this.config = JSON.parse(content) as RBACConfig

      // Validate config structure
      if (!this.config.roles || typeof this.config.roles !== 'object') {
        throw new Error('Invalid RBAC config: roles must be an object')
      }

      if (!this.config.defaultRole || typeof this.config.defaultRole !== 'string') {
        throw new Error('Invalid RBAC config: defaultRole must be a string')
      }

      // Ensure default role exists
      if (!this.config.roles[this.config.defaultRole]) {
        throw new Error(`Default role "${this.config.defaultRole}" not found in roles`)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`RBAC config not found at ${this.configPath}`)
      }
      throw error
    }
  }

  /**
   * Create default RBAC configuration file
   *
   * Creates four default roles:
   * - Admin: Full system access
   * - Editor: Can create, read, update, publish, unpublish content (but not delete or manage schemas)
   * - Authenticated: Limited permissions, can only update content they created
   * - Public: Read-only access
   *
   * Writes configuration to .cms/rbac.json
   *
   * @throws Error if file creation fails
   *
   * Validates: Requirements 6.1, 6.2
   */
  async createDefaultConfig(): Promise<void> {
    const defaultConfig: RBACConfig = {
      roles: {
        admin: {
          id: 'admin',
          name: 'Administrator',
          description: 'Full access to all features',
          type: 'admin',
          permissions: [
            {
              action: '*',
              subject: 'all'
            }
          ]
        },
        editor: {
          id: 'editor',
          name: 'Editor',
          description: 'Can manage content',
          type: 'editor',
          permissions: [
            {
              action: 'create',
              subject: 'all'
            },
            {
              action: 'read',
              subject: 'all'
            },
            {
              action: 'update',
              subject: 'all'
            },
            {
              action: 'publish',
              subject: 'all'
            },
            {
              action: 'unpublish',
              subject: 'all'
            }
          ]
        },
        authenticated: {
          id: 'authenticated',
          name: 'Authenticated',
          description: 'Default role for authenticated users',
          type: 'authenticated',
          permissions: [
            {
              action: 'read',
              subject: 'all'
            },
            {
              action: 'create',
              subject: 'all'
            },
            {
              action: 'update',
              subject: 'all',
              conditions: {
                createdBy: '${user.id}'
              }
            }
          ]
        },
        public: {
          id: 'public',
          name: 'Public',
          description: 'Default role for unauthenticated users',
          type: 'public',
          permissions: [
            {
              action: 'read',
              subject: 'all'
            }
          ]
        }
      },
      defaultRole: 'authenticated'
    }

    // Ensure .cms directory exists
    const cmsDir = join(this.basePath, '.cms')
    await fs.mkdir(cmsDir, { recursive: true })

    // Write config file
    await fs.writeFile(
      this.configPath,
      JSON.stringify(defaultConfig, null, 2),
      'utf-8'
    )

    // Load the config into memory
    this.config = defaultConfig
  }


  /**
   * Check if a user has permission to perform an action on a resource
   * 
   * Supports:
   * - Wildcard actions (action: *)
   * - Wildcard subjects (subject: all)
   * - Conditional permissions (e.g., createdBy: ${user.id})
   * - Field-level permissions
   * 
   * @param context Request context with user and role information
   * @param action Action to perform (create, read, update, delete, publish, unpublish)
   * @param resource Resource being accessed
   * @returns true if permission granted, false otherwise
   * 
   * Validates: Requirements 6.3, 6.6
   */
  async can(
    context: RequestContext,
    action: Action,
    resource: Resource
  ): Promise<boolean> {
    if (!this.config) {
      throw new Error('RBAC config not loaded. Call loadRBACConfig() first.')
    }

    // Get user's role
    const role = this.config.roles[context.role]
    if (!role) {
      // If role not found, deny access
      return false
    }

    // Find matching permissions
    const matchingPermissions = role.permissions.filter((p) => {
      // Check if action matches (exact match or wildcard)
      const actionMatches = p.action === action || p.action === '*'

      // Check if subject matches (exact match or wildcard 'all')
      const subjectMatches = p.subject === resource.type || p.subject === 'all'

      return actionMatches && subjectMatches
    })

    // If no matching permissions, deny access
    if (matchingPermissions.length === 0) {
      return false
    }

    // Evaluate conditions for each matching permission
    for (const permission of matchingPermissions) {
      // If no conditions, permission is granted
      if (!permission.conditions) {
        return true
      }

      // Evaluate conditions
      if (this.evaluateConditions(permission.conditions, resource, context)) {
        return true
      }
    }

    // No permission matched with satisfied conditions
    return false
  }

  /**
   * Evaluate conditional permissions
   * 
   * Supports template variables like ${user.id} in condition values
   * 
   * @param conditions Permission conditions to evaluate
   * @param resource Resource being accessed
   * @param context Request context
   * @returns true if all conditions are satisfied
   * 
   * Validates: Requirement 6.6
   */
  evaluateConditions(
    conditions: PermissionCondition,
    resource: Resource,
    context: RequestContext
  ): boolean {
    // If resource has no data, conditions cannot be evaluated
    if (!resource.data || typeof resource.data !== 'object') {
      return false
    }

    const resourceData = resource.data as Record<string, unknown>

    // Check each condition
    for (const [field, expectedValue] of Object.entries(conditions)) {
      const actualValue = resourceData[field]

      // Handle template variables (e.g., ${user.id})
      let resolvedExpectedValue = expectedValue
      if (typeof expectedValue === 'string' && expectedValue.startsWith('${')) {
        resolvedExpectedValue = this.resolveTemplate(expectedValue, context)
      }

      // Compare values
      if (actualValue !== resolvedExpectedValue) {
        return false
      }
    }

    return true
  }

  /**
   * Resolve template variables in condition values
   * 
   * Supports:
   * - ${user.id} - Current user's ID
   * - ${user.role} - Current user's role
   * 
   * @param template Template string with variables
   * @param context Request context
   * @returns Resolved value
   */
  private resolveTemplate(template: string, context: RequestContext): unknown {
    // Extract variable name from ${...}
    const match = template.match(/^\$\{(.+)\}$/)
    if (!match) {
      return template
    }

    const variable = match[1]

    // Handle user.* variables
    if (variable.startsWith('user.')) {
      const userField = variable.substring(5) // Remove 'user.' prefix

      if (!context.user) {
        return undefined
      }

      return (context.user as unknown as Record<string, unknown>)[userField]
    }

    // Unknown variable
    return undefined
  }

  /**
   * Check if a user can access a specific field
   * 
   * @param context Request context
   * @param contentType Content type being accessed
   * @param field Field name
   * @returns true if field access is allowed
   */
  canAccessField(
    context: RequestContext,
    contentType: string,
    field: string
  ): boolean {
    if (!this.config) {
      throw new Error('RBAC config not loaded. Call loadRBACConfig() first.')
    }

    const role = this.config.roles[context.role]
    if (!role) {
      return false
    }

    // Find permissions for this content type
    const permissions = role.permissions.filter(
      (p) => p.subject === contentType || p.subject === 'all'
    )

    // If no permissions found, deny access
    if (permissions.length === 0) {
      return false
    }

    // Check field-level permissions
    for (const permission of permissions) {
      // If no field restrictions, all fields are accessible
      if (!permission.fields || permission.fields.length === 0) {
        return true
      }

      // Check if field is in allowed list
      if (permission.fields.includes(field)) {
        return true
      }
    }

    return false
  }
  /**
   * Filter fields from an entry based on role permissions
   *
   * Returns a new entry with only the fields the user has permission to access.
   * Always includes the 'id' field.
   *
   * @param context Request context
   * @param contentType Content type being accessed
   * @param entry Entry to filter
   * @returns Filtered entry with only accessible fields
   *
   * Validates: Requirement 6.9
   */
  filterFields<T extends Record<string, unknown>>(
    context: RequestContext,
    contentType: string,
    entry: T
  ): Partial<T> {
    if (!this.config) {
      throw new Error('RBAC config not loaded. Call loadRBACConfig() first.')
    }

    const role = this.config.roles[context.role]
    if (!role) {
      // If role not found, return only id and documentId
      return { id: entry.id, documentId: entry.documentId } as unknown as Partial<T>
    }

    // Find permissions for this content type
    const permissions = role.permissions.filter(
      (p) => p.subject === contentType || p.subject === 'all'
    )

    // If no permissions found, return only id and documentId
    if (permissions.length === 0) {
      return { id: entry.id, documentId: entry.documentId } as unknown as Partial<T>
    }

    // Check if any permission has no field restrictions (full access)
    const hasFullAccess = permissions.some(
      (p) => !p.fields || p.fields.length === 0
    )

    if (hasFullAccess) {
      // User has access to all fields
      return entry
    }

    // Collect all allowed fields from all permissions
    const allowedFields = new Set<string>(['id', 'documentId']) // Always include id and documentId
    for (const permission of permissions) {
      if (permission.fields) {
        permission.fields.forEach((field) => allowedFields.add(field))
      }
    }

    // Filter entry to only include allowed fields
    const filtered: Partial<T> = {}
    for (const field of allowedFields) {
      if (field in entry) {
        filtered[field as keyof T] = entry[field] as T[keyof T]
      }
    }

    return filtered
  }

  /**
   * Filter fields from multiple entries based on role permissions
   *
   * @param context Request context
   * @param contentType Content type being accessed
   * @param entries Array of entries to filter
   * @returns Array of filtered entries
   *
   * Validates: Requirement 6.9
   */
  filterFieldsMany<T extends Record<string, unknown>>(
    context: RequestContext,
    contentType: string,
    entries: T[]
  ): Partial<T>[] {
    return entries.map((entry) => this.filterFields(context, contentType, entry))
  }

  /**
   * Get role by ID
   * 
   * @param roleId Role identifier
   * @returns Role object or null if not found
   */
  getRole(roleId: string): Role | null {
    if (!this.config) {
      throw new Error('RBAC config not loaded. Call loadRBACConfig() first.')
    }

    return this.config.roles[roleId] || null
  }

  /**
   * Get all roles
   * 
   * @returns Array of all roles
   */
  getAllRoles(): Role[] {
    if (!this.config) {
      throw new Error('RBAC config not loaded. Call loadRBACConfig() first.')
    }

    return Object.values(this.config.roles)
  }

  /**
   * Get default role
   * 
   * @returns Default role ID
   */
  getDefaultRole(): string {
    if (!this.config) {
      throw new Error('RBAC config not loaded. Call loadRBACConfig() first.')
    }

    return this.config.defaultRole
  }

  /**
   * Create a new custom role
   *
   * @param role Role data (without id, will be generated)
   * @returns Created role with generated ID
   * @throws Error if role validation fails or role already exists
   *
   * Validates: Requirements 6.2, 6.4
   */
  async createRole(role: Omit<Role, 'id'>): Promise<Role> {
    if (!this.config) {
      throw new Error('RBAC config not loaded. Call loadRBACConfig() first.')
    }

    // Validate role data
    if (!role.name || typeof role.name !== 'string') {
      throw new Error('Role name is required and must be a string')
    }

    if (!role.description || typeof role.description !== 'string') {
      throw new Error('Role description is required and must be a string')
    }

    if (!role.type || !['admin', 'editor', 'authenticated', 'public', 'custom'].includes(role.type)) {
      throw new Error('Role type must be one of: admin, editor, authenticated, public, custom')
    }

    if (!Array.isArray(role.permissions)) {
      throw new Error('Role permissions must be an array')
    }

    // Validate permissions
    for (const permission of role.permissions) {
      if (!permission.action || typeof permission.action !== 'string') {
        throw new Error('Permission action is required and must be a string')
      }

      if (!permission.subject || typeof permission.subject !== 'string') {
        throw new Error('Permission subject is required and must be a string')
      }

      // Validate action is a valid Action type
      const validActions: Action[] = ['create', 'read', 'update', 'delete', 'publish', 'unpublish', '*']
      if (!validActions.includes(permission.action as Action)) {
        throw new Error(`Invalid permission action: ${permission.action}`)
      }
    }

    // Generate role ID from name (kebab-case)
    const roleId = role.name.toLowerCase().replace(/\s+/g, '-')

    // Check if role already exists
    if (this.config.roles[roleId]) {
      throw new Error(`Role with ID "${roleId}" already exists`)
    }

    // Create role with ID
    const newRole: Role = {
      id: roleId,
      ...role,
    }

    // Add role to config
    this.config.roles[roleId] = newRole

    // Persist config to disk
    await this.saveConfig()

    // Reload config to ensure consistency
    await this.loadRBACConfig()

    return newRole
  }

  /**
   * Update an existing role
   *
   * @param roleId Role identifier
   * @param updates Partial role updates
   * @returns Updated role
   * @throws Error if role not found or validation fails
   *
   * Validates: Requirements 6.2, 6.4
   */
  async updateRole(roleId: string, updates: Partial<Omit<Role, 'id'>>): Promise<Role> {
    if (!this.config) {
      throw new Error('RBAC config not loaded. Call loadRBACConfig() first.')
    }

    // Check if role exists
    const existingRole = this.config.roles[roleId]
    if (!existingRole) {
      throw new Error(`Role with ID "${roleId}" not found`)
    }

    // Validate updates
    if (updates.name !== undefined) {
      if (typeof updates.name !== 'string' || !updates.name) {
        throw new Error('Role name must be a non-empty string')
      }
    }

    if (updates.description !== undefined) {
      if (typeof updates.description !== 'string' || !updates.description) {
        throw new Error('Role description must be a non-empty string')
      }
    }

    if (updates.type !== undefined) {
      if (!['admin', 'editor', 'authenticated', 'public', 'custom'].includes(updates.type)) {
        throw new Error('Role type must be one of: admin, editor, authenticated, public, custom')
      }
    }

    if (updates.permissions !== undefined) {
      if (!Array.isArray(updates.permissions)) {
        throw new Error('Role permissions must be an array')
      }

      // Validate permissions
      for (const permission of updates.permissions) {
        if (!permission.action || typeof permission.action !== 'string') {
          throw new Error('Permission action is required and must be a string')
        }

        if (!permission.subject || typeof permission.subject !== 'string') {
          throw new Error('Permission subject is required and must be a string')
        }

        // Validate action is a valid Action type
        const validActions: Action[] = ['create', 'read', 'update', 'delete', 'publish', 'unpublish', '*']
        if (!validActions.includes(permission.action as Action)) {
          throw new Error(`Invalid permission action: ${permission.action}`)
        }
      }
    }

    // Update role
    const updatedRole: Role = {
      ...existingRole,
      ...updates,
      id: roleId, // Ensure ID doesn't change
    }

    this.config.roles[roleId] = updatedRole

    // Persist config to disk
    await this.saveConfig()

    // Reload config to ensure consistency
    await this.loadRBACConfig()

    return updatedRole
  }

  /**
   * Delete a role
   *
   * Safety checks:
   * - Cannot delete default roles (admin, editor, authenticated, public)
   * - Cannot delete the default role
   *
   * @param roleId Role identifier
   * @throws Error if role not found or is a default role
   *
   * Validates: Requirements 6.2, 6.4
   */
  async deleteRole(roleId: string): Promise<void> {
    if (!this.config) {
      throw new Error('RBAC config not loaded. Call loadRBACConfig() first.')
    }

    // Check if role exists
    const role = this.config.roles[roleId]
    if (!role) {
      throw new Error(`Role with ID "${roleId}" not found`)
    }

    // Safety check: Cannot delete default system roles
    const defaultRoles = ['admin', 'editor', 'authenticated', 'public']
    if (defaultRoles.includes(roleId)) {
      throw new Error(`Cannot delete default role "${roleId}"`)
    }

    // Safety check: Cannot delete the default role
    if (roleId === this.config.defaultRole) {
      throw new Error(`Cannot delete the default role "${roleId}"`)
    }

    // Delete role
    delete this.config.roles[roleId]

    // Persist config to disk
    await this.saveConfig()

    // Reload config to ensure consistency
    await this.loadRBACConfig()
  }

  /**
   * Assign a role to a user
   *
   * @param userId User identifier
   * @param roleId Role identifier
   * @throws Error if role not found
   *
   * Validates: Requirement 6.5
   */
  async assignRole(userId: string, roleId: string): Promise<void> {
    if (!this.config) {
      throw new Error('RBAC config not loaded. Call loadRBACConfig() first.')
    }

    // Validate inputs
    if (!userId || typeof userId !== 'string') {
      throw new Error('User ID is required and must be a string')
    }

    if (!roleId || typeof roleId !== 'string') {
      throw new Error('Role ID is required and must be a string')
    }

    // Check if role exists
    if (!this.config.roles[roleId]) {
      throw new Error(`Role with ID "${roleId}" not found`)
    }

    // Initialize userRoles map if it doesn't exist
    if (!this.config.userRoles) {
      this.config.userRoles = {}
    }

    // Initialize user's role array if it doesn't exist
    if (!this.config.userRoles[userId]) {
      this.config.userRoles[userId] = []
    }

    // Check if user already has this role
    if (this.config.userRoles[userId].includes(roleId)) {
      // Role already assigned, no-op
      return
    }

    // Add role to user
    this.config.userRoles[userId].push(roleId)

    // Persist config to disk
    await this.saveConfig()

    // Reload config to ensure consistency
    await this.loadRBACConfig()
  }

  /**
   * Revoke a role from a user
   *
   * @param userId User identifier
   * @param roleId Role identifier
   * @throws Error if role not found or not assigned to user
   *
   * Validates: Requirement 6.5
   */
  async revokeRole(userId: string, roleId: string): Promise<void> {
    if (!this.config) {
      throw new Error('RBAC config not loaded. Call loadRBACConfig() first.')
    }

    // Validate inputs
    if (!userId || typeof userId !== 'string') {
      throw new Error('User ID is required and must be a string')
    }

    if (!roleId || typeof roleId !== 'string') {
      throw new Error('Role ID is required and must be a string')
    }

    // Check if role exists
    if (!this.config.roles[roleId]) {
      throw new Error(`Role with ID "${roleId}" not found`)
    }

    // Check if userRoles map exists
    if (!this.config.userRoles || !this.config.userRoles[userId]) {
      throw new Error(`User "${userId}" has no roles assigned`)
    }

    // Check if user has this role
    const roleIndex = this.config.userRoles[userId].indexOf(roleId)
    if (roleIndex === -1) {
      throw new Error(`Role "${roleId}" is not assigned to user "${userId}"`)
    }

    // Remove role from user
    this.config.userRoles[userId].splice(roleIndex, 1)

    // Clean up empty arrays
    if (this.config.userRoles[userId].length === 0) {
      delete this.config.userRoles[userId]
    }

    // Persist config to disk
    await this.saveConfig()

    // Reload config to ensure consistency
    await this.loadRBACConfig()
  }

  /**
   * Get all roles assigned to a user
   *
   * @param userId User identifier
   * @returns Array of roles assigned to the user
   *
   * Validates: Requirement 6.5
   */
  async getUserRoles(userId: string): Promise<Role[]> {
    if (!this.config) {
      throw new Error('RBAC config not loaded. Call loadRBACConfig() first.')
    }

    // Validate input
    if (!userId || typeof userId !== 'string') {
      throw new Error('User ID is required and must be a string')
    }

    // Check if userRoles map exists and user has roles
    if (!this.config.userRoles || !this.config.userRoles[userId]) {
      return []
    }

    // Get role IDs for user
    const roleIds = this.config.userRoles[userId]

    // Map role IDs to Role objects
    const roles: Role[] = []
    for (const roleId of roleIds) {
      const role = this.config.roles[roleId]
      if (role) {
        roles.push(role)
      }
    }

    return roles
  }

  /**
   * Save RBAC configuration to disk
   *
   * @private
   */
  private async saveConfig(): Promise<void> {
    if (!this.config) {
      throw new Error('No config to save')
    }

    // Ensure .cms directory exists
    const cmsDir = join(this.basePath, '.cms')
    await fs.mkdir(cmsDir, { recursive: true })

    // Write config to file
    const content = JSON.stringify(this.config, null, 2)
    await fs.writeFile(this.configPath, content, 'utf-8')
  }

}
