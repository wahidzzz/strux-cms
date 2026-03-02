/**
 * Unit tests for ContentEngine
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { ContentEngine } from './content-engine.js'
import { FileEngine } from './file-engine.js'
import { SchemaEngine } from './schema-engine.js'
import { QueryEngine } from './query-engine.js'
import { GitEngine } from './git-engine.js'
import { RBACEngine } from './rbac-engine.js'
import type { RequestContext, ContentTypeSchema } from '../types/index.js'

describe('ContentEngine', () => {
  const testDir = join(process.cwd(), 'test-content-engine')
  const contentDir = join(testDir, 'content', 'api')
  const schemaDir = join(testDir, 'schema')
  const cmsDir = join(testDir, '.cms')

  let fileEngine: FileEngine
  let schemaEngine: SchemaEngine
  let queryEngine: QueryEngine
  let gitEngine: GitEngine
  let rbacEngine: RBACEngine
  let contentEngine: ContentEngine

  // Test context with admin role
  const adminContext: RequestContext = {
    user: {
      id: 'user-1',
      username: 'admin',
      email: 'admin@test.com',
      role: 'admin',
    },
    role: 'admin',
  }

  beforeEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true })

    // Create test directories
    await fs.mkdir(testDir, { recursive: true })
    await fs.mkdir(contentDir, { recursive: true })
    await fs.mkdir(schemaDir, { recursive: true })
    await fs.mkdir(cmsDir, { recursive: true })

    // Initialize Git repository
    await fs.writeFile(join(testDir, '.gitignore'), 'node_modules\n')
    gitEngine = new GitEngine(testDir)
    await gitEngine.execGit(['init'])
    await gitEngine.execGit(['config', 'user.name', 'Test User'])
    await gitEngine.execGit(['config', 'user.email', 'test@example.com'])

    // Create initial commit
    await gitEngine.commit(['.gitignore'], 'Initial commit')

    // Initialize engines
    fileEngine = new FileEngine()
    schemaEngine = new SchemaEngine(schemaDir)
    queryEngine = new QueryEngine(contentDir, fileEngine, schemaEngine)
    rbacEngine = new RBACEngine(testDir)

    // Create RBAC config with admin role
    const rbacConfig = {
      roles: {
        admin: {
          id: 'admin',
          name: 'Admin',
          description: 'Administrator with full access',
          type: 'admin' as const,
          permissions: [
            {
              action: '*' as const,
              subject: 'all',
            },
          ],
        },
      },
      defaultRole: 'admin',
    }

    await fs.writeFile(
      join(cmsDir, 'rbac.json'),
      JSON.stringify(rbacConfig, null, 2)
    )

    await rbacEngine.loadRBACConfig()

    // Create ContentEngine
    contentEngine = new ContentEngine(
      testDir,
      fileEngine,
      schemaEngine,
      queryEngine,
      gitEngine,
      rbacEngine
    )

    // Create test schema
    const articleSchema: ContentTypeSchema = {
      apiId: 'article',
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
          required: false,
        },
        status: {
          type: 'enumeration',
          enum: ['draft', 'published'],
          required: false,
        },
      },
      options: {
        draftAndPublish: true,
        timestamps: true,
      },
    }

    await schemaEngine.saveSchema('article', articleSchema)

    // Build index
    await queryEngine.buildIndex('article')
  })

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('create', () => {
    it('should create a new content entry with generated ID and timestamps', async () => {
      const data = {
        title: 'Test Article',
        content: 'This is a test article',
        status: 'draft',
      }

      const entry = await contentEngine.create('article', data, adminContext)

      // Verify entry structure
      expect(entry.id).toBeDefined()
      expect(entry.id).toMatch(/^[A-Za-z0-9_-]+$/) // nanoid format
      expect(entry.title).toBe('Test Article')
      expect(entry.content).toBe('This is a test article')
      expect(entry.status).toBe('draft')

      // Verify timestamps
      expect(entry.createdAt).toBeDefined()
      expect(entry.updatedAt).toBeDefined()
      expect(entry.createdAt).toBe(entry.updatedAt)

      // Verify audit fields
      expect(entry.createdBy).toBe('user-1')
      expect(entry.updatedBy).toBe('user-1')

      // Verify draft state
      expect(entry.publishedAt).toBeNull()

      // Verify file was created
      const filePath = join(contentDir, 'article', `${entry.id}.json`)
      await expect(fs.access(filePath)).resolves.toBeUndefined()

      // Verify Git commit
      const history = await gitEngine.getHistory()
      expect(history.length).toBeGreaterThan(0)
      expect(history[0].message).toContain('Create article entry')
      expect(history[0].message).toContain(entry.id)

      // Verify index was updated
      const found = await contentEngine.findOne('article', entry.id)
      expect(found).toEqual(entry)
    })

    it('should reject creation with invalid data', async () => {
      const data = {
        // Missing required 'title' field
        content: 'This is a test article',
      }

      await expect(
        contentEngine.create('article', data, adminContext)
      ).rejects.toThrow('Validation failed')
    })
  })

  describe('findOne', () => {
    it('should find an existing entry by ID', async () => {
      // Create an entry
      const data = {
        title: 'Test Article',
        content: 'This is a test article',
      }

      const created = await contentEngine.create('article', data, adminContext)

      // Find the entry
      const found = await contentEngine.findOne('article', created.id)

      expect(found).toEqual(created)
    })

    it('should return null for non-existent entry', async () => {
      const found = await contentEngine.findOne('article', 'non-existent-id')

      expect(found).toBeNull()
    })
  })

  describe('findMany', () => {
    it('should find multiple entries with pagination', async () => {
      // Create multiple entries
      const entries = []
      for (let i = 1; i <= 5; i++) {
        const entry = await contentEngine.create(
          'article',
          {
            title: `Article ${i}`,
            content: `Content ${i}`,
          },
          adminContext
        )
        entries.push(entry)
      }

      // Find all entries
      const result = await contentEngine.findMany('article')

      expect(result.data).toHaveLength(5)
      expect(result.meta.pagination.total).toBe(5)
      expect(result.meta.pagination.page).toBe(1)
      expect(result.meta.pagination.pageSize).toBe(25)
      expect(result.meta.pagination.pageCount).toBe(1)
    })

    it('should support pagination', async () => {
      // Create multiple entries
      for (let i = 1; i <= 10; i++) {
        await contentEngine.create(
          'article',
          {
            title: `Article ${i}`,
            content: `Content ${i}`,
          },
          adminContext
        )
      }

      // Get first page
      const page1 = await contentEngine.findMany('article', {
        pagination: { page: 1, pageSize: 5 },
      })

      expect(page1.data).toHaveLength(5)
      expect(page1.meta.pagination.page).toBe(1)
      expect(page1.meta.pagination.pageSize).toBe(5)
      expect(page1.meta.pagination.total).toBe(10)
      expect(page1.meta.pagination.pageCount).toBe(2)

      // Get second page
      const page2 = await contentEngine.findMany('article', {
        pagination: { page: 2, pageSize: 5 },
      })

      expect(page2.data).toHaveLength(5)
      expect(page2.meta.pagination.page).toBe(2)
    })
  })

  describe('update', () => {
    it('should update an existing entry with partial data', async () => {
      // Create an entry
      const created = await contentEngine.create(
        'article',
        {
          title: 'Original Title',
          content: 'Original Content',
          status: 'draft',
        },
        adminContext
      )

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Update the entry
      const updated = await contentEngine.update(
        'article',
        created.id,
        {
          title: 'Updated Title',
        },
        adminContext
      )

      // Verify updates
      expect(updated.id).toBe(created.id)
      expect(updated.title).toBe('Updated Title')
      expect(updated.content).toBe('Original Content') // Unchanged
      expect(updated.status).toBe('draft') // Unchanged

      // Verify timestamps
      expect(updated.createdAt).toBe(created.createdAt) // Preserved
      expect(updated.updatedAt).not.toBe(created.updatedAt) // Changed

      // Verify audit fields
      expect(updated.createdBy).toBe(created.createdBy) // Preserved
      expect(updated.updatedBy).toBe('user-1')

      // Verify file was updated
      const filePath = join(contentDir, 'article', `${updated.id}.json`)
      const fileContent = await fs.readFile(filePath, 'utf-8')
      const savedEntry = JSON.parse(fileContent)
      expect(savedEntry.title).toBe('Updated Title')

      // Verify Git commit
      const history = await gitEngine.getHistory()
      expect(history[0].message).toContain('Update article entry')

      // Verify index was updated
      const found = await contentEngine.findOne('article', updated.id)
      expect(found?.title).toBe('Updated Title')
    })

    it('should reject update with invalid data', async () => {
      // Create an entry
      const created = await contentEngine.create(
        'article',
        {
          title: 'Original Title',
          content: 'Original Content',
        },
        adminContext
      )

      // Try to update with invalid data (invalid enum value)
      await expect(
        contentEngine.update(
          'article',
          created.id,
          {
            status: 'invalid-status', // Invalid enum value
          },
          adminContext
        )
      ).rejects.toThrow('Validation failed')
    })

    it('should throw error for non-existent entry', async () => {
      await expect(
        contentEngine.update(
          'article',
          'non-existent-id',
          {
            title: 'Updated Title',
          },
          adminContext
        )
      ).rejects.toThrow('Entry not found')
    })
  })

  describe('delete', () => {
    it('should delete an existing entry', async () => {
      // Create an entry
      const created = await contentEngine.create(
        'article',
        {
          title: 'Test Article',
          content: 'This will be deleted',
        },
        adminContext
      )

      // Delete the entry
      await contentEngine.delete('article', created.id, adminContext)

      // Verify file was deleted
      const filePath = join(contentDir, 'article', `${created.id}.json`)
      await expect(fs.access(filePath)).rejects.toThrow()

      // Verify Git commit
      const history = await gitEngine.getHistory()
      expect(history[0].message).toContain('Delete article entry')

      // Verify index was updated
      const found = await contentEngine.findOne('article', created.id)
      expect(found).toBeNull()
    })

    it('should throw error for non-existent entry', async () => {
      await expect(
        contentEngine.delete('article', 'non-existent-id', adminContext)
      ).rejects.toThrow('Entry not found')
    })
  })

  describe('publish', () => {
    it('should publish a draft entry by setting publishedAt timestamp', async () => {
      // Create a draft entry
      const created = await contentEngine.create(
        'article',
        {
          title: 'Draft Article',
          content: 'This is a draft',
        },
        adminContext
      )

      // Verify it's in draft state
      expect(created.publishedAt).toBeNull()

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Publish the entry
      const published = await contentEngine.publish(
        'article',
        created.id,
        adminContext
      )

      // Verify publishedAt is set
      expect(published.publishedAt).toBeDefined()
      expect(published.publishedAt).not.toBeNull()
      expect(typeof published.publishedAt).toBe('string')

      // Verify it's a valid ISO timestamp
      const publishedDate = new Date(published.publishedAt!)
      expect(publishedDate.toISOString()).toBe(published.publishedAt)

      // Verify updatedAt was updated
      expect(published.updatedAt).not.toBe(created.updatedAt)

      // Verify updatedBy was set
      expect(published.updatedBy).toBe('user-1')

      // Verify other fields remain unchanged
      expect(published.id).toBe(created.id)
      expect(published.title).toBe(created.title)
      expect(published.content).toBe(created.content)
      expect(published.createdAt).toBe(created.createdAt)
      expect(published.createdBy).toBe(created.createdBy)

      // Verify file was updated
      const filePath = join(contentDir, 'article', `${published.id}.json`)
      const fileContent = await fs.readFile(filePath, 'utf-8')
      const savedEntry = JSON.parse(fileContent)
      expect(savedEntry.publishedAt).toBe(published.publishedAt)

      // Verify Git commit
      const history = await gitEngine.getHistory()
      expect(history[0].message).toContain('Publish article entry')
      expect(history[0].message).toContain(published.id)

      // Verify index was updated
      const found = await contentEngine.findOne('article', published.id)
      expect(found?.publishedAt).toBe(published.publishedAt)
    })

    it('should throw error for non-existent entry', async () => {
      await expect(
        contentEngine.publish('article', 'non-existent-id', adminContext)
      ).rejects.toThrow('Entry not found')
    })

    it('should enforce RBAC permissions for publish action', async () => {
      // Create an entry
      const created = await contentEngine.create(
        'article',
        {
          title: 'Test Article',
        },
        adminContext
      )

      // Create a context with no publish permission
      const noPublishContext: RequestContext = {
        user: {
          id: 'user-2',
          username: 'editor',
          email: 'editor@test.com',
          role: 'editor',
        },
        role: 'editor',
      }

      // Add editor role with create/update but no publish permission
      await rbacEngine.createRole({
        name: 'Editor',
        description: 'Editor without publish permission',
        type: 'custom',
        permissions: [
          {
            action: 'create',
            subject: 'all',
          },
          {
            action: 'update',
            subject: 'all',
          },
        ],
      })

      // Try to publish without permission
      await expect(
        contentEngine.publish('article', created.id, noPublishContext)
      ).rejects.toThrow('Permission denied')
    })
  })

  describe('unpublish', () => {
    it('should unpublish a published entry by clearing publishedAt', async () => {
      // Create and publish an entry
      const created = await contentEngine.create(
        'article',
        {
          title: 'Published Article',
          content: 'This is published',
        },
        adminContext
      )

      const published = await contentEngine.publish(
        'article',
        created.id,
        adminContext
      )

      // Verify it's published
      expect(published.publishedAt).not.toBeNull()

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Unpublish the entry
      const unpublished = await contentEngine.unpublish(
        'article',
        published.id,
        adminContext
      )

      // Verify publishedAt is null
      expect(unpublished.publishedAt).toBeNull()

      // Verify updatedAt was updated
      expect(unpublished.updatedAt).not.toBe(published.updatedAt)

      // Verify updatedBy was set
      expect(unpublished.updatedBy).toBe('user-1')

      // Verify other fields remain unchanged
      expect(unpublished.id).toBe(published.id)
      expect(unpublished.title).toBe(published.title)
      expect(unpublished.content).toBe(published.content)
      expect(unpublished.createdAt).toBe(published.createdAt)
      expect(unpublished.createdBy).toBe(published.createdBy)

      // Verify file was updated
      const filePath = join(contentDir, 'article', `${unpublished.id}.json`)
      const fileContent = await fs.readFile(filePath, 'utf-8')
      const savedEntry = JSON.parse(fileContent)
      expect(savedEntry.publishedAt).toBeNull()

      // Verify Git commit
      const history = await gitEngine.getHistory()
      expect(history[0].message).toContain('Unpublish article entry')
      expect(history[0].message).toContain(unpublished.id)

      // Verify index was updated
      const found = await contentEngine.findOne('article', unpublished.id)
      expect(found?.publishedAt).toBeNull()
    })

    it('should throw error for non-existent entry', async () => {
      await expect(
        contentEngine.unpublish('article', 'non-existent-id', adminContext)
      ).rejects.toThrow('Entry not found')
    })

    it('should enforce RBAC permissions for unpublish action', async () => {
      // Create and publish an entry
      const created = await contentEngine.create(
        'article',
        {
          title: 'Test Article',
        },
        adminContext
      )

      const published = await contentEngine.publish(
        'article',
        created.id,
        adminContext
      )

      // Create a context with no unpublish permission
      const noUnpublishContext: RequestContext = {
        user: {
          id: 'user-2',
          username: 'editor',
          email: 'editor@test.com',
          role: 'editor',
        },
        role: 'editor',
      }

      // Add editor role with create/update but no unpublish permission
      await rbacEngine.createRole({
        name: 'Editor',
        description: 'Editor without unpublish permission',
        type: 'custom',
        permissions: [
          {
            action: 'create',
            subject: 'all',
          },
          {
            action: 'update',
            subject: 'all',
          },
        ],
      })

      // Try to unpublish without permission
      await expect(
        contentEngine.unpublish('article', published.id, noUnpublishContext)
      ).rejects.toThrow('Permission denied')
    })
  })

  describe('draft/publish workflow', () => {
    it('should handle complete draft to publish to unpublish workflow', async () => {
      // Step 1: Create draft
      const draft = await contentEngine.create(
        'article',
        {
          title: 'Workflow Test',
          content: 'Testing the workflow',
        },
        adminContext
      )

      expect(draft.publishedAt).toBeNull()

      // Step 2: Publish
      const published = await contentEngine.publish(
        'article',
        draft.id,
        adminContext
      )

      expect(published.publishedAt).not.toBeNull()
      expect(published.id).toBe(draft.id)

      // Step 3: Unpublish
      const unpublished = await contentEngine.unpublish(
        'article',
        published.id,
        adminContext
      )

      expect(unpublished.publishedAt).toBeNull()
      expect(unpublished.id).toBe(draft.id)

      // Step 4: Publish again
      const republished = await contentEngine.publish(
        'article',
        unpublished.id,
        adminContext
      )

      expect(republished.publishedAt).not.toBeNull()
      expect(republished.id).toBe(draft.id)

      // Verify Git history shows all operations
      const history = await gitEngine.getHistory()
      const messages = history.map((h) => h.message)

      expect(messages.some((m) => m.includes('Create article entry'))).toBe(true)
      expect(messages.some((m) => m.includes('Publish article entry'))).toBe(true)
      expect(messages.some((m) => m.includes('Unpublish article entry'))).toBe(true)
    })
  })

  describe('RBAC integration', () => {
    it('should enforce permissions on create', async () => {
      // Create a context with no permissions
      const noPermContext: RequestContext = {
        user: {
          id: 'user-2',
          username: 'guest',
          email: 'guest@test.com',
          role: 'guest',
        },
        role: 'guest',
      }

      // Add guest role with no permissions
      await rbacEngine.createRole({
        name: 'Guest',
        description: 'Guest with no permissions',
        type: 'custom',
        permissions: [],
      })

      await expect(
        contentEngine.create(
          'article',
          {
            title: 'Test Article',
          },
          noPermContext
        )
      ).rejects.toThrow('Permission denied')
    })
  })

  describe('relation validation', () => {
    beforeEach(async () => {
      // Create category schema
      const categorySchema: ContentTypeSchema = {
        apiId: 'category',
        displayName: 'Category',
        singularName: 'category',
        pluralName: 'categories',
        attributes: {
          name: {
            type: 'string',
            required: true,
          },
        },
        options: {
          timestamps: true,
        },
      }

      await schemaEngine.saveSchema('category', categorySchema)
      await queryEngine.buildIndex('category')

      // Create tag schema
      const tagSchema: ContentTypeSchema = {
        apiId: 'tag',
        displayName: 'Tag',
        singularName: 'tag',
        pluralName: 'tags',
        attributes: {
          name: {
            type: 'string',
            required: true,
          },
        },
        options: {
          timestamps: true,
        },
      }

      await schemaEngine.saveSchema('tag', tagSchema)
      await queryEngine.buildIndex('tag')

      // Create article schema with relations
      const articleWithRelationsSchema: ContentTypeSchema = {
        apiId: 'article-with-relations',
        displayName: 'Article with Relations',
        singularName: 'article-with-relations',
        pluralName: 'articles-with-relations',
        attributes: {
          title: {
            type: 'string',
            required: true,
          },
          category: {
            type: 'relation',
            relation: {
              relation: 'manyToOne',
              target: 'category',
            },
          },
          tags: {
            type: 'relation',
            relation: {
              relation: 'manyToMany',
              target: 'tag',
            },
          },
        },
        options: {
          timestamps: true,
        },
      }

      await schemaEngine.saveSchema('article-with-relations', articleWithRelationsSchema)
      await queryEngine.buildIndex('article-with-relations')
    })

    describe('manyToOne relations', () => {
      it('should validate that referenced entry exists', async () => {
        // Create a category
        const category = await contentEngine.create(
          'category',
          { name: 'Technology' },
          adminContext
        )

        // Create article with valid category reference
        const article = await contentEngine.create(
          'article-with-relations',
          {
            title: 'Test Article',
            category: category.id,
          },
          adminContext
        )

        expect(article.category).toBe(category.id)
      })

      it('should reject creation with non-existent relation reference', async () => {
        await expect(
          contentEngine.create(
            'article-with-relations',
            {
              title: 'Test Article',
              category: 'non-existent-id',
            },
            adminContext
          )
        ).rejects.toThrow(/references non-existent category entry/)
      })

      it('should reject creation with invalid relation type (not a string)', async () => {
        await expect(
          contentEngine.create(
            'article-with-relations',
            {
              title: 'Test Article',
              category: 123, // Should be a string
            },
            adminContext
          )
        ).rejects.toThrow(/must be a string ID/)
      })

      it('should validate relation on update', async () => {
        // Create a category
        const category = await contentEngine.create(
          'category',
          { name: 'Technology' },
          adminContext
        )

        // Create article without category
        const article = await contentEngine.create(
          'article-with-relations',
          {
            title: 'Test Article',
          },
          adminContext
        )

        // Update with valid category reference
        const updated = await contentEngine.update(
          'article-with-relations',
          article.id,
          {
            category: category.id,
          },
          adminContext
        )

        expect(updated.category).toBe(category.id)
      })

      it('should reject update with non-existent relation reference', async () => {
        // Create article without category
        const article = await contentEngine.create(
          'article-with-relations',
          {
            title: 'Test Article',
          },
          adminContext
        )

        // Try to update with non-existent category
        await expect(
          contentEngine.update(
            'article-with-relations',
            article.id,
            {
              category: 'non-existent-id',
            },
            adminContext
          )
        ).rejects.toThrow(/references non-existent category entry/)
      })
    })

    describe('manyToMany relations', () => {
      it('should validate that all referenced entries exist', async () => {
        // Create tags
        const tag1 = await contentEngine.create(
          'tag',
          { name: 'JavaScript' },
          adminContext
        )
        const tag2 = await contentEngine.create(
          'tag',
          { name: 'TypeScript' },
          adminContext
        )

        // Create article with valid tag references
        const article = await contentEngine.create(
          'article-with-relations',
          {
            title: 'Test Article',
            tags: [tag1.id, tag2.id],
          },
          adminContext
        )

        expect(article.tags).toEqual([tag1.id, tag2.id])
      })

      it('should reject creation with non-existent relation reference in array', async () => {
        // Create one valid tag
        const tag1 = await contentEngine.create(
          'tag',
          { name: 'JavaScript' },
          adminContext
        )

        // Try to create article with one valid and one invalid tag
        await expect(
          contentEngine.create(
            'article-with-relations',
            {
              title: 'Test Article',
              tags: [tag1.id, 'non-existent-id'],
            },
            adminContext
          )
        ).rejects.toThrow(/references non-existent tag entry/)
      })

      it('should reject creation with invalid relation type (not an array)', async () => {
        await expect(
          contentEngine.create(
            'article-with-relations',
            {
              title: 'Test Article',
              tags: 'not-an-array',
            },
            adminContext
          )
        ).rejects.toThrow(/must be an array of IDs/)
      })

      it('should reject creation with invalid element type in array', async () => {
        await expect(
          contentEngine.create(
            'article-with-relations',
            {
              title: 'Test Article',
              tags: [123, 456], // Should be strings
            },
            adminContext
          )
        ).rejects.toThrow(/must be a string ID/)
      })

      it('should validate relations on update', async () => {
        // Create tags
        const tag1 = await contentEngine.create(
          'tag',
          { name: 'JavaScript' },
          adminContext
        )
        const tag2 = await contentEngine.create(
          'tag',
          { name: 'TypeScript' },
          adminContext
        )

        // Create article without tags
        const article = await contentEngine.create(
          'article-with-relations',
          {
            title: 'Test Article',
          },
          adminContext
        )

        // Update with valid tag references
        const updated = await contentEngine.update(
          'article-with-relations',
          article.id,
          {
            tags: [tag1.id, tag2.id],
          },
          adminContext
        )

        expect(updated.tags).toEqual([tag1.id, tag2.id])
      })

      it('should allow empty array for manyToMany relations', async () => {
        const article = await contentEngine.create(
          'article-with-relations',
          {
            title: 'Test Article',
            tags: [],
          },
          adminContext
        )

        expect(article.tags).toEqual([])
      })
    })

    describe('combined relations', () => {
      it('should validate both manyToOne and manyToMany relations', async () => {
        // Create category and tags
        const category = await contentEngine.create(
          'category',
          { name: 'Technology' },
          adminContext
        )
        const tag1 = await contentEngine.create(
          'tag',
          { name: 'JavaScript' },
          adminContext
        )
        const tag2 = await contentEngine.create(
          'tag',
          { name: 'TypeScript' },
          adminContext
        )

        // Create article with both relations
        const article = await contentEngine.create(
          'article-with-relations',
          {
            title: 'Test Article',
            category: category.id,
            tags: [tag1.id, tag2.id],
          },
          adminContext
        )

        expect(article.category).toBe(category.id)
        expect(article.tags).toEqual([tag1.id, tag2.id])
      })

      it('should reject if any relation is invalid', async () => {
        // Create valid category
        const category = await contentEngine.create(
          'category',
          { name: 'Technology' },
          adminContext
        )

        // Try to create with valid category but invalid tag
        await expect(
          contentEngine.create(
            'article-with-relations',
            {
              title: 'Test Article',
              category: category.id,
              tags: ['non-existent-tag'],
            },
            adminContext
          )
        ).rejects.toThrow(/references non-existent tag entry/)
      })
    })

    describe('null and undefined relations', () => {
      it('should allow undefined for optional manyToOne relation', async () => {
        const article = await contentEngine.create(
          'article-with-relations',
          {
            title: 'Test Article',
            // category is undefined (not provided)
          },
          adminContext
        )

        expect(article.category).toBeUndefined()
      })

      it('should allow undefined for optional manyToMany relation', async () => {
        const article = await contentEngine.create(
          'article-with-relations',
          {
            title: 'Test Article',
            // tags is undefined (not provided)
          },
          adminContext
        )

        expect(article.tags).toBeUndefined()
      })
    })
  })

  describe('bulk operations', () => {
    beforeEach(async () => {
      // Create test schema
      const schema: ContentTypeSchema = {
        apiId: 'articles',
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
            required: false,
          },
        },
        options: {
          draftAndPublish: true,
        },
      }

      await schemaEngine.saveSchema('articles', schema)
      await queryEngine.buildIndex('articles')
    })

    describe('createMany', () => {
      it('should create multiple entries in a batch', async () => {
        const entries = [
          { title: 'Article 1', content: 'Content 1' },
          { title: 'Article 2', content: 'Content 2' },
          { title: 'Article 3', content: 'Content 3' },
        ]

        const created = await contentEngine.createMany('articles', entries, adminContext)

        expect(created).toHaveLength(3)
        expect(created[0].title).toBe('Article 1')
        expect(created[1].title).toBe('Article 2')
        expect(created[2].title).toBe('Article 3')

        // Verify all have IDs and timestamps
        for (const entry of created) {
          expect(entry.id).toBeDefined()
          expect(entry.createdAt).toBeDefined()
          expect(entry.updatedAt).toBeDefined()
          expect(entry.publishedAt).toBeNull()
          expect(entry.createdBy).toBe('user-1')
        }

        // Verify entries are in index
        const results = queryEngine.query('articles', {})
        expect(results).toHaveLength(3)
      })

      it('should return empty array for empty input', async () => {
        const created = await contentEngine.createMany('articles', [], adminContext)
        expect(created).toHaveLength(0)
      })

      it('should reject if any entry fails validation', async () => {
        const entries = [
          { title: 'Valid Article' },
          { content: 'Missing title' }, // Invalid - missing required title
        ]

        await expect(
          contentEngine.createMany('articles', entries, adminContext)
        ).rejects.toThrow(/Validation failed/)
      })

      it('should enforce RBAC permissions', async () => {
        const entries = [{ title: 'Article 1' }]

        const restrictedContext: RequestContext = {
          user: {
            id: 'user-2',
            username: 'restricted',
            email: 'restricted@test.com',
            role: 'public',
          },
          role: 'public',
        }

        await expect(
          contentEngine.createMany('articles', entries, restrictedContext)
        ).rejects.toThrow(/Permission denied/)
      })

      it('should commit all entries to Git in a single commit', async () => {
        const entries = [
          { title: 'Article 1' },
          { title: 'Article 2' },
        ]

        await contentEngine.createMany('articles', entries, adminContext)

        // Verify Git commit
        const history = await gitEngine.getHistory(undefined, 1)
        expect(history[0].message).toContain('Create articles')
        expect(history[0].message).toContain('2 entries')
      })
    })

    describe('deleteMany', () => {
      it('should delete multiple entries in a batch', async () => {
        // Create test entries
        const entry1 = await contentEngine.create(
          'articles',
          { title: 'Article 1' },
          adminContext
        )
        const entry2 = await contentEngine.create(
          'articles',
          { title: 'Article 2' },
          adminContext
        )
        const entry3 = await contentEngine.create(
          'articles',
          { title: 'Article 3' },
          adminContext
        )

        // Delete two entries
        await contentEngine.deleteMany('articles', [entry1.id, entry2.id], adminContext)

        // Verify entries are deleted
        const remaining = queryEngine.query('articles', {})
        expect(remaining).toHaveLength(1)
        expect(remaining[0].id).toBe(entry3.id)

        // Verify files are deleted
        const file1Path = join(contentDir, 'articles', `${entry1.id}.json`)
        const file2Path = join(contentDir, 'articles', `${entry2.id}.json`)
        await expect(fs.access(file1Path)).rejects.toThrow()
        await expect(fs.access(file2Path)).rejects.toThrow()
      })

      it('should handle empty array', async () => {
        await contentEngine.deleteMany('articles', [], adminContext)
        // Should not throw
      })

      it('should throw error if any entry does not exist', async () => {
        await expect(
          contentEngine.deleteMany('articles', ['nonexistent-id'], adminContext)
        ).rejects.toThrow(/Entry not found/)
      })

      it('should enforce RBAC permissions for each entry', async () => {
        const entry = await contentEngine.create(
          'articles',
          { title: 'Article 1' },
          adminContext
        )

        const restrictedContext: RequestContext = {
          user: {
            id: 'user-2',
            username: 'restricted',
            email: 'restricted@test.com',
            role: 'public',
          },
          role: 'public',
        }

        await expect(
          contentEngine.deleteMany('articles', [entry.id], restrictedContext)
        ).rejects.toThrow(/Permission denied/)
      })

      it('should commit all deletions to Git in a single commit', async () => {
        // Create test entries
        const entry1 = await contentEngine.create(
          'articles',
          { title: 'Article 1' },
          adminContext
        )
        const entry2 = await contentEngine.create(
          'articles',
          { title: 'Article 2' },
          adminContext
        )

        // Delete entries
        await contentEngine.deleteMany('articles', [entry1.id, entry2.id], adminContext)

        // Verify Git commit
        const history = await gitEngine.getHistory(undefined, 1)
        expect(history[0].message).toContain('Delete articles')
        expect(history[0].message).toContain('2 entries')
      })
    })
  })
})
