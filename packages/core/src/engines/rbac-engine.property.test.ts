import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import * as fc from 'fast-check'
import { RBACEngine } from './rbac-engine.js'
import type { Role, Permission, Action, Resource, RequestContext, User } from '../types/index.js'

/**
 * Property-based tests for RBAC Enforcement
 * 
 * These tests validate Property P6: RBAC Enforcement
 * For any user, action, and resource, if the user lacks permission for that action
 * on that resource, the system rejects the operation with a ForbiddenError.
 */
describe('RBACEngine - RBAC Enforcement Property Tests', () => {
  let rbacEngine: RBACEngine
  let testDir: string
  let configPath: string

  beforeEach(async () => {
    // Create a unique test directory for each test
    testDir = join(
      process.cwd(),
      'test-data',
      `rbac-${Date.now()}-${Math.random().toString(36).substring(2)}`
    )
    configPath = join(testDir, '.cms')
    await fs.mkdir(configPath, { recursive: true })
    
    rbacEngine = new RBACEngine(testDir)
  })

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  /**
   * Helper to create RBAC config file
   */
  async function createRBACConfig(roles: Record<string, Role>, defaultRole: string): Promise<void> {
    const config = { roles, defaultRole }
    await fs.writeFile(
      join(configPath, 'rbac.json'),
      JSON.stringify(config, null, 2),
      'utf8'
    )
  }

  /**
   * Property P6: RBAC Enforcement
   * 
   * **Validates: Requirements 6.3, 6.6, 6.7, 6.8, NFR-7**
   * 
   * For any user, action, and resource, if the user lacks permission for that action
   * on that resource, the system rejects the operation with a ForbiddenError.
   */
  describe('P6: RBAC Enforcement', () => {
    /**
     * Test that users without permission are denied access
     */
    it('should deny access when user lacks permission for action on resource', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random actions and content types
          fc.constantFrom<Action>('create', 'read', 'update', 'delete', 'publish', 'unpublish'),
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          fc.uuid(),
          async (action, contentType, userId) => {
            // Create a role with NO permissions
            const restrictedRole: Role = {
              id: 'restricted',
              name: 'Restricted',
              description: 'No permissions',
              type: 'custom',
              permissions: []
            }

            await createRBACConfig({ restricted: restrictedRole }, 'restricted')
            await rbacEngine.loadRBACConfig()

            const context: RequestContext = {
              user: { id: userId, username: 'testuser', email: 'test@example.com', role: 'restricted' },
              role: 'restricted'
            }

            const resource: Resource = {
              type: contentType,
              id: fc.sample(fc.uuid(), 1)[0],
              data: { title: 'Test' }
            }

            // Property: User without permission should be denied
            const canAccess = await rbacEngine.can(context, action, resource)
            expect(canAccess).toBe(false)
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test that users with permission are granted access
     */
    it('should grant access when user has permission for action on resource', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom<Action>('create', 'read', 'update', 'delete', 'publish', 'unpublish'),
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          fc.uuid(),
          async (action, contentType, userId) => {
            // Create a role with specific permission
            const permission: Permission = {
              action,
              subject: contentType
            }

            const permittedRole: Role = {
              id: 'permitted',
              name: 'Permitted',
              description: 'Has specific permission',
              type: 'custom',
              permissions: [permission]
            }

            await createRBACConfig({ permitted: permittedRole }, 'permitted')
            await rbacEngine.loadRBACConfig()

            const context: RequestContext = {
              user: { id: userId, username: 'testuser', email: 'test@example.com', role: 'permitted' },
              role: 'permitted'
            }

            const resource: Resource = {
              type: contentType,
              id: fc.sample(fc.uuid(), 1)[0],
              data: { title: 'Test' }
            }

            // Property: User with permission should be granted access
            const canAccess = await rbacEngine.can(context, action, resource)
            expect(canAccess).toBe(true)
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test that admin role has access to all actions on all resources
     */
    it('should grant admin access to all actions on all resources', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom<Action>('create', 'read', 'update', 'delete', 'publish', 'unpublish'),
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          fc.uuid(),
          async (action, contentType, userId) => {
            // Create admin role with wildcard permissions
            const adminRole: Role = {
              id: 'admin',
              name: 'Administrator',
              description: 'Full access',
              type: 'admin',
              permissions: [
                {
                  action: '*',
                  subject: 'all'
                }
              ]
            }

            await createRBACConfig({ admin: adminRole }, 'admin')
            await rbacEngine.loadRBACConfig()

            const context: RequestContext = {
              user: { id: userId, username: 'admin', email: 'admin@example.com', role: 'admin' },
              role: 'admin'
            }

            const resource: Resource = {
              type: contentType,
              id: fc.sample(fc.uuid(), 1)[0],
              data: { title: 'Test' }
            }

            // Property: Admin should have access to any action on any resource
            const canAccess = await rbacEngine.can(context, action, resource)
            expect(canAccess).toBe(true)
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test conditional permissions (e.g., owner-only access)
     */
    it('should enforce conditional permissions correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          async (ownerId, otherUserId, contentType) => {
            // Create role with conditional permission (owner-only)
            const conditionalRole: Role = {
              id: 'authenticated',
              name: 'Authenticated',
              description: 'Can update own content',
              type: 'authenticated',
              permissions: [
                {
                  action: 'read',
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
            }

            await createRBACConfig({ authenticated: conditionalRole }, 'authenticated')
            await rbacEngine.loadRBACConfig()

            // Test owner can update their own content
            const ownerContext: RequestContext = {
              user: { id: ownerId, username: 'owner', email: 'owner@example.com', role: 'authenticated' },
              role: 'authenticated'
            }

            const ownedResource: Resource = {
              type: contentType,
              id: fc.sample(fc.uuid(), 1)[0],
              data: { title: 'Test', createdBy: ownerId }
            }

            const ownerCanUpdate = await rbacEngine.can(ownerContext, 'update', ownedResource)
            expect(ownerCanUpdate).toBe(true)

            // Test non-owner cannot update someone else's content
            const otherContext: RequestContext = {
              user: { id: otherUserId, username: 'other', email: 'other@example.com', role: 'authenticated' },
              role: 'authenticated'
            }

            const otherCanUpdate = await rbacEngine.can(otherContext, 'update', ownedResource)
            expect(otherCanUpdate).toBe(false)

            // Test both can read (no conditions on read)
            const ownerCanRead = await rbacEngine.can(ownerContext, 'read', ownedResource)
            const otherCanRead = await rbacEngine.can(otherContext, 'read', ownedResource)
            expect(ownerCanRead).toBe(true)
            expect(otherCanRead).toBe(true)
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test field-level permissions
     */
    it('should enforce field-level permissions correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          fc.array(
            fc.string({ minLength: 1, maxLength: 20 })
              .filter(s => /^[a-z][a-zA-Z0-9]*$/.test(s)),
            { minLength: 2, maxLength: 5 }
          ),
          async (userId, contentType, fields) => {
            // Ensure unique field names
            const uniqueFields = Array.from(new Set(fields))
            if (uniqueFields.length < 2) return // Skip if not enough unique fields

            const allowedFields = uniqueFields.slice(0, Math.ceil(uniqueFields.length / 2))
            const restrictedFields = uniqueFields.slice(Math.ceil(uniqueFields.length / 2))

            // Create role with field-level permissions
            const fieldRestrictedRole: Role = {
              id: 'field-restricted',
              name: 'Field Restricted',
              description: 'Limited field access',
              type: 'custom',
              permissions: [
                {
                  action: 'read',
                  subject: contentType,
                  fields: allowedFields
                }
              ]
            }

            await createRBACConfig({ 'field-restricted': fieldRestrictedRole }, 'field-restricted')
            await rbacEngine.loadRBACConfig()

            const context: RequestContext = {
              user: { id: userId, username: 'testuser', email: 'test@example.com', role: 'field-restricted' },
              role: 'field-restricted'
            }

            // Property: Allowed fields should be accessible
            for (const field of allowedFields) {
              const canAccess = rbacEngine.canAccessField(context, contentType, field)
              expect(canAccess).toBe(true)
            }

            // Property: Restricted fields should not be accessible
            for (const field of restrictedFields) {
              const canAccess = rbacEngine.canAccessField(context, contentType, field)
              expect(canAccess).toBe(false)
            }
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test that wildcard subject 'all' grants access to any content type
     */
    it('should grant access to all content types when subject is "all"', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom<Action>('create', 'read', 'update', 'delete'),
          fc.array(
            fc.string({ minLength: 1, maxLength: 20 })
              .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
            { minLength: 3, maxLength: 10 }
          ),
          fc.uuid(),
          async (action, contentTypes, userId) => {
            // Ensure unique content types
            const uniqueTypes = Array.from(new Set(contentTypes))

            // Create role with wildcard subject
            const wildcardRole: Role = {
              id: 'wildcard',
              name: 'Wildcard',
              description: 'Access to all content types',
              type: 'custom',
              permissions: [
                {
                  action,
                  subject: 'all'
                }
              ]
            }

            await createRBACConfig({ wildcard: wildcardRole }, 'wildcard')
            await rbacEngine.loadRBACConfig()

            const context: RequestContext = {
              user: { id: userId, username: 'testuser', email: 'test@example.com', role: 'wildcard' },
              role: 'wildcard'
            }

            // Property: Should have access to all content types
            for (const contentType of uniqueTypes) {
              const resource: Resource = {
                type: contentType,
                id: fc.sample(fc.uuid(), 1)[0],
                data: { title: 'Test' }
              }

              const canAccess = await rbacEngine.can(context, action, resource)
              expect(canAccess).toBe(true)
            }
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test that wildcard action '*' grants access to all actions
     */
    it('should grant access to all actions when action is "*"', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          fc.uuid(),
          async (contentType, userId) => {
            // Create role with wildcard action
            const wildcardActionRole: Role = {
              id: 'wildcard-action',
              name: 'Wildcard Action',
              description: 'All actions on specific content type',
              type: 'custom',
              permissions: [
                {
                  action: '*',
                  subject: contentType
                }
              ]
            }

            await createRBACConfig({ 'wildcard-action': wildcardActionRole }, 'wildcard-action')
            await rbacEngine.loadRBACConfig()

            const context: RequestContext = {
              user: { id: userId, username: 'testuser', email: 'test@example.com', role: 'wildcard-action' },
              role: 'wildcard-action'
            }

            const resource: Resource = {
              type: contentType,
              id: fc.sample(fc.uuid(), 1)[0],
              data: { title: 'Test' }
            }

            // Property: Should have access to all actions
            const actions: Action[] = ['create', 'read', 'update', 'delete', 'publish', 'unpublish']
            for (const action of actions) {
              const canAccess = await rbacEngine.can(context, action, resource)
              expect(canAccess).toBe(true)
            }
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test that non-existent role denies all access
     */
    it('should deny access when role does not exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom<Action>('create', 'read', 'update', 'delete'),
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          fc.uuid(),
          async (action, contentType, userId) => {
            // Create config with only one role
            const existingRole: Role = {
              id: 'existing',
              name: 'Existing',
              description: 'Existing role',
              type: 'custom',
              permissions: [{ action: '*', subject: 'all' }]
            }

            await createRBACConfig({ existing: existingRole }, 'existing')
            await rbacEngine.loadRBACConfig()

            // Try to use non-existent role
            const context: RequestContext = {
              user: { id: userId, username: 'testuser', email: 'test@example.com', role: 'non-existent' },
              role: 'non-existent'
            }

            const resource: Resource = {
              type: contentType,
              id: fc.sample(fc.uuid(), 1)[0],
              data: { title: 'Test' }
            }

            // Property: Non-existent role should deny access
            const canAccess = await rbacEngine.can(context, action, resource)
            expect(canAccess).toBe(false)
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test multiple permissions with different subjects
     */
    it('should correctly evaluate multiple permissions for different subjects', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(
            fc.string({ minLength: 1, maxLength: 20 })
              .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
            { minLength: 3, maxLength: 6 }
          ),
          async (userId, contentTypes) => {
            // Ensure unique content types
            const uniqueTypes = Array.from(new Set(contentTypes))
            if (uniqueTypes.length < 3) return // Skip if not enough unique types

            const allowedTypes = uniqueTypes.slice(0, Math.ceil(uniqueTypes.length / 2))
            const deniedTypes = uniqueTypes.slice(Math.ceil(uniqueTypes.length / 2))

            // Create role with permissions for specific content types only
            const permissions: Permission[] = allowedTypes.map(type => ({
              action: 'read',
              subject: type
            }))

            const selectiveRole: Role = {
              id: 'selective',
              name: 'Selective',
              description: 'Access to specific content types',
              type: 'custom',
              permissions
            }

            await createRBACConfig({ selective: selectiveRole }, 'selective')
            await rbacEngine.loadRBACConfig()

            const context: RequestContext = {
              user: { id: userId, username: 'testuser', email: 'test@example.com', role: 'selective' },
              role: 'selective'
            }

            // Property: Should have access to allowed types
            for (const contentType of allowedTypes) {
              const resource: Resource = {
                type: contentType,
                id: fc.sample(fc.uuid(), 1)[0],
                data: { title: 'Test' }
              }

              const canAccess = await rbacEngine.can(context, 'read', resource)
              expect(canAccess).toBe(true)
            }

            // Property: Should not have access to denied types
            for (const contentType of deniedTypes) {
              const resource: Resource = {
                type: contentType,
                id: fc.sample(fc.uuid(), 1)[0],
                data: { title: 'Test' }
              }

              const canAccess = await rbacEngine.can(context, 'read', resource)
              expect(canAccess).toBe(false)
            }
          }
        ),
        { numRuns: 5 }
      )
    })
  })
})
