/**
 * Tests for ContentEngine slug generation
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ContentEngine } from './content-engine.js'
import { FileEngine } from './file-engine.js'
import { SchemaEngine } from './schema-engine.js'
import { QueryEngine } from './query-engine.js'
import { GitEngine } from './git-engine.js'
import { RBACEngine } from './rbac-engine.js'
import type { ContentTypeSchema, RequestContext } from '../types/index.js'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { execSync } from 'child_process'

describe('ContentEngine - Slug Generation', () => {
  let tempDir: string
  let fileEngine: FileEngine
  let schemaEngine: SchemaEngine
  let queryEngine: QueryEngine
  let gitEngine: GitEngine
  let rbacEngine: RBACEngine
  let contentEngine: ContentEngine
  let context: RequestContext

  // Helper function to create schema and build index
  async function setupSchema(schema: ContentTypeSchema) {
    await schemaEngine.saveSchema(schema.apiId, schema)
    await queryEngine.buildIndex(schema.apiId)
  }

  beforeEach(async () => {
    // Create temp directory
    tempDir = await mkdtemp(join(tmpdir(), 'cms-slug-test-'))

    // Initialize engines
    fileEngine = new FileEngine(tempDir)
    schemaEngine = new SchemaEngine(join(tempDir, 'schema'))
    queryEngine = new QueryEngine(tempDir, schemaEngine, fileEngine)
    gitEngine = new GitEngine(tempDir)
    rbacEngine = new RBACEngine(join(tempDir, '.cms', 'rbac.json'), fileEngine)

    contentEngine = new ContentEngine(
      tempDir,
      fileEngine,
      schemaEngine,
      queryEngine,
      gitEngine,
      rbacEngine
    )

    // Initialize Git repo
    execSync('git init', { cwd: tempDir, stdio: 'ignore' })
    execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'ignore' })
    execSync('git config user.email "test@example.com"', {
      cwd: tempDir,
      stdio: 'ignore',
    })

    // Create test context with admin permissions
    context = {
      user: {
        id: 'user-1',
        username: 'testuser',
        email: 'test@example.com',
        role: 'admin',
      },
      role: 'admin',
    }

    // Mock RBAC to always allow
    vi.spyOn(rbacEngine, 'can').mockResolvedValue(true)
  })

  afterEach(async () => {
    // Cleanup temp directory
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('Requirement 14.1: Generate slug from target field', () => {
    it('should generate slug from title field when uid field exists', async () => {
      // Create schema with uid field
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true },
          slug: { type: 'uid', targetField: 'title' },
          content: { type: 'text' },
        },
      }

      await setupSchema(schema)

      // Create entry without providing slug
      const entry = await contentEngine.create(
        'article',
        {
          title: 'Getting Started with CMS',
          content: 'This is the content',
        },
        context
      )

      // Slug should be auto-generated
      expect(entry.slug).toBe('getting-started-with-cms')
    })

    it('should not generate slug if uid field does not exist', async () => {
      // Create schema without uid field
      const schema: ContentTypeSchema = {
        apiId: 'page',
        displayName: 'Page',
        singularName: 'page',
        pluralName: 'pages',
        attributes: {
          title: { type: 'string', required: true },
          content: { type: 'text' },
        },
      }

      await setupSchema(schema)

      // Create entry
      const entry = await contentEngine.create(
        'page',
        {
          title: 'About Us',
          content: 'About page content',
        },
        context
      )

      // No slug field should exist
      expect(entry.slug).toBeUndefined()
    })
  })

  describe('Requirement 14.2: Convert to lowercase, replace spaces, remove special characters', () => {
    it('should convert to lowercase', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true },
          slug: { type: 'uid', targetField: 'title' },
        },
      }

      await setupSchema(schema)

      const entry = await contentEngine.create(
        'article',
        { title: 'UPPERCASE TITLE' },
        context
      )

      expect(entry.slug).toBe('uppercase-title')
    })

    it('should replace spaces with hyphens', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true },
          slug: { type: 'uid', targetField: 'title' },
        },
      }

      await setupSchema(schema)

      const entry = await contentEngine.create(
        'article',
        { title: 'Multiple   Spaces   Here' },
        context
      )

      expect(entry.slug).toBe('multiple-spaces-here')
    })

    it('should remove special characters', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true },
          slug: { type: 'uid', targetField: 'title' },
        },
      }

      await setupSchema(schema)

      const entry = await contentEngine.create(
        'article',
        { title: 'Title with @#$% Special! Characters*' },
        context
      )

      expect(entry.slug).toBe('title-with-special-characters')
    })
  })

  describe('Requirement 14.3: Append numeric suffix for uniqueness', () => {
    it('should append -2 when slug already exists', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true },
          slug: { type: 'uid', targetField: 'title' },
        },
      }

      await setupSchema(schema)

      // Create first entry
      const entry1 = await contentEngine.create(
        'article',
        { title: 'Getting Started' },
        context
      )

      expect(entry1.slug).toBe('getting-started')

      // Create second entry with same title
      const entry2 = await contentEngine.create(
        'article',
        { title: 'Getting Started' },
        context
      )

      expect(entry2.slug).toBe('getting-started-2')
    })

    it('should increment suffix for multiple conflicts', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true },
          slug: { type: 'uid', targetField: 'title' },
        },
      }

      await setupSchema(schema)

      // Create three entries with same title
      const entry1 = await contentEngine.create(
        'article',
        { title: 'Test' },
        context
      )
      const entry2 = await contentEngine.create(
        'article',
        { title: 'Test' },
        context
      )
      const entry3 = await contentEngine.create(
        'article',
        { title: 'Test' },
        context
      )

      expect(entry1.slug).toBe('test')
      expect(entry2.slug).toBe('test-2')
      expect(entry3.slug).toBe('test-3')
    })
  })

  describe('Requirement 14.4: Regenerate slug when target field changes', () => {
    it('should regenerate slug when title changes', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true },
          slug: { type: 'uid', targetField: 'title' },
        },
      }

      await setupSchema(schema)

      // Create entry
      const entry = await contentEngine.create(
        'article',
        { title: 'Original Title' },
        context
      )

      expect(entry.slug).toBe('original-title')

      // Update title
      const updated = await contentEngine.update(
        'article',
        entry.id,
        { title: 'New Title' },
        context
      )

      expect(updated.slug).toBe('new-title')
    })

    it('should not regenerate slug when title does not change', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true },
          slug: { type: 'uid', targetField: 'title' },
          content: { type: 'text' },
        },
      }

      await setupSchema(schema)

      // Create entry
      const entry = await contentEngine.create(
        'article',
        { title: 'My Title', content: 'Original content' },
        context
      )

      const originalSlug = entry.slug

      // Update content but not title
      const updated = await contentEngine.update(
        'article',
        entry.id,
        { content: 'Updated content' },
        context
      )

      expect(updated.slug).toBe(originalSlug)
    })
  })

  describe('Requirement 14.5: Use custom slug if provided', () => {
    it('should use custom slug when provided', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true },
          slug: { type: 'uid', targetField: 'title' },
        },
      }

      await setupSchema(schema)

      // Create entry with custom slug
      const entry = await contentEngine.create(
        'article',
        {
          title: 'Getting Started',
          slug: 'custom-slug',
        },
        context
      )

      expect(entry.slug).toBe('custom-slug')
    })

    it('should use custom slug in update', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true },
          slug: { type: 'uid', targetField: 'title' },
        },
      }

      await setupSchema(schema)

      // Create entry
      const entry = await contentEngine.create(
        'article',
        { title: 'Original Title' },
        context
      )

      // Update with custom slug
      const updated = await contentEngine.update(
        'article',
        entry.id,
        { slug: 'my-custom-slug' },
        context
      )

      expect(updated.slug).toBe('my-custom-slug')
    })
  })

  describe('Requirement 14.6: Return ConflictError for duplicate custom slug', () => {
    it('should throw error when custom slug already exists on create', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true },
          slug: { type: 'uid', targetField: 'title' },
        },
      }

      await setupSchema(schema)

      // Create first entry with custom slug
      await contentEngine.create(
        'article',
        {
          title: 'First Article',
          slug: 'my-slug',
        },
        context
      )

      // Try to create second entry with same custom slug
      await expect(
        contentEngine.create(
          'article',
          {
            title: 'Second Article',
            slug: 'my-slug',
          },
          context
        )
      ).rejects.toThrow(/Slug conflict/)
    })

    it('should throw error when custom slug already exists on update', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true },
          slug: { type: 'uid', targetField: 'title' },
        },
      }

      await setupSchema(schema)

      // Create two entries
      const entry1 = await contentEngine.create(
        'article',
        { title: 'First Article', slug: 'first-slug' },
        context
      )

      const entry2 = await contentEngine.create(
        'article',
        { title: 'Second Article', slug: 'second-slug' },
        context
      )

      // Try to update entry2 with entry1's slug
      await expect(
        contentEngine.update(
          'article',
          entry2.id,
          { slug: 'first-slug' },
          context
        )
      ).rejects.toThrow(/Slug conflict/)
    })

    it('should allow updating entry with its own slug', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true },
          slug: { type: 'uid', targetField: 'title' },
          content: { type: 'text' },
        },
      }

      await setupSchema(schema)

      // Create entry
      const entry = await contentEngine.create(
        'article',
        { title: 'My Article', content: 'Original' },
        context
      )

      const originalSlug = entry.slug

      // Update content without changing slug
      const updated = await contentEngine.update(
        'article',
        entry.id,
        { content: 'Updated' },
        context
      )

      expect(updated.slug).toBe(originalSlug)
    })
  })
})
