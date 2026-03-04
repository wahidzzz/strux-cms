/**
 * Integration tests for Content Engine
 * 
 * Verifies that Content Engine properly integrates all engines:
 * - SchemaEngine.validate before writes
 * - FileEngine.writeAtomic for persistence
 * - GitEngine.commit after writes
 * - RBACEngine.can for permission checks
 * - QueryEngine index updates after writes
 * 
 * Validates: Requirements 1.6, 1.7, 2.3, 4.1, 6.3, 9.3
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ContentEngine } from '../content-engine.js'
import { FileEngine } from '../file-engine.js'
import { SchemaEngine } from '../schema-engine.js'
import { QueryEngine } from '../query-engine.js'
import { GitEngine } from '../git-engine.js'
import { RBACEngine } from '../rbac-engine.js'
import type { RequestContext } from '../../types/index.js'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { execSync } from 'child_process'

describe('ContentEngine - Engine Integration', () => {
  let basePath: string
  let fileEngine: FileEngine
  let schemaEngine: SchemaEngine
  let queryEngine: QueryEngine
  let gitEngine: GitEngine
  let rbacEngine: RBACEngine
  let contentEngine: ContentEngine
  let adminContext: RequestContext

  beforeEach(async () => {
    // Create temporary directory
    basePath = await mkdtemp(join(tmpdir(), 'cms-integration-test-'))

    // Initialize all engines
    fileEngine = new FileEngine(basePath)
    schemaEngine = new SchemaEngine(basePath)
    queryEngine = new QueryEngine(basePath, schemaEngine)
    gitEngine = new GitEngine(basePath)
    rbacEngine = new RBACEngine(basePath)

    // Initialize Git repository
    execSync('git init', { cwd: basePath, stdio: 'ignore' })
    execSync('git config user.name "Test User"', { cwd: basePath, stdio: 'ignore' })
    execSync('git config user.email "test@example.com"', { cwd: basePath, stdio: 'ignore' })

    // Create content engine with all dependencies
    contentEngine = new ContentEngine(
      basePath,
      fileEngine,
      schemaEngine,
      queryEngine,
      gitEngine,
      rbacEngine
    )

    // Create admin context for tests
    adminContext = {
      user: {
        id: 'user-1',
        username: 'admin',
        email: 'admin@example.com',
      },
      role: 'admin',
    }

    // Create a test schema
    await schemaEngine.saveSchema('article', {
      apiId: 'article',
kind: 'collectionType',
      displayName: 'Article',
      singularName: 'article',
      pluralName: 'articles',
      attributes: {
        title: {
          type: 'string',
          required: true,
        },
        content: {
          type: 'text',
        },
        slug: {
          type: 'uid',
          targetField: 'title',
        },
      },
    })

    // Load RBAC config (create default config)
    await rbacEngine.loadRBACConfig()

    // Rebuild indexes
    await queryEngine.rebuildAllIndexes()
  })

  afterEach(async () => {
    // Cleanup
    await rm(basePath, { recursive: true, force: true })
  })

  describe('Create Operation Integration', () => {
    it('should call SchemaEngine.validate before write', async () => {
      const validateSpy = vi.spyOn(schemaEngine, 'validate')

      await contentEngine.create(
        'article',
        {
          title: 'Test Article',
          content: 'Test content',
        },
        adminContext
      )

      expect(validateSpy).toHaveBeenCalledWith('article', expect.objectContaining({
        title: 'Test Article',
        content: 'Test content',
      }))
    })

    it('should call FileEngine.writeAtomic for persistence', async () => {
      const writeAtomicSpy = vi.spyOn(fileEngine, 'writeAtomic')

      await contentEngine.create(
        'article',
        {
          title: 'Test Article',
          content: 'Test content',
        },
        adminContext
      )

      expect(writeAtomicSpy).toHaveBeenCalledWith(
        expect.stringContaining('content/api/article'),
        expect.objectContaining({
          title: 'Test Article',
          content: 'Test content',
        })
      )
    })

    it('should call GitEngine.commit after write', async () => {
      const commitSpy = vi.spyOn(gitEngine, 'commit')

      const entry = await contentEngine.create(
        'article',
        {
          title: 'Test Article',
          content: 'Test content',
        },
        adminContext
      )

      expect(commitSpy).toHaveBeenCalledWith(
        [expect.stringContaining(`content/api/article/${entry.id}.json`)],
        expect.stringContaining('create'),
        expect.objectContaining({
          name: 'admin',
          email: 'admin@example.com',
        })
      )
    })

    it('should call RBACEngine.can for permission check', async () => {
      const canSpy = vi.spyOn(rbacEngine, 'can')

      await contentEngine.create(
        'article',
        {
          title: 'Test Article',
          content: 'Test content',
        },
        adminContext
      )

      expect(canSpy).toHaveBeenCalledWith(
        adminContext,
        'create',
        expect.objectContaining({
          type: 'article',
        })
      )
    })

    it('should update QueryEngine index after write', async () => {
      const updateIndexSpy = vi.spyOn(queryEngine, 'updateIndex')

      const entry = await contentEngine.create(
        'article',
        {
          title: 'Test Article',
          content: 'Test content',
        },
        adminContext
      )

      expect(updateIndexSpy).toHaveBeenCalledWith(
        'article',
        entry.id,
        expect.objectContaining({
          title: 'Test Article',
          content: 'Test content',
        })
      )
    })

    it('should integrate all engines in correct order', async () => {
      const callOrder: string[] = []

      vi.spyOn(rbacEngine, 'can').mockImplementation(async () => {
        callOrder.push('rbac')
        return true
      })

      vi.spyOn(schemaEngine, 'validate').mockImplementation(async () => {
        callOrder.push('validate')
        return { valid: true }
      })

      vi.spyOn(fileEngine, 'writeAtomic').mockImplementation(async () => {
        callOrder.push('write')
      })

      vi.spyOn(gitEngine, 'commit').mockImplementation(async () => {
        callOrder.push('commit')
        return 'abc123'
      })

      vi.spyOn(queryEngine, 'updateIndex').mockImplementation(() => {
        callOrder.push('index')
      })

      await contentEngine.create(
        'article',
        {
          title: 'Test Article',
          content: 'Test content',
        },
        adminContext
      )

      // Verify correct order: RBAC -> Validate -> Write -> Commit -> Index
      expect(callOrder).toEqual(['rbac', 'validate', 'write', 'commit', 'index'])
    })
  })

  describe('Update Operation Integration', () => {
    it('should call all engines during update', async () => {
      // Create an entry first
      const entry = await contentEngine.create(
        'article',
        {
          title: 'Original Title',
          content: 'Original content',
        },
        adminContext
      )

      // Spy on all engines
      const canSpy = vi.spyOn(rbacEngine, 'can')
      const validateSpy = vi.spyOn(schemaEngine, 'validate')
      const writeAtomicSpy = vi.spyOn(fileEngine, 'writeAtomic')
      const commitSpy = vi.spyOn(gitEngine, 'commit')
      const updateIndexSpy = vi.spyOn(queryEngine, 'updateIndex')

      // Update the entry
      await contentEngine.update(
        'article',
        entry.id,
        {
          title: 'Updated Title',
        },
        adminContext
      )

      // Verify all engines were called
      expect(canSpy).toHaveBeenCalledWith(
        adminContext,
        'update',
        expect.objectContaining({
          type: 'article',
          id: entry.id,
        })
      )
      expect(validateSpy).toHaveBeenCalled()
      expect(writeAtomicSpy).toHaveBeenCalled()
      expect(commitSpy).toHaveBeenCalled()
      expect(updateIndexSpy).toHaveBeenCalled()
    })
  })

  describe('Delete Operation Integration', () => {
    it('should call all engines during delete', async () => {
      // Create an entry first
      const entry = await contentEngine.create(
        'article',
        {
          title: 'To Delete',
          content: 'Will be deleted',
        },
        adminContext
      )

      // Spy on all engines
      const canSpy = vi.spyOn(rbacEngine, 'can')
      const deleteFileSpy = vi.spyOn(fileEngine, 'deleteFile')
      const commitSpy = vi.spyOn(gitEngine, 'commit')
      const removeFromIndexSpy = vi.spyOn(queryEngine, 'removeFromIndex')

      // Delete the entry
      await contentEngine.delete('article', entry.id, adminContext)

      // Verify all engines were called
      expect(canSpy).toHaveBeenCalledWith(
        adminContext,
        'delete',
        expect.objectContaining({
          type: 'article',
          id: entry.id,
        })
      )
      expect(deleteFileSpy).toHaveBeenCalled()
      expect(commitSpy).toHaveBeenCalled()
      expect(removeFromIndexSpy).toHaveBeenCalledWith('article', entry.id)
    })
  })

  describe('Publish Operation Integration', () => {
    it('should call all engines during publish', async () => {
      // Create an entry first
      const entry = await contentEngine.create(
        'article',
        {
          title: 'To Publish',
          content: 'Will be published',
        },
        adminContext
      )

      // Spy on all engines
      const canSpy = vi.spyOn(rbacEngine, 'can')
      const writeAtomicSpy = vi.spyOn(fileEngine, 'writeAtomic')
      const commitSpy = vi.spyOn(gitEngine, 'commit')
      const updateIndexSpy = vi.spyOn(queryEngine, 'updateIndex')

      // Publish the entry
      await contentEngine.publish('article', entry.id, adminContext)

      // Verify all engines were called
      expect(canSpy).toHaveBeenCalledWith(
        adminContext,
        'publish',
        expect.objectContaining({
          type: 'article',
          id: entry.id,
        })
      )
      expect(writeAtomicSpy).toHaveBeenCalled()
      expect(commitSpy).toHaveBeenCalled()
      expect(updateIndexSpy).toHaveBeenCalled()
    })
  })

  describe('Unpublish Operation Integration', () => {
    it('should call all engines during unpublish', async () => {
      // Create and publish an entry first
      const entry = await contentEngine.create(
        'article',
        {
          title: 'To Unpublish',
          content: 'Will be unpublished',
        },
        adminContext
      )
      await contentEngine.publish('article', entry.id, adminContext)

      // Spy on all engines
      const canSpy = vi.spyOn(rbacEngine, 'can')
      const writeAtomicSpy = vi.spyOn(fileEngine, 'writeAtomic')
      const commitSpy = vi.spyOn(gitEngine, 'commit')
      const updateIndexSpy = vi.spyOn(queryEngine, 'updateIndex')

      // Unpublish the entry
      await contentEngine.unpublish('article', entry.id, adminContext)

      // Verify all engines were called
      expect(canSpy).toHaveBeenCalledWith(
        adminContext,
        'unpublish',
        expect.objectContaining({
          type: 'article',
          id: entry.id,
        })
      )
      expect(writeAtomicSpy).toHaveBeenCalled()
      expect(commitSpy).toHaveBeenCalled()
      expect(updateIndexSpy).toHaveBeenCalled()
    })
  })

  describe('Validation Enforcement', () => {
    it('should reject invalid data before write', async () => {
      await expect(
        contentEngine.create(
          'article',
          {
            // Missing required 'title' field
            content: 'Test content',
          },
          adminContext
        )
      ).rejects.toThrow('Validation failed')

      // Verify no write occurred
      const writeAtomicSpy = vi.spyOn(fileEngine, 'writeAtomic')
      expect(writeAtomicSpy).not.toHaveBeenCalled()
    })

    it('should not write or commit if validation fails', async () => {
      const writeAtomicSpy = vi.spyOn(fileEngine, 'writeAtomic')
      const commitSpy = vi.spyOn(gitEngine, 'commit')

      try {
        await contentEngine.create(
          'article',
          {
            // Missing required 'title' field
            content: 'Test content',
          },
          adminContext
        )
      } catch {
        // Expected to fail
      }

      expect(writeAtomicSpy).not.toHaveBeenCalled()
      expect(commitSpy).not.toHaveBeenCalled()
    })
  })

  describe('Permission Enforcement', () => {
    it('should reject operations without permission', async () => {
      // Create a context with no permissions
      const unauthorizedContext: RequestContext = {
        user: {
          id: 'user-2',
          username: 'guest',
          email: 'guest@example.com',
        },
        role: 'public',
      }

      // Mock RBAC to deny permission
      vi.spyOn(rbacEngine, 'can').mockResolvedValue(false)

      await expect(
        contentEngine.create(
          'article',
          {
            title: 'Test Article',
            content: 'Test content',
          },
          unauthorizedContext
        )
      ).rejects.toThrow('Permission denied')
    })

    it('should not write or commit if permission denied', async () => {
      const writeAtomicSpy = vi.spyOn(fileEngine, 'writeAtomic')
      const commitSpy = vi.spyOn(gitEngine, 'commit')

      // Mock RBAC to deny permission
      vi.spyOn(rbacEngine, 'can').mockResolvedValue(false)

      try {
        await contentEngine.create(
          'article',
          {
            title: 'Test Article',
            content: 'Test content',
          },
          adminContext
        )
      } catch {
        // Expected to fail
      }

      expect(writeAtomicSpy).not.toHaveBeenCalled()
      expect(commitSpy).not.toHaveBeenCalled()
    })
  })

  describe('Index Consistency', () => {
    it('should keep index in sync with file system', async () => {
      // Create an entry
      const entry = await contentEngine.create(
        'article',
        {
          title: 'Test Article',
          content: 'Test content',
        },
        adminContext
      )

      // Verify entry is in index
      const found = await contentEngine.findOne('article', entry.id)
      expect(found).toMatchObject({
        id: entry.id,
        title: 'Test Article',
        content: 'Test content',
      })

      // Update the entry
      await contentEngine.update(
        'article',
        entry.id,
        {
          title: 'Updated Title',
        },
        adminContext
      )

      // Verify index is updated
      const updated = await contentEngine.findOne('article', entry.id)
      expect(updated).toMatchObject({
        id: entry.id,
        title: 'Updated Title',
        content: 'Test content',
      })

      // Delete the entry
      await contentEngine.delete('article', entry.id, adminContext)

      // Verify entry is removed from index
      const deleted = await contentEngine.findOne('article', entry.id)
      expect(deleted).toBeNull()
    })
  })

  describe('Git History', () => {
    it('should create Git commits for all operations', async () => {
      // Create an entry
      const entry = await contentEngine.create(
        'article',
        {
          title: 'Test Article',
          content: 'Test content',
        },
        adminContext
      )

      // Update the entry
      await contentEngine.update(
        'article',
        entry.id,
        {
          title: 'Updated Title',
        },
        adminContext
      )

      // Publish the entry
      await contentEngine.publish('article', entry.id, adminContext)

      // Get Git history
      const history = await gitEngine.getHistory()

      // Verify commits exist for create, update, and publish
      expect(history.length).toBeGreaterThanOrEqual(3)
      expect(history.some(commit => commit.message.includes('create'))).toBe(true)
      expect(history.some(commit => commit.message.includes('update'))).toBe(true)
      expect(history.some(commit => commit.message.includes('publish'))).toBe(true)
    })
  })
})
