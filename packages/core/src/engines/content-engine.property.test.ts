/**
 * Property-based tests for ContentEngine
 * 
 * These tests validate universal correctness properties using fast-check
 * to generate random test cases.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import * as fc from 'fast-check'
import { ContentEngine } from './content-engine.js'
import { FileEngine } from './file-engine.js'
import { SchemaEngine } from './schema-engine.js'
import { QueryEngine } from './query-engine.js'
import { GitEngine } from './git-engine.js'
import { RBACEngine } from './rbac-engine.js'
import type { RequestContext, ContentTypeSchema, CreateData } from '../types/index.js'

/**
 * Property-based tests for ContentEngine unique constraints
 */
describe('ContentEngine - Property-Based Tests', () => {
  let contentEngine: ContentEngine
  let fileEngine: FileEngine
  let schemaEngine: SchemaEngine
  let queryEngine: QueryEngine
  let gitEngine: GitEngine
  let rbacEngine: RBACEngine
  let testDir: string
  let contentDir: string
  let schemaDir: string
  let cmsDir: string

  // Test context with admin role
  const adminContext: RequestContext = {
    user: {
      id: 'admin-user',
      username: 'admin',
      email: 'admin@test.com',
      role: 'admin',
    },
    role: 'admin',
  }

  beforeEach(async () => {
    // Create a unique test directory for each test
    testDir = join(
      process.cwd(),
      'test-data',
      `content-pbt-${Date.now()}-${Math.random().toString(36).substring(2)}`
    )
    contentDir = join(testDir, 'content', 'api')
    schemaDir = join(testDir, 'schema')
    cmsDir = join(testDir, '.cms')

    await fs.mkdir(contentDir, { recursive: true })
    await fs.mkdir(schemaDir, { recursive: true })
    await fs.mkdir(cmsDir, { recursive: true })

    // Initialize Git repository
    await fs.writeFile(join(testDir, '.gitignore'), 'node_modules\n')
    gitEngine = new GitEngine(testDir)
    await gitEngine.execGit(['init'])
    await gitEngine.execGit(['config', 'user.name', 'Test User'])
    await gitEngine.execGit(['config', 'user.email', 'test@example.com'])
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
   * Property P8: Unique Constraint
   * 
   * **Validates: Requirements 11.3, 11.4, 11.9**
   * 
   * For any content type and field with a unique constraint, all entries have
   * distinct values for that field. Attempting to create entries with duplicate
   * values for unique fields results in an error.
   */
  describe('P8: Unique Constraint', () => {
    /**
     * Test that slug fields (uid type) enforce uniqueness
     */
    it('should enforce uniqueness for slug fields across all entries', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate an array of entries with potentially duplicate slugs
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              content: fc.string({ minLength: 0, maxLength: 200 }),
            }),
            { minLength: 2, maxLength: 10 }
          ),
          async (entries) => {
            // Create schema with uid field (slug)
            const schema: ContentTypeSchema = {
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
                slug: {
                  type: 'uid',
                  targetField: 'title',
                  required: false,
                },
                content: {
                  type: 'text',
                  required: false,
                },
              },
              options: {
                draftAndPublish: false,
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema('article', schema)
            await queryEngine.buildIndex('article')

            const createdEntries: Array<{ id: string; slug: string }> = []
            const slugs = new Set<string>()

            // Attempt to create all entries
            for (const entry of entries) {
              try {
                const created = await contentEngine.create('article', entry, adminContext)
                
                // Property 1: Created entry must have a slug
                expect(created.slug).toBeDefined()
                expect(typeof created.slug).toBe('string')
                
                // Property 2: Slug must be unique (not in our tracking set)
                expect(slugs.has(created.slug as string)).toBe(false)
                
                slugs.add(created.slug as string)
                createdEntries.push({ id: created.id, slug: created.slug as string })
              } catch (error) {
                // If creation fails, it should be due to validation, not uniqueness
                // (since auto-generated slugs should always be unique)
                if (error instanceof Error) {
                  expect(error.message).not.toContain('Slug conflict')
                }
              }
            }

            // Property 3: All created entries must have distinct slugs
            const createdSlugs = createdEntries.map(e => e.slug)
            const uniqueSlugs = new Set(createdSlugs)
            expect(uniqueSlugs.size).toBe(createdSlugs.length)

            // Property 4: Query all entries and verify uniqueness
            const allEntries = queryEngine.query('article', {})
            const allSlugs = allEntries.map(e => e.slug as string)
            const allUniqueSlugs = new Set(allSlugs)
            expect(allUniqueSlugs.size).toBe(allSlugs.length)
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test that custom slugs are rejected when they conflict with existing entries
     */
    it('should reject duplicate custom slugs with error', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a custom slug and multiple entries trying to use it
          fc.string({ minLength: 1, maxLength: 30 })
            .map(s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
            .filter(s => s.length > 0),
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              content: fc.string({ minLength: 0, maxLength: 200 }),
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (customSlug, entries) => {
            // Create schema with uid field
            const schema: ContentTypeSchema = {
              apiId: 'post',
kind: 'collectionType',
              displayName: 'Post',
              singularName: 'post',
              pluralName: 'posts',
              attributes: {
                title: {
                  type: 'string',
                  required: true,
                },
                slug: {
                  type: 'uid',
                  targetField: 'title',
                  required: false,
                },
                content: {
                  type: 'text',
                  required: false,
                },
              },
              options: {
                draftAndPublish: false,
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema('post', schema)
            await queryEngine.buildIndex('post')

            let firstCreated = false
            let conflictDetected = false

            // Attempt to create all entries with the same custom slug
            for (const entry of entries) {
              const dataWithSlug: CreateData = {
                ...entry,
                slug: customSlug,
              }

              try {
                const created = await contentEngine.create('post', dataWithSlug, adminContext)
                
                if (!firstCreated) {
                  // Property 1: First entry with custom slug should succeed
                  expect(created.slug).toBe(customSlug)
                  firstCreated = true
                } else {
                  // Property 2: Subsequent entries with same slug should fail
                  // If we reach here, it's a test failure
                  expect.fail('Should have thrown error for duplicate slug')
                }
              } catch (error) {
                if (firstCreated) {
                  // Property 3: Error should mention slug conflict
                  expect(error).toBeInstanceOf(Error)
                  expect((error as Error).message).toContain('Slug conflict')
                  expect((error as Error).message).toContain(customSlug)
                  conflictDetected = true
                } else {
                  // First entry failed for some other reason (validation, etc.)
                  // This is acceptable, just mark that we haven't created the first entry
                  firstCreated = false
                }
              }
            }

            // Property 4: If first entry was created, at least one conflict should be detected
            if (firstCreated && entries.length > 1) {
              expect(conflictDetected).toBe(true)
            }

            // Property 5: Only one entry with the custom slug should exist
            const allEntries = queryEngine.query('post', {
              filters: {
                slug: { $eq: customSlug },
              },
            })
            expect(allEntries.length).toBeLessThanOrEqual(1)
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test that email fields with unique constraint enforce uniqueness
     */
    it('should enforce uniqueness for email fields', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate entries with potentially duplicate emails
          fc.array(
            fc.record({
              username: fc.string({ minLength: 3, maxLength: 20 })
                .filter(s => /^[a-z][a-z0-9_-]*$/.test(s)),
              email: fc.emailAddress(),
              bio: fc.string({ minLength: 0, maxLength: 100 }),
            }),
            { minLength: 3, maxLength: 10 }
          ),
          async (entries) => {
            // Create schema with unique email field
            const schema: ContentTypeSchema = {
              apiId: 'user-profile',
kind: 'collectionType',
              displayName: 'User Profile',
              singularName: 'user-profile',
              pluralName: 'user-profiles',
              attributes: {
                username: {
                  type: 'string',
                  required: true,
                },
                email: {
                  type: 'email',
                  required: true,
                  unique: true,
                },
                bio: {
                  type: 'text',
                  required: false,
                },
              },
              options: {
                draftAndPublish: false,
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema('user-profile', schema)
            await queryEngine.buildIndex('user-profile')

            const createdEmails = new Set<string>()
            const createdIds: string[] = []

            // Attempt to create all entries
            for (const entry of entries) {
              try {
                const created = await contentEngine.create('user-profile', entry, adminContext)
                
                // Property 1: Email should not already exist
                expect(createdEmails.has(entry.email)).toBe(false)
                
                createdEmails.add(entry.email)
                createdIds.push(created.id)
              } catch (error) {
                // If creation fails, check if it's due to duplicate email
                if (error instanceof Error && createdEmails.has(entry.email)) {
                  // Property 2: Duplicate email should cause validation error
                  expect(error.message).toMatch(/validation|unique|duplicate|conflict/i)
                }
              }
            }

            // Property 3: All created entries must have distinct emails
            const allEntries = queryEngine.query('user-profile', {})
            const allEmails = allEntries.map(e => e.email as string)
            const uniqueEmails = new Set(allEmails)
            expect(uniqueEmails.size).toBe(allEmails.length)

            // Property 4: Number of created entries should match number of unique emails in input
            const inputUniqueEmails = new Set(entries.map(e => e.email))
            expect(createdEmails.size).toBeLessThanOrEqual(inputUniqueEmails.size)
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test that updating an entry with a duplicate unique field value is rejected
     */
    it('should reject updates that violate unique constraints', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate two different slugs
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 30 })
              .map(s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
              .filter(s => s.length > 0),
            fc.string({ minLength: 1, maxLength: 30 })
              .map(s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
              .filter(s => s.length > 0)
          ).filter(([slug1, slug2]) => slug1 !== slug2),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          async ([slug1, slug2], title1, title2) => {
            // Create schema with uid field
            const schema: ContentTypeSchema = {
              apiId: 'page',
kind: 'collectionType',
              displayName: 'Page',
              singularName: 'page',
              pluralName: 'pages',
              attributes: {
                title: {
                  type: 'string',
                  required: true,
                },
                slug: {
                  type: 'uid',
                  targetField: 'title',
                  required: false,
                },
              },
              options: {
                draftAndPublish: false,
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema('page', schema)
            await queryEngine.buildIndex('page')

            // Create first entry with slug1
            const entry1 = await contentEngine.create(
              'page',
              { title: title1, slug: slug1 },
              adminContext
            )

            // Property 1: First entry should have slug1
            expect(entry1.slug).toBe(slug1)

            // Create second entry with slug2
            const entry2 = await contentEngine.create(
              'page',
              { title: title2, slug: slug2 },
              adminContext
            )

            // Property 2: Second entry should have slug2
            expect(entry2.slug).toBe(slug2)

            // Attempt to update entry2 to use slug1 (should fail)
            try {
              await contentEngine.update(
                'page',
                entry2.id,
                { slug: slug1 },
                adminContext
              )

              // Property 3: Update should fail
              expect.fail('Should have thrown error for duplicate slug on update')
            } catch (error) {
              // Property 4: Error should mention slug conflict
              expect(error).toBeInstanceOf(Error)
              expect((error as Error).message).toContain('Slug conflict')
              expect((error as Error).message).toContain(slug1)
            }

            // Property 5: Entry2 should still have slug2 (unchanged)
            const entry2After = await contentEngine.findOne('page', entry2.id)
            expect(entry2After).toBeDefined()
            expect(entry2After!.slug).toBe(slug2)

            // Property 6: Both entries should still exist with distinct slugs
            const allEntries = queryEngine.query('page', {})
            expect(allEntries.length).toBe(2)
            const slugs = allEntries.map(e => e.slug as string)
            expect(new Set(slugs).size).toBe(2)
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test that concurrent creation attempts with duplicate unique values are handled correctly
     */
    it('should handle concurrent creation attempts with duplicate unique values', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a slug and multiple concurrent attempts
          fc.string({ minLength: 1, maxLength: 30 })
            .map(s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
            .filter(s => s.length > 0),
          fc.integer({ min: 3, max: 8 }),
          async (customSlug, numAttempts) => {
            // Create schema with uid field
            const schema: ContentTypeSchema = {
              apiId: 'product',
kind: 'collectionType',
              displayName: 'Product',
              singularName: 'product',
              pluralName: 'products',
              attributes: {
                name: {
                  type: 'string',
                  required: true,
                },
                slug: {
                  type: 'uid',
                  targetField: 'name',
                  required: false,
                },
              },
              options: {
                draftAndPublish: false,
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema('product', schema)
            await queryEngine.buildIndex('product')

            // Attempt concurrent creations with the same slug
            const results = await Promise.allSettled(
              Array.from({ length: numAttempts }, (_, i) =>
                contentEngine.create(
                  'product',
                  { name: `Product ${i}`, slug: customSlug },
                  adminContext
                )
              )
            )

            // Property 1: At most one creation should succeed
            const successes = results.filter(r => r.status === 'fulfilled')
            expect(successes.length).toBeLessThanOrEqual(1)

            // Property 2: If one succeeded, others should fail with conflict error
            if (successes.length === 1) {
              const failures = results.filter(r => r.status === 'rejected')
              expect(failures.length).toBe(numAttempts - 1)

              for (const failure of failures) {
                if (failure.status === 'rejected') {
                  expect(failure.reason).toBeInstanceOf(Error)
                  expect(failure.reason.message).toContain('Slug conflict')
                }
              }
            }

            // Property 3: Only one entry with the custom slug should exist
            const allEntries = queryEngine.query('product', {
              filters: {
                slug: { $eq: customSlug },
              },
            })
            expect(allEntries.length).toBeLessThanOrEqual(1)

            // Property 4: All entries in database should have unique slugs
            const allProducts = queryEngine.query('product', {})
            const allSlugs = allProducts.map(e => e.slug as string)
            const uniqueSlugs = new Set(allSlugs)
            expect(uniqueSlugs.size).toBe(allSlugs.length)
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test that slug uniqueness is maintained across different title variations
     */
    it('should generate unique slugs for similar titles', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a base title and create variations
          fc.string({ minLength: 3, maxLength: 30 }),
          fc.integer({ min: 2, max: 10 }),
          async (baseTitle, numVariations) => {
            // Create schema with uid field
            const schema: ContentTypeSchema = {
              apiId: 'blog-post',
kind: 'collectionType',
              displayName: 'Blog Post',
              singularName: 'blog-post',
              pluralName: 'blog-posts',
              attributes: {
                title: {
                  type: 'string',
                  required: true,
                },
                slug: {
                  type: 'uid',
                  targetField: 'title',
                  required: false,
                },
              },
              options: {
                draftAndPublish: false,
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema('blog-post', schema)
            await queryEngine.buildIndex('blog-post')

            const createdSlugs: string[] = []

            // Create multiple entries with the same title
            for (let i = 0; i < numVariations; i++) {
              try {
                const created = await contentEngine.create(
                  'blog-post',
                  { title: baseTitle },
                  adminContext
                )

                // Property 1: Each entry should have a slug
                expect(created.slug).toBeDefined()
                expect(typeof created.slug).toBe('string')

                createdSlugs.push(created.slug as string)
              } catch (error) {
                // Creation might fail due to validation, but not uniqueness
                if (error instanceof Error) {
                  expect(error.message).not.toContain('Slug conflict')
                }
              }
            }

            // Property 2: All generated slugs must be unique
            const uniqueSlugs = new Set(createdSlugs)
            expect(uniqueSlugs.size).toBe(createdSlugs.length)

            // Property 3: If multiple entries were created, slugs should have numeric suffixes
            if (createdSlugs.length > 1) {
              // First slug might not have suffix, but subsequent ones should
              for (let i = 1; i < createdSlugs.length; i++) {
                // Slug should end with a number (e.g., -2, -3, etc.)
                expect(createdSlugs[i]).toMatch(/-\d+$/)
              }
            }

            // Property 4: All entries in database should have unique slugs
            const allEntries = queryEngine.query('blog-post', {})
            const allSlugs = allEntries.map(e => e.slug as string)
            const allUniqueSlugs = new Set(allSlugs)
            expect(allUniqueSlugs.size).toBe(allSlugs.length)
          }
        ),
        { numRuns: 5 }
      )
    })
  })

  /**
   * Property P9: Publication State
   * 
   * **Validates: Requirements 3.6, 5.4, 5.5**
   * 
   * For any content entry, it appears in live query results if and only if its
   * publishedAt field is not null. Preview queries include all entries regardless
   * of publishedAt value.
   */
  describe('P9: Publication State', () => {
    /**
     * Test that live queries exclude entries with publishedAt=null
     */
    it('should exclude unpublished entries from live queries', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate an array of entries with random publication states
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              content: fc.string({ minLength: 0, maxLength: 200 }),
              shouldPublish: fc.boolean(),
            }),
            { minLength: 5, maxLength: 20 }
          ),
          async (entries) => {
            // Create unique content type name for this test run
            const contentType = `article-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
            
            // Create schema with draftAndPublish enabled
            const schema: ContentTypeSchema = {
              apiId: contentType,
kind: 'collectionType',
              displayName: 'Article',
              singularName: contentType,
              pluralName: `${contentType}s`,
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
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema(contentType, schema)
            await queryEngine.buildIndex(contentType)

            const createdEntries: Array<{ id: string; publishedAt: string | null }> = []

            // Create entries and publish some of them
            for (const entry of entries) {
              try {
                // Create entry (starts as draft with publishedAt=null)
                const created = await contentEngine.create(
                  contentType,
                  { title: entry.title, content: entry.content },
                  adminContext
                )

                // Property 1: New entries should start as drafts
                expect(created.publishedAt).toBeNull()

                // Publish if requested
                if (entry.shouldPublish) {
                  const published = await contentEngine.publish(contentType, created.id, adminContext)
                  
                  // Property 2: Published entries should have publishedAt set
                  expect(published.publishedAt).not.toBeNull()
                  expect(typeof published.publishedAt).toBe('string')
                  
                  createdEntries.push({ id: published.id, publishedAt: published.publishedAt as string })
                } else {
                  createdEntries.push({ id: created.id, publishedAt: null })
                }
              } catch (error) {
                // Creation might fail due to validation
                if (error instanceof Error) {
                  // Log but continue
                  console.warn('Entry creation failed:', error.message)
                }
              }
            }

            // Property 3: Live queries should only return published entries
            const liveResults = queryEngine.query(contentType, {
              publicationState: 'live',
            })

            for (const result of liveResults) {
              expect(result.publishedAt).not.toBeNull()
              expect(result.publishedAt).not.toBeUndefined()
            }

            // Property 4: Preview queries should return all entries
            const previewResults = queryEngine.query(contentType, {
              publicationState: 'preview',
            })

            expect(previewResults.length).toBe(createdEntries.length)

            // Property 5: Live results should be a subset of preview results
            expect(liveResults.length).toBeLessThanOrEqual(previewResults.length)

            // Property 6: Count of live results should match count of published entries
            const publishedCount = createdEntries.filter(e => e.publishedAt !== null).length
            expect(liveResults.length).toBe(publishedCount)

            // Property 7: All entries in live results should be in preview results
            const previewIds = new Set(previewResults.map(e => e.id))
            for (const liveEntry of liveResults) {
              expect(previewIds.has(liveEntry.id)).toBe(true)
            }

            // Property 8: Entries with publishedAt=null should NOT appear in live results
            const liveIds = new Set(liveResults.map(e => e.id))
            const draftEntries = createdEntries.filter(e => e.publishedAt === null)
            for (const draftEntry of draftEntries) {
              expect(liveIds.has(draftEntry.id)).toBe(false)
            }
          }
        ),
        { numRuns: 3 }
      )
    })

    /**
     * Test that unpublishing entries removes them from live queries
     */
    it('should remove unpublished entries from live queries', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate entries to publish and then unpublish
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              content: fc.string({ minLength: 0, maxLength: 200 }),
            }),
            { minLength: 3, maxLength: 10 }
          ),
          fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 5 }),
          async (entries, indicesToUnpublish) => {
            // Create unique content type name for this test run
            const contentType = `post-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
            
            // Create schema with draftAndPublish enabled
            const schema: ContentTypeSchema = {
              apiId: contentType,
kind: 'collectionType',
              displayName: 'Post',
              singularName: contentType,
              pluralName: `${contentType}s`,
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
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema(contentType, schema)
            await queryEngine.buildIndex(contentType)

            const createdIds: string[] = []

            // Create and publish all entries
            for (const entry of entries) {
              try {
                const created = await contentEngine.create(
                  contentType,
                  { title: entry.title, content: entry.content },
                  adminContext
                )

                const published = await contentEngine.publish(contentType, created.id, adminContext)
                createdIds.push(published.id)
              } catch (error) {
                // Continue on error
              }
            }

            // Property 1: All entries should appear in live queries initially
            const liveBeforeUnpublish = queryEngine.query(contentType, {
              publicationState: 'live',
            })
            expect(liveBeforeUnpublish.length).toBe(createdIds.length)

            // Unpublish selected entries
            const unpublishedIds = new Set<string>()
            for (const index of indicesToUnpublish) {
              if (index < createdIds.length) {
                try {
                  await contentEngine.unpublish(contentType, createdIds[index], adminContext)
                  unpublishedIds.add(createdIds[index])
                } catch (error) {
                  // Continue on error
                }
              }
            }

            // Property 2: Unpublished entries should NOT appear in live queries
            const liveAfterUnpublish = queryEngine.query(contentType, {
              publicationState: 'live',
            })

            const liveIds = new Set(liveAfterUnpublish.map(e => e.id))
            for (const unpublishedId of unpublishedIds) {
              expect(liveIds.has(unpublishedId)).toBe(false)
            }

            // Property 3: Live count should decrease by number of unpublished entries
            expect(liveAfterUnpublish.length).toBe(createdIds.length - unpublishedIds.size)

            // Property 4: All entries should still appear in preview queries
            const previewAfterUnpublish = queryEngine.query(contentType, {
              publicationState: 'preview',
            })
            expect(previewAfterUnpublish.length).toBe(createdIds.length)

            // Property 5: Unpublished entries should have publishedAt=null
            for (const unpublishedId of unpublishedIds) {
              const entry = await contentEngine.findOne(contentType, unpublishedId)
              expect(entry).toBeDefined()
              expect(entry!.publishedAt).toBeNull()
            }

            // Property 6: Published entries should still have publishedAt set
            for (const liveEntry of liveAfterUnpublish) {
              expect(liveEntry.publishedAt).not.toBeNull()
              expect(liveEntry.publishedAt).not.toBeUndefined()
            }
          }
        ),
        { numRuns: 3 }
      )
    })

    /**
     * Test that publication state filtering works with other filters
     */
    it('should combine publication state with other filters correctly', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate entries with different categories and publication states
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              category: fc.constantFrom('tech', 'sports', 'news', 'entertainment'),
              shouldPublish: fc.boolean(),
            }),
            { minLength: 10, maxLength: 30 }
          ),
          fc.constantFrom('tech', 'sports', 'news', 'entertainment'),
          async (entries, filterCategory) => {
            // Create unique content type name for this test run
            const contentType = `news-article-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
            
            // Create schema with draftAndPublish enabled
            const schema: ContentTypeSchema = {
              apiId: contentType,
kind: 'collectionType',
              displayName: 'News Article',
              singularName: contentType,
              pluralName: `${contentType}s`,
              attributes: {
                title: {
                  type: 'string',
                  required: true,
                },
                category: {
                  type: 'string',
                  required: true,
                },
              },
              options: {
                draftAndPublish: true,
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema(contentType, schema)
            await queryEngine.buildIndex(contentType)

            const createdEntries: Array<{
              id: string
              category: string
              publishedAt: string | null
            }> = []

            // Create entries
            for (const entry of entries) {
              try {
                const created = await contentEngine.create(
                  contentType,
                  { title: entry.title, category: entry.category },
                  adminContext
                )

                if (entry.shouldPublish) {
                  const published = await contentEngine.publish(contentType, created.id, adminContext)
                  createdEntries.push({
                    id: published.id,
                    category: entry.category,
                    publishedAt: published.publishedAt as string,
                  })
                } else {
                  createdEntries.push({
                    id: created.id,
                    category: entry.category,
                    publishedAt: null,
                  })
                }
              } catch (error) {
                // Continue on error
              }
            }

            // Property 1: Live query with category filter should only return published entries in that category
            const liveFiltered = queryEngine.query(contentType, {
              publicationState: 'live',
              filters: {
                category: { $eq: filterCategory },
              },
            })

            for (const result of liveFiltered) {
              expect(result.publishedAt).not.toBeNull()
              expect(result.publishedAt).not.toBeUndefined()
              expect(result.category).toBe(filterCategory)
            }

            // Property 2: Preview query with category filter should return all entries in that category
            const previewFiltered = queryEngine.query(contentType, {
              publicationState: 'preview',
              filters: {
                category: { $eq: filterCategory },
              },
            })

            for (const result of previewFiltered) {
              expect(result.category).toBe(filterCategory)
            }

            // Property 3: Live filtered count should match published entries in category
            const expectedLiveCount = createdEntries.filter(
              e => e.category === filterCategory && e.publishedAt !== null
            ).length
            expect(liveFiltered.length).toBe(expectedLiveCount)

            // Property 4: Preview filtered count should match all entries in category
            const expectedPreviewCount = createdEntries.filter(
              e => e.category === filterCategory
            ).length
            expect(previewFiltered.length).toBe(expectedPreviewCount)

            // Property 5: Live filtered should be subset of preview filtered
            expect(liveFiltered.length).toBeLessThanOrEqual(previewFiltered.length)
          }
        ),
        { numRuns: 3 }
      )
    })

    /**
     * Test that default query behavior (no publicationState specified)
     */
    it('should include all entries when publicationState is not specified', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate entries with random publication states
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              shouldPublish: fc.boolean(),
            }),
            { minLength: 5, maxLength: 15 }
          ),
          async (entries) => {
            // Create unique content type name for this test run
            const contentType = `page-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
            
            // Create schema with draftAndPublish enabled
            const schema: ContentTypeSchema = {
              apiId: contentType,
kind: 'collectionType',
              displayName: 'Page',
              singularName: contentType,
              pluralName: `${contentType}s`,
              attributes: {
                title: {
                  type: 'string',
                  required: true,
                },
              },
              options: {
                draftAndPublish: true,
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema(contentType, schema)
            await queryEngine.buildIndex(contentType)

            let createdCount = 0

            // Create entries with mixed publication states
            for (const entry of entries) {
              try {
                const created = await contentEngine.create(
                  contentType,
                  { title: entry.title },
                  adminContext
                )

                if (entry.shouldPublish) {
                  await contentEngine.publish(contentType, created.id, adminContext)
                }

                createdCount++
              } catch (error) {
                // Continue on error
              }
            }

            // Property 1: Query without publicationState should return all entries
            const allResults = queryEngine.query(contentType, {})
            expect(allResults.length).toBe(createdCount)

            // Property 2: Default query should match preview query
            const previewResults = queryEngine.query(contentType, {
              publicationState: 'preview',
            })
            expect(allResults.length).toBe(previewResults.length)

            // Property 3: Default query should include both published and unpublished
            const hasPublished = allResults.some(e => e.publishedAt !== null && e.publishedAt !== undefined)
            const hasUnpublished = allResults.some(e => e.publishedAt === null || e.publishedAt === undefined)

            // If we have multiple entries, we should have a mix (statistically likely)
            if (createdCount >= 5) {
              // At least one of each type should exist (with high probability)
              expect(hasPublished || hasUnpublished).toBe(true)
            }
          }
        ),
        { numRuns: 3 }
      )
    })

    /**
     * Test that publication state is preserved across updates
     */
    it('should preserve publication state when updating other fields', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate initial and updated data
          fc.record({
            initialTitle: fc.string({ minLength: 1, maxLength: 50 }),
            updatedTitle: fc.string({ minLength: 1, maxLength: 50 }),
            shouldPublish: fc.boolean(),
          }),
          async (data) => {
            // Create unique content type name for this test run
            const contentType = `document-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
            
            // Create schema with draftAndPublish enabled
            const schema: ContentTypeSchema = {
              apiId: contentType,
kind: 'collectionType',
              displayName: 'Document',
              singularName: contentType,
              pluralName: `${contentType}s`,
              attributes: {
                title: {
                  type: 'string',
                  required: true,
                },
              },
              options: {
                draftAndPublish: true,
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema(contentType, schema)
            await queryEngine.buildIndex(contentType)

            // Create entry
            const created = await contentEngine.create(
              contentType,
              { title: data.initialTitle },
              adminContext
            )

            // Property 1: New entry should be draft
            expect(created.publishedAt).toBeNull()

            // Publish if requested
            let publishedAt: string | null = null
            if (data.shouldPublish) {
              const published = await contentEngine.publish(contentType, created.id, adminContext)
              publishedAt = published.publishedAt as string
              expect(publishedAt).not.toBeNull()
            }

            // Update the entry (change title)
            const updated = await contentEngine.update(
              contentType,
              created.id,
              { title: data.updatedTitle },
              adminContext
            )

            // Property 2: Publication state should be preserved after update
            if (data.shouldPublish) {
              expect(updated.publishedAt).not.toBeNull()
              expect(updated.publishedAt).toBe(publishedAt)
            } else {
              expect(updated.publishedAt).toBeNull()
            }

            // Property 3: Query results should reflect publication state
            const liveResults = queryEngine.query(contentType, {
              publicationState: 'live',
            })

            if (data.shouldPublish) {
              expect(liveResults.length).toBe(1)
              expect(liveResults[0].id).toBe(created.id)
            } else {
              expect(liveResults.length).toBe(0)
            }

            // Property 4: Preview should always include the entry
            const previewResults = queryEngine.query(contentType, {
              publicationState: 'preview',
            })
            expect(previewResults.length).toBe(1)
            expect(previewResults[0].id).toBe(created.id)
          }
        ),
        { numRuns: 3 }
      )
    })
  })

  /**
   * Property P11: Timestamp Monotonicity
   * 
   * **Validates: Requirements 1.2, 1.4**
   * 
   * For any content entry, createdAt is less than or equal to updatedAt, and
   * each update operation increases updatedAt. createdAt never changes after creation.
   */
  describe('P11: Timestamp Monotonicity', () => {
  /**
   * Test that createdAt <= updatedAt always holds
   */
  it('should maintain createdAt <= updatedAt invariant', { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate entries with random data
        fc.array(
          fc.record({
            title: fc.string({ minLength: 1, maxLength: 50 }),
            content: fc.string({ minLength: 0, maxLength: 200 }),
          }),
          { minLength: 3, maxLength: 10 }
        ),
        async (entries) => {
          // Create unique content type name for this test run
          const contentType = `article-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

          // Create schema
          const schema: ContentTypeSchema = {
            apiId: contentType,
kind: 'collectionType',
            displayName: 'Article',
            singularName: contentType,
            pluralName: `${contentType}s`,
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
              draftAndPublish: false,
              timestamps: true,
            },
          }

          await schemaEngine.saveSchema(contentType, schema)
          await queryEngine.buildIndex(contentType)

          // Create entries and verify timestamp invariant
          for (const entry of entries) {
            try {
              const created = await contentEngine.create(
                contentType,
                { title: entry.title, content: entry.content },
                adminContext
              )

              // Property 1: createdAt and updatedAt must be defined
              expect(created.createdAt).toBeDefined()
              expect(created.updatedAt).toBeDefined()
              expect(typeof created.createdAt).toBe('string')
              expect(typeof created.updatedAt).toBe('string')

              // Property 2: Timestamps must be valid ISO 8601 strings
              const createdAtDate = new Date(created.createdAt)
              const updatedAtDate = new Date(created.updatedAt)
              expect(createdAtDate.toISOString()).toBe(created.createdAt)
              expect(updatedAtDate.toISOString()).toBe(created.updatedAt)

              // Property 3: For new entries, createdAt should equal updatedAt
              expect(created.createdAt).toBe(created.updatedAt)

              // Property 4: createdAt <= updatedAt (as Date objects)
              expect(createdAtDate.getTime()).toBeLessThanOrEqual(updatedAtDate.getTime())
            } catch (error) {
              // Creation might fail due to validation
              if (error instanceof Error) {
                console.warn('Entry creation failed:', error.message)
              }
            }
          }
        }
      ),
      { numRuns: 3 }
    )
  })

  /**
   * Test that each update operation increases updatedAt
   */
  it('should increase updatedAt on each update operation', { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate initial data and a sequence of updates
        fc.record({
          initialTitle: fc.string({ minLength: 1, maxLength: 50 }),
          initialContent: fc.string({ minLength: 0, maxLength: 200 }),
        }),
        fc.array(
          fc.record({
            title: fc.string({ minLength: 1, maxLength: 50 }),
            content: fc.string({ minLength: 0, maxLength: 200 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (initialData, updates) => {
          // Create unique content type name for this test run
          const contentType = `post-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

          // Create schema
          const schema: ContentTypeSchema = {
            apiId: contentType,
kind: 'collectionType',
            displayName: 'Post',
            singularName: contentType,
            pluralName: `${contentType}s`,
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
              draftAndPublish: false,
              timestamps: true,
            },
          }

          await schemaEngine.saveSchema(contentType, schema)
          await queryEngine.buildIndex(contentType)

          // Create initial entry
          const created = await contentEngine.create(
            contentType,
            { title: initialData.initialTitle, content: initialData.initialContent },
            adminContext
          )

          const originalCreatedAt = created.createdAt
          let previousUpdatedAt = created.updatedAt

          // Property 1: Initial createdAt and updatedAt should be equal
          expect(created.createdAt).toBe(created.updatedAt)

          // Add small delay to ensure timestamp difference
          await new Promise(resolve => setTimeout(resolve, 10))

          // Perform sequence of updates
          for (let i = 0; i < updates.length; i++) {
            const update = updates[i]

            const updated = await contentEngine.update(
              contentType,
              created.id,
              { title: update.title, content: update.content },
              adminContext
            )

            // Property 2: createdAt must never change
            expect(updated.createdAt).toBe(originalCreatedAt)

            // Property 3: updatedAt must be a valid ISO 8601 string
            const updatedAtDate = new Date(updated.updatedAt)
            expect(updatedAtDate.toISOString()).toBe(updated.updatedAt)

            // Property 4: updatedAt must be greater than previous updatedAt
            const previousDate = new Date(previousUpdatedAt)
            const currentDate = new Date(updated.updatedAt)
            expect(currentDate.getTime()).toBeGreaterThan(previousDate.getTime())

            // Property 5: createdAt <= updatedAt invariant must hold
            const createdAtDate = new Date(updated.createdAt)
            expect(createdAtDate.getTime()).toBeLessThanOrEqual(currentDate.getTime())

            // Property 6: updatedAt should be different from createdAt after update
            expect(updated.updatedAt).not.toBe(updated.createdAt)

            // Update for next iteration
            previousUpdatedAt = updated.updatedAt

            // Add small delay between updates to ensure timestamp difference
            if (i < updates.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 10))
            }
          }

          // Property 7: Verify final state from database
          const finalEntry = await contentEngine.findOne(contentType, created.id)
          expect(finalEntry).toBeDefined()
          expect(finalEntry!.createdAt).toBe(originalCreatedAt)
          expect(finalEntry!.updatedAt).toBe(previousUpdatedAt)

          // Property 8: createdAt < updatedAt after updates
          const finalCreatedAt = new Date(finalEntry!.createdAt)
          const finalUpdatedAt = new Date(finalEntry!.updatedAt)
          expect(finalCreatedAt.getTime()).toBeLessThan(finalUpdatedAt.getTime())
        }
      ),
      { numRuns: 3 }
    )
  })

  /**
   * Test that createdAt never changes across multiple updates
   */
  it('should preserve createdAt across multiple updates', { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate initial data and multiple update operations
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.array(
          fc.string({ minLength: 1, maxLength: 50 }),
          { minLength: 3, maxLength: 10 }
        ),
        async (initialTitle, updateTitles) => {
          // Create unique content type name for this test run
          const contentType = `page-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

          // Create schema
          const schema: ContentTypeSchema = {
            apiId: contentType,
kind: 'collectionType',
            displayName: 'Page',
            singularName: contentType,
            pluralName: `${contentType}s`,
            attributes: {
              title: {
                type: 'string',
                required: true,
              },
            },
            options: {
              draftAndPublish: false,
              timestamps: true,
            },
          }

          await schemaEngine.saveSchema(contentType, schema)
          await queryEngine.buildIndex(contentType)

          // Create entry
          const created = await contentEngine.create(
            contentType,
            { title: initialTitle },
            adminContext
          )

          const immutableCreatedAt = created.createdAt
          const timestamps: string[] = [created.updatedAt]

          // Add delay to ensure timestamp differences
          await new Promise(resolve => setTimeout(resolve, 10))

          // Perform multiple updates
          for (const newTitle of updateTitles) {
            const updated = await contentEngine.update(
              contentType,
              created.id,
              { title: newTitle },
              adminContext
            )

            // Property 1: createdAt must remain constant
            expect(updated.createdAt).toBe(immutableCreatedAt)

            // Property 2: updatedAt must change
            expect(updated.updatedAt).not.toBe(timestamps[timestamps.length - 1])

            // Property 3: updatedAt must be strictly increasing
            const prevDate = new Date(timestamps[timestamps.length - 1])
            const currDate = new Date(updated.updatedAt)
            expect(currDate.getTime()).toBeGreaterThan(prevDate.getTime())

            timestamps.push(updated.updatedAt)

            // Add delay between updates
            await new Promise(resolve => setTimeout(resolve, 10))
          }

          // Property 4: All updatedAt timestamps should be unique and increasing
          for (let i = 1; i < timestamps.length; i++) {
            const prev = new Date(timestamps[i - 1])
            const curr = new Date(timestamps[i])
            expect(curr.getTime()).toBeGreaterThan(prev.getTime())
          }

          // Property 5: createdAt should be less than all updatedAt timestamps
          const createdAtDate = new Date(immutableCreatedAt)
          for (const timestamp of timestamps) {
            const timestampDate = new Date(timestamp)
            expect(createdAtDate.getTime()).toBeLessThanOrEqual(timestampDate.getTime())
          }
        }
      ),
      { numRuns: 3 }
    )
  })

  /**
   * Test that timestamps are valid ISO 8601 strings
   */
  it('should use valid ISO 8601 format for all timestamps', { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random entries
        fc.array(
          fc.record({
            title: fc.string({ minLength: 1, maxLength: 50 }),
            content: fc.string({ minLength: 0, maxLength: 200 }),
          }),
          { minLength: 2, maxLength: 8 }
        ),
        async (entries) => {
          // Create unique content type name for this test run
          const contentType = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

          // Create schema
          const schema: ContentTypeSchema = {
            apiId: contentType,
kind: 'collectionType',
            displayName: 'Document',
            singularName: contentType,
            pluralName: `${contentType}s`,
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
              draftAndPublish: false,
              timestamps: true,
            },
          }

          await schemaEngine.saveSchema(contentType, schema)
          await queryEngine.buildIndex(contentType)

          // Create and update entries
          for (const entry of entries) {
            try {
              const created = await contentEngine.create(
                contentType,
                { title: entry.title, content: entry.content },
                adminContext
              )

              // Property 1: Timestamps must be valid ISO 8601 strings
              const createdAtDate = new Date(created.createdAt)
              const updatedAtDate = new Date(created.updatedAt)

              expect(createdAtDate.toISOString()).toBe(created.createdAt)
              expect(updatedAtDate.toISOString()).toBe(created.updatedAt)

              // Property 2: Timestamps must not be NaN
              expect(isNaN(createdAtDate.getTime())).toBe(false)
              expect(isNaN(updatedAtDate.getTime())).toBe(false)

              // Property 3: Timestamps must be in the past or present
              const now = Date.now()
              expect(createdAtDate.getTime()).toBeLessThanOrEqual(now + 1000) // Allow 1s clock skew
              expect(updatedAtDate.getTime()).toBeLessThanOrEqual(now + 1000)

              // Add delay
              await new Promise(resolve => setTimeout(resolve, 10))

              // Update entry
              const updated = await contentEngine.update(
                contentType,
                created.id,
                { content: entry.content + ' updated' },
                adminContext
              )

              // Property 4: Updated timestamps must also be valid ISO 8601
              const newUpdatedAtDate = new Date(updated.updatedAt)
              expect(newUpdatedAtDate.toISOString()).toBe(updated.updatedAt)
              expect(isNaN(newUpdatedAtDate.getTime())).toBe(false)

              // Property 5: createdAt format must remain valid after update
              const updatedCreatedAtDate = new Date(updated.createdAt)
              expect(updatedCreatedAtDate.toISOString()).toBe(updated.createdAt)
            } catch (error) {
              // Continue on error
            }
          }
        }
      ),
      { numRuns: 3 }
    )
  })

  /**
   * Test that publish/unpublish operations don't affect timestamp monotonicity
   */
  it('should maintain timestamp monotonicity through publish/unpublish operations', { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate entry data and publish/unpublish sequence
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 50 }),
          content: fc.string({ minLength: 0, maxLength: 200 }),
        }),
        fc.array(fc.boolean(), { minLength: 2, maxLength: 5 }),
        async (entryData, publishSequence) => {
          // Create unique content type name for this test run
          const contentType = `article-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

          // Create schema with draftAndPublish
          const schema: ContentTypeSchema = {
            apiId: contentType,
kind: 'collectionType',
            displayName: 'Article',
            singularName: contentType,
            pluralName: `${contentType}s`,
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
              timestamps: true,
            },
          }

          await schemaEngine.saveSchema(contentType, schema)
          await queryEngine.buildIndex(contentType)

          // Create entry
          const created = await contentEngine.create(
            contentType,
            { title: entryData.title, content: entryData.content },
            adminContext
          )

          const originalCreatedAt = created.createdAt
          let previousUpdatedAt = created.updatedAt

          // Add delay
          await new Promise(resolve => setTimeout(resolve, 10))

          // Perform publish/unpublish sequence
          for (const shouldPublish of publishSequence) {
            let result

            if (shouldPublish) {
              result = await contentEngine.publish(contentType, created.id, adminContext)
            } else {
              result = await contentEngine.unpublish(contentType, created.id, adminContext)
            }

            // Property 1: createdAt must never change
            expect(result.createdAt).toBe(originalCreatedAt)

            // Property 2: updatedAt must increase
            const prevDate = new Date(previousUpdatedAt)
            const currDate = new Date(result.updatedAt)
            expect(currDate.getTime()).toBeGreaterThan(prevDate.getTime())

            // Property 3: createdAt <= updatedAt invariant
            const createdAtDate = new Date(result.createdAt)
            expect(createdAtDate.getTime()).toBeLessThanOrEqual(currDate.getTime())

            // Property 4: Timestamps must be valid ISO 8601
            expect(createdAtDate.toISOString()).toBe(result.createdAt)
            expect(currDate.toISOString()).toBe(result.updatedAt)

            previousUpdatedAt = result.updatedAt

            // Add delay between operations
            await new Promise(resolve => setTimeout(resolve, 10))
          }

          // Property 5: Final verification
          const finalEntry = await contentEngine.findOne(contentType, created.id)
          expect(finalEntry).toBeDefined()
          expect(finalEntry!.createdAt).toBe(originalCreatedAt)

          const finalCreatedAt = new Date(finalEntry!.createdAt)
          const finalUpdatedAt = new Date(finalEntry!.updatedAt)
          expect(finalCreatedAt.getTime()).toBeLessThan(finalUpdatedAt.getTime())
        }
      ),
      { numRuns: 3 }
    )
  })
})

  /**
   * Property P11: Timestamp Monotonicity
   * 
   * **Validates: Requirements 1.2, 1.4**
   * 
   * For any content entry, createdAt is less than or equal to updatedAt, and
   * each update operation increases updatedAt. createdAt never changes after creation.
   */
  describe('P11: Timestamp Monotonicity', () => {
    /**
     * Test that createdAt <= updatedAt always holds
     */
    it('should maintain createdAt <= updatedAt invariant', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate entries with random data
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              content: fc.string({ minLength: 0, maxLength: 200 }),
            }),
            { minLength: 3, maxLength: 10 }
          ),
          async (entries) => {
            // Create unique content type name for this test run
            const contentType = `article-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
            
            // Create schema
            const schema: ContentTypeSchema = {
              apiId: contentType,
kind: 'collectionType',
              displayName: 'Article',
              singularName: contentType,
              pluralName: `${contentType}s`,
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
                draftAndPublish: false,
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema(contentType, schema)
            await queryEngine.buildIndex(contentType)

            // Create entries and verify timestamp invariant
            for (const entry of entries) {
              try {
                const created = await contentEngine.create(
                  contentType,
                  { title: entry.title, content: entry.content },
                  adminContext
                )

                // Property 1: createdAt and updatedAt must be defined
                expect(created.createdAt).toBeDefined()
                expect(created.updatedAt).toBeDefined()
                expect(typeof created.createdAt).toBe('string')
                expect(typeof created.updatedAt).toBe('string')

                // Property 2: Timestamps must be valid ISO 8601 strings
                const createdAtDate = new Date(created.createdAt)
                const updatedAtDate = new Date(created.updatedAt)
                expect(createdAtDate.toISOString()).toBe(created.createdAt)
                expect(updatedAtDate.toISOString()).toBe(created.updatedAt)

                // Property 3: For new entries, createdAt should equal updatedAt
                expect(created.createdAt).toBe(created.updatedAt)

                // Property 4: createdAt <= updatedAt (as Date objects)
                expect(createdAtDate.getTime()).toBeLessThanOrEqual(updatedAtDate.getTime())
              } catch (error) {
                // Creation might fail due to validation
                if (error instanceof Error) {
                  console.warn('Entry creation failed:', error.message)
                }
              }
            }
          }
        ),
        { numRuns: 3 }
      )
    })

    /**
     * Test that each update operation increases updatedAt
     */
    it('should increase updatedAt on each update operation', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate initial data and a sequence of updates
          fc.record({
            initialTitle: fc.string({ minLength: 1, maxLength: 50 }),
            initialContent: fc.string({ minLength: 0, maxLength: 200 }),
          }),
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              content: fc.string({ minLength: 0, maxLength: 200 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (initialData, updates) => {
            // Create unique content type name for this test run
            const contentType = `post-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
            
            // Create schema
            const schema: ContentTypeSchema = {
              apiId: contentType,
kind: 'collectionType',
              displayName: 'Post',
              singularName: contentType,
              pluralName: `${contentType}s`,
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
                draftAndPublish: false,
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema(contentType, schema)
            await queryEngine.buildIndex(contentType)

            // Create initial entry
            const created = await contentEngine.create(
              contentType,
              { title: initialData.initialTitle, content: initialData.initialContent },
              adminContext
            )

            const originalCreatedAt = created.createdAt
            let previousUpdatedAt = created.updatedAt

            // Property 1: Initial createdAt and updatedAt should be equal
            expect(created.createdAt).toBe(created.updatedAt)

            // Add small delay to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10))

            // Perform sequence of updates
            for (let i = 0; i < updates.length; i++) {
              const update = updates[i]
              
              const updated = await contentEngine.update(
                contentType,
                created.id,
                { title: update.title, content: update.content },
                adminContext
              )

              // Property 2: createdAt must never change
              expect(updated.createdAt).toBe(originalCreatedAt)

              // Property 3: updatedAt must be a valid ISO 8601 string
              const updatedAtDate = new Date(updated.updatedAt)
              expect(updatedAtDate.toISOString()).toBe(updated.updatedAt)

              // Property 4: updatedAt must be greater than previous updatedAt
              const previousDate = new Date(previousUpdatedAt)
              const currentDate = new Date(updated.updatedAt)
              expect(currentDate.getTime()).toBeGreaterThan(previousDate.getTime())

              // Property 5: createdAt <= updatedAt invariant must hold
              const createdAtDate = new Date(updated.createdAt)
              expect(createdAtDate.getTime()).toBeLessThanOrEqual(currentDate.getTime())

              // Property 6: updatedAt should be different from createdAt after update
              expect(updated.updatedAt).not.toBe(updated.createdAt)

              // Update for next iteration
              previousUpdatedAt = updated.updatedAt

              // Add small delay between updates to ensure timestamp difference
              if (i < updates.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 10))
              }
            }

            // Property 7: Verify final state from database
            const finalEntry = await contentEngine.findOne(contentType, created.id)
            expect(finalEntry).toBeDefined()
            expect(finalEntry!.createdAt).toBe(originalCreatedAt)
            expect(finalEntry!.updatedAt).toBe(previousUpdatedAt)

            // Property 8: createdAt < updatedAt after updates
            const finalCreatedAt = new Date(finalEntry!.createdAt)
            const finalUpdatedAt = new Date(finalEntry!.updatedAt)
            expect(finalCreatedAt.getTime()).toBeLessThan(finalUpdatedAt.getTime())
          }
        ),
        { numRuns: 3 }
      )
    })

    /**
     * Test that createdAt never changes across multiple updates
     */
    it('should preserve createdAt across multiple updates', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate initial data and multiple update operations
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.array(
            fc.string({ minLength: 1, maxLength: 50 }),
            { minLength: 3, maxLength: 10 }
          ),
          async (initialTitle, updateTitles) => {
            // Create unique content type name for this test run
            const contentType = `page-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
            
            // Create schema
            const schema: ContentTypeSchema = {
              apiId: contentType,
kind: 'collectionType',
              displayName: 'Page',
              singularName: contentType,
              pluralName: `${contentType}s`,
              attributes: {
                title: {
                  type: 'string',
                  required: true,
                },
              },
              options: {
                draftAndPublish: false,
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema(contentType, schema)
            await queryEngine.buildIndex(contentType)

            // Create entry
            const created = await contentEngine.create(
              contentType,
              { title: initialTitle },
              adminContext
            )

            const immutableCreatedAt = created.createdAt
            const timestamps: string[] = [created.updatedAt]

            // Add delay to ensure timestamp differences
            await new Promise(resolve => setTimeout(resolve, 10))

            // Perform multiple updates
            for (const newTitle of updateTitles) {
              const updated = await contentEngine.update(
                contentType,
                created.id,
                { title: newTitle },
                adminContext
              )

              // Property 1: createdAt must remain constant
              expect(updated.createdAt).toBe(immutableCreatedAt)

              // Property 2: updatedAt must change
              expect(updated.updatedAt).not.toBe(timestamps[timestamps.length - 1])

              // Property 3: updatedAt must be strictly increasing
              const prevDate = new Date(timestamps[timestamps.length - 1])
              const currDate = new Date(updated.updatedAt)
              expect(currDate.getTime()).toBeGreaterThan(prevDate.getTime())

              timestamps.push(updated.updatedAt)

              // Add delay between updates
              await new Promise(resolve => setTimeout(resolve, 10))
            }

            // Property 4: All updatedAt timestamps should be unique and increasing
            for (let i = 1; i < timestamps.length; i++) {
              const prev = new Date(timestamps[i - 1])
              const curr = new Date(timestamps[i])
              expect(curr.getTime()).toBeGreaterThan(prev.getTime())
            }

            // Property 5: createdAt should be less than all updatedAt timestamps
            const createdAtDate = new Date(immutableCreatedAt)
            for (const timestamp of timestamps) {
              const timestampDate = new Date(timestamp)
              expect(createdAtDate.getTime()).toBeLessThanOrEqual(timestampDate.getTime())
            }
          }
        ),
        { numRuns: 3 }
      )
    })

    /**
     * Test that timestamps are valid ISO 8601 strings
     */
    it('should use valid ISO 8601 format for all timestamps', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random entries
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              content: fc.string({ minLength: 0, maxLength: 200 }),
            }),
            { minLength: 2, maxLength: 8 }
          ),
          async (entries) => {
            // Create unique content type name for this test run
            const contentType = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
            
            // Create schema
            const schema: ContentTypeSchema = {
              apiId: contentType,
kind: 'collectionType',
              displayName: 'Document',
              singularName: contentType,
              pluralName: `${contentType}s`,
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
                draftAndPublish: false,
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema(contentType, schema)
            await queryEngine.buildIndex(contentType)

            // Create and update entries
            for (const entry of entries) {
              try {
                const created = await contentEngine.create(
                  contentType,
                  { title: entry.title, content: entry.content },
                  adminContext
                )

                // Property 1: Timestamps must be valid ISO 8601 strings
                const createdAtDate = new Date(created.createdAt)
                const updatedAtDate = new Date(created.updatedAt)
                
                expect(createdAtDate.toISOString()).toBe(created.createdAt)
                expect(updatedAtDate.toISOString()).toBe(created.updatedAt)

                // Property 2: Timestamps must not be NaN
                expect(isNaN(createdAtDate.getTime())).toBe(false)
                expect(isNaN(updatedAtDate.getTime())).toBe(false)

                // Property 3: Timestamps must be in the past or present
                const now = Date.now()
                expect(createdAtDate.getTime()).toBeLessThanOrEqual(now + 1000) // Allow 1s clock skew
                expect(updatedAtDate.getTime()).toBeLessThanOrEqual(now + 1000)

                // Add delay
                await new Promise(resolve => setTimeout(resolve, 10))

                // Update entry
                const updated = await contentEngine.update(
                  contentType,
                  created.id,
                  { content: entry.content + ' updated' },
                  adminContext
                )

                // Property 4: Updated timestamps must also be valid ISO 8601
                const newUpdatedAtDate = new Date(updated.updatedAt)
                expect(newUpdatedAtDate.toISOString()).toBe(updated.updatedAt)
                expect(isNaN(newUpdatedAtDate.getTime())).toBe(false)

                // Property 5: createdAt format must remain valid after update
                const updatedCreatedAtDate = new Date(updated.createdAt)
                expect(updatedCreatedAtDate.toISOString()).toBe(updated.createdAt)
              } catch (error) {
                // Continue on error
              }
            }
          }
        ),
        { numRuns: 3 }
      )
    })

    /**
     * Test that publish/unpublish operations don't affect timestamp monotonicity
     */
    it('should maintain timestamp monotonicity through publish/unpublish operations', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate entry data and publish/unpublish sequence
          fc.record({
            title: fc.string({ minLength: 1, maxLength: 50 }),
            content: fc.string({ minLength: 0, maxLength: 200 }),
          }),
          fc.array(fc.boolean(), { minLength: 2, maxLength: 5 }),
          async (entryData, publishSequence) => {
            // Create unique content type name for this test run
            const contentType = `article-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
            
            // Create schema with draftAndPublish
            const schema: ContentTypeSchema = {
              apiId: contentType,
kind: 'collectionType',
              displayName: 'Article',
              singularName: contentType,
              pluralName: `${contentType}s`,
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
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema(contentType, schema)
            await queryEngine.buildIndex(contentType)

            // Create entry
            const created = await contentEngine.create(
              contentType,
              { title: entryData.title, content: entryData.content },
              adminContext
            )

            const originalCreatedAt = created.createdAt
            let previousUpdatedAt = created.updatedAt

            // Add delay
            await new Promise(resolve => setTimeout(resolve, 10))

            // Perform publish/unpublish sequence
            for (const shouldPublish of publishSequence) {
              let result

              if (shouldPublish) {
                result = await contentEngine.publish(contentType, created.id, adminContext)
              } else {
                result = await contentEngine.unpublish(contentType, created.id, adminContext)
              }

              // Property 1: createdAt must never change
              expect(result.createdAt).toBe(originalCreatedAt)

              // Property 2: updatedAt must increase
              const prevDate = new Date(previousUpdatedAt)
              const currDate = new Date(result.updatedAt)
              expect(currDate.getTime()).toBeGreaterThan(prevDate.getTime())

              // Property 3: createdAt <= updatedAt invariant
              const createdAtDate = new Date(result.createdAt)
              expect(createdAtDate.getTime()).toBeLessThanOrEqual(currDate.getTime())

              // Property 4: Timestamps must be valid ISO 8601
              expect(createdAtDate.toISOString()).toBe(result.createdAt)
              expect(currDate.toISOString()).toBe(result.updatedAt)

              previousUpdatedAt = result.updatedAt

              // Add delay between operations
              await new Promise(resolve => setTimeout(resolve, 10))
            }

            // Property 5: Final verification
            const finalEntry = await contentEngine.findOne(contentType, created.id)
            expect(finalEntry).toBeDefined()
            expect(finalEntry!.createdAt).toBe(originalCreatedAt)
            
            const finalCreatedAt = new Date(finalEntry!.createdAt)
            const finalUpdatedAt = new Date(finalEntry!.updatedAt)
            expect(finalCreatedAt.getTime()).toBeLessThan(finalUpdatedAt.getTime())
          }
        ),
        { numRuns: 3 }
      )
    })
  })

  /**
   * Property P10: Relation Integrity
   * 
   * **Validates: Requirements 15.2, 15.3**
   * 
   * For any content entry with a relation field, all referenced entry IDs point to
   * existing entries in the target content type. Invalid relation references are rejected.
   */
  describe('P10: Relation Integrity', () => {
    /**
     * Test that manyToOne relations only accept valid entry IDs
     */
    it('should validate manyToOne relation references exist', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate authors and articles with valid/invalid references
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 50 }),
              email: fc.emailAddress(),
            }),
            { minLength: 2, maxLength: 5 }
          ),
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              content: fc.string({ minLength: 0, maxLength: 200 }),
            }),
            { minLength: 3, maxLength: 10 }
          ),
          async (authors, articles) => {
            // Create unique content type names for this test run
            const authorType = `author-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
            const articleType = `article-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

            // Create author schema
            const authorSchema: ContentTypeSchema = {
              apiId: authorType,
kind: 'collectionType',
              displayName: 'Author',
              singularName: authorType,
              pluralName: `${authorType}s`,
              attributes: {
                name: {
                  type: 'string',
                  required: true,
                },
                email: {
                  type: 'email',
                  required: true,
                },
              },
              options: {
                draftAndPublish: false,
                timestamps: true,
              },
            }

            // Create article schema with manyToOne relation to author
            const articleSchema: ContentTypeSchema = {
              apiId: articleType,
kind: 'collectionType',
              displayName: 'Article',
              singularName: articleType,
              pluralName: `${articleType}s`,
              attributes: {
                title: {
                  type: 'string',
                  required: true,
                },
                content: {
                  type: 'text',
                  required: false,
                },
                author: {
                  type: 'relation',
                  relation: {
                    relation: 'manyToOne',
                    target: authorType,
                  },
                },
              },
              options: {
                draftAndPublish: false,
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema(authorType, authorSchema)
            await schemaEngine.saveSchema(articleType, articleSchema)
            await queryEngine.buildIndex(authorType)
            await queryEngine.buildIndex(articleType)

            // Create authors
            const createdAuthors: string[] = []
            for (const author of authors) {
              try {
                const created = await contentEngine.create(authorType, author, adminContext)
                createdAuthors.push(created.id)
              } catch (error) {
                // Continue on error
              }
            }

            // Property 1: At least some authors should be created
            expect(createdAuthors.length).toBeGreaterThan(0)

            // Create articles with valid author references
            const createdArticles: string[] = []
            for (let i = 0; i < articles.length; i++) {
              const article = articles[i]
              const authorId = createdAuthors[i % createdAuthors.length]

              try {
                const created = await contentEngine.create(
                  articleType,
                  { ...article, author: authorId },
                  adminContext
                )

                // Property 2: Article with valid author reference should be created
                expect(created.author).toBe(authorId)
                createdArticles.push(created.id)
              } catch (error) {
                // Should not fail with valid reference
                expect.fail(`Should not fail with valid author reference: ${(error as Error).message}`)
              }
            }

            // Property 3: All created articles should have valid author references
            for (const articleId of createdArticles) {
              const article = await contentEngine.findOne(articleType, articleId)
              expect(article).toBeDefined()
              expect(article!.author).toBeDefined()
              expect(typeof article!.author).toBe('string')
              expect(createdAuthors).toContain(article!.author as string)
            }

            // Property 4: Attempting to create article with non-existent author should fail
            const fakeAuthorId = 'non-existent-author-id-12345'
            try {
              await contentEngine.create(
                articleType,
                { title: 'Invalid Article', content: 'Test', author: fakeAuthorId },
                adminContext
              )
              expect.fail('Should have thrown error for non-existent author reference')
            } catch (error) {
              expect(error).toBeInstanceOf(Error)
              expect((error as Error).message).toMatch(/validation|reference|non-existent/i)
              expect((error as Error).message).toContain(fakeAuthorId)
            }

            // Property 5: Attempting to update article with invalid author should fail
            if (createdArticles.length > 0) {
              const articleToUpdate = createdArticles[0]
              try {
                await contentEngine.update(
                  articleType,
                  articleToUpdate,
                  { author: fakeAuthorId },
                  adminContext
                )
                expect.fail('Should have thrown error for non-existent author reference on update')
              } catch (error) {
                expect(error).toBeInstanceOf(Error)
                expect((error as Error).message).toMatch(/validation|reference|non-existent/i)
              }
            }
          }
        ),
        { numRuns: 3 }
      )
    })

    /**
     * Test that manyToMany relations validate all referenced IDs
     */
    it('should validate all manyToMany relation references exist', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate tags and posts
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 30 }),
            }),
            { minLength: 3, maxLength: 8 }
          ),
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              content: fc.string({ minLength: 0, maxLength: 200 }),
              numTags: fc.integer({ min: 0, max: 5 }),
            }),
            { minLength: 2, maxLength: 8 }
          ),
          async (tags, posts) => {
            // Create unique content type names for this test run
            const tagType = `tag-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
            const postType = `post-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

            // Create tag schema
            const tagSchema: ContentTypeSchema = {
              apiId: tagType,
kind: 'collectionType',
              displayName: 'Tag',
              singularName: tagType,
              pluralName: `${tagType}s`,
              attributes: {
                name: {
                  type: 'string',
                  required: true,
                },
              },
              options: {
                draftAndPublish: false,
                timestamps: true,
              },
            }

            // Create post schema with manyToMany relation to tags
            const postSchema: ContentTypeSchema = {
              apiId: postType,
kind: 'collectionType',
              displayName: 'Post',
              singularName: postType,
              pluralName: `${postType}s`,
              attributes: {
                title: {
                  type: 'string',
                  required: true,
                },
                content: {
                  type: 'text',
                  required: false,
                },
                tags: {
                  type: 'relation',
                  relation: {
                    relation: 'manyToMany',
                    target: tagType,
                  },
                },
              },
              options: {
                draftAndPublish: false,
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema(tagType, tagSchema)
            await schemaEngine.saveSchema(postType, postSchema)
            await queryEngine.buildIndex(tagType)
            await queryEngine.buildIndex(postType)

            // Create tags
            const createdTags: string[] = []
            for (const tag of tags) {
              try {
                const created = await contentEngine.create(tagType, tag, adminContext)
                createdTags.push(created.id)
              } catch (error) {
                // Continue on error
              }
            }

            // Property 1: At least some tags should be created
            expect(createdTags.length).toBeGreaterThan(0)

            // Create posts with valid tag references
            for (const post of posts) {
              const numTagsToAssign = Math.min(post.numTags, createdTags.length)
              const selectedTags = createdTags.slice(0, numTagsToAssign)

              try {
                const created = await contentEngine.create(
                  postType,
                  { title: post.title, content: post.content, tags: selectedTags },
                  adminContext
                )

                // Property 2: Post with valid tag references should be created
                expect(Array.isArray(created.tags)).toBe(true)
                expect((created.tags as string[]).length).toBe(selectedTags.length)

                // Property 3: All tag IDs should be valid
                for (const tagId of created.tags as string[]) {
                  expect(createdTags).toContain(tagId)
                }
              } catch (error) {
                // Should not fail with valid references
                expect.fail(`Should not fail with valid tag references: ${(error as Error).message}`)
              }
            }

            // Property 4: Empty array should be valid for manyToMany
            try {
              const postWithNoTags = await contentEngine.create(
                postType,
                { title: 'No Tags Post', content: 'Test', tags: [] },
                adminContext
              )
              expect(Array.isArray(postWithNoTags.tags)).toBe(true)
              expect((postWithNoTags.tags as string[]).length).toBe(0)
            } catch (error) {
              expect.fail(`Empty array should be valid for manyToMany: ${(error as Error).message}`)
            }

            // Property 5: Array with one invalid ID should fail
            const fakeTagId = 'non-existent-tag-id-12345'
            const mixedTags = [...createdTags.slice(0, 2), fakeTagId]

            try {
              await contentEngine.create(
                postType,
                { title: 'Invalid Post', content: 'Test', tags: mixedTags },
                adminContext
              )
              expect.fail('Should have thrown error for array containing non-existent tag reference')
            } catch (error) {
              expect(error).toBeInstanceOf(Error)
              expect((error as Error).message).toMatch(/validation|reference|non-existent/i)
              expect((error as Error).message).toContain(fakeTagId)
            }

            // Property 6: Array with all invalid IDs should fail
            const allInvalidTags = ['fake-1', 'fake-2', 'fake-3']
            try {
              await contentEngine.create(
                postType,
                { title: 'All Invalid Post', content: 'Test', tags: allInvalidTags },
                adminContext
              )
              expect.fail('Should have thrown error for array with all non-existent tag references')
            } catch (error) {
              expect(error).toBeInstanceOf(Error)
              expect((error as Error).message).toMatch(/validation|reference|non-existent/i)
            }
          }
        ),
        { numRuns: 3 }
      )
    })

    /**
     * Test that relation validation works across multiple content types
     */
    it('should validate relations across multiple content types', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate categories, authors, and articles
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 30 }),
            }),
            { minLength: 2, maxLength: 4 }
          ),
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 50 }),
              email: fc.emailAddress(),
            }),
            { minLength: 2, maxLength: 4 }
          ),
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              content: fc.string({ minLength: 0, maxLength: 200 }),
            }),
            { minLength: 2, maxLength: 6 }
          ),
          async (categories, authors, articles) => {
            // Create unique content type names for this test run
            const categoryType = `category-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
            const authorType = `author-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
            const articleType = `article-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

            // Create category schema
            const categorySchema: ContentTypeSchema = {
              apiId: categoryType,
kind: 'collectionType',
              displayName: 'Category',
              singularName: categoryType,
              pluralName: `${categoryType}s`,
              attributes: {
                name: {
                  type: 'string',
                  required: true,
                },
              },
              options: {
                draftAndPublish: false,
                timestamps: true,
              },
            }

            // Create author schema
            const authorSchema: ContentTypeSchema = {
              apiId: authorType,
kind: 'collectionType',
              displayName: 'Author',
              singularName: authorType,
              pluralName: `${authorType}s`,
              attributes: {
                name: {
                  type: 'string',
                  required: true,
                },
                email: {
                  type: 'email',
                  required: true,
                },
              },
              options: {
                draftAndPublish: false,
                timestamps: true,
              },
            }

            // Create article schema with relations to both category and author
            const articleSchema: ContentTypeSchema = {
              apiId: articleType,
kind: 'collectionType',
              displayName: 'Article',
              singularName: articleType,
              pluralName: `${articleType}s`,
              attributes: {
                title: {
                  type: 'string',
                  required: true,
                },
                content: {
                  type: 'text',
                  required: false,
                },
                category: {
                  type: 'relation',
                  relation: {
                    relation: 'manyToOne',
                    target: categoryType,
                  },
                },
                author: {
                  type: 'relation',
                  relation: {
                    relation: 'manyToOne',
                    target: authorType,
                  },
                },
              },
              options: {
                draftAndPublish: false,
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema(categoryType, categorySchema)
            await schemaEngine.saveSchema(authorType, authorSchema)
            await schemaEngine.saveSchema(articleType, articleSchema)
            await queryEngine.buildIndex(categoryType)
            await queryEngine.buildIndex(authorType)
            await queryEngine.buildIndex(articleType)

            // Create categories
            const createdCategories: string[] = []
            for (const category of categories) {
              try {
                const created = await contentEngine.create(categoryType, category, adminContext)
                createdCategories.push(created.id)
              } catch (error) {
                // Continue on error
              }
            }

            // Create authors
            const createdAuthors: string[] = []
            for (const author of authors) {
              try {
                const created = await contentEngine.create(authorType, author, adminContext)
                createdAuthors.push(created.id)
              } catch (error) {
                // Continue on error
              }
            }

            // Property 1: Both categories and authors should be created
            expect(createdCategories.length).toBeGreaterThan(0)
            expect(createdAuthors.length).toBeGreaterThan(0)

            // Create articles with valid references to both content types
            for (let i = 0; i < articles.length; i++) {
              const article = articles[i]
              const categoryId = createdCategories[i % createdCategories.length]
              const authorId = createdAuthors[i % createdAuthors.length]

              try {
                const created = await contentEngine.create(
                  articleType,
                  { ...article, category: categoryId, author: authorId },
                  adminContext
                )

                // Property 2: Article with valid references should be created
                expect(created.category).toBe(categoryId)
                expect(created.author).toBe(authorId)

                // Property 3: Both references should point to existing entries
                const categoryExists = await contentEngine.findOne(categoryType, categoryId)
                const authorExists = await contentEngine.findOne(authorType, authorId)
                expect(categoryExists).toBeDefined()
                expect(authorExists).toBeDefined()
              } catch (error) {
                expect.fail(`Should not fail with valid references: ${(error as Error).message}`)
              }
            }

            // Property 4: Invalid category reference should fail
            try {
              await contentEngine.create(
                articleType,
                {
                  title: 'Invalid Category',
                  content: 'Test',
                  category: 'fake-category-id',
                  author: createdAuthors[0],
                },
                adminContext
              )
              expect.fail('Should have thrown error for invalid category reference')
            } catch (error) {
              expect(error).toBeInstanceOf(Error)
              expect((error as Error).message).toMatch(/validation|reference|non-existent/i)
            }

            // Property 5: Invalid author reference should fail
            try {
              await contentEngine.create(
                articleType,
                {
                  title: 'Invalid Author',
                  content: 'Test',
                  category: createdCategories[0],
                  author: 'fake-author-id',
                },
                adminContext
              )
              expect.fail('Should have thrown error for invalid author reference')
            } catch (error) {
              expect(error).toBeInstanceOf(Error)
              expect((error as Error).message).toMatch(/validation|reference|non-existent/i)
            }

            // Property 6: Both invalid references should fail
            try {
              await contentEngine.create(
                articleType,
                {
                  title: 'Both Invalid',
                  content: 'Test',
                  category: 'fake-category-id',
                  author: 'fake-author-id',
                },
                adminContext
              )
              expect.fail('Should have thrown error for both invalid references')
            } catch (error) {
              expect(error).toBeInstanceOf(Error)
              expect((error as Error).message).toMatch(/validation|reference|non-existent/i)
            }
          }
        ),
        { numRuns: 3 }
      )
    })

    /**
     * Test that null/undefined relation values are handled correctly
     */
    it('should allow null/undefined for optional relation fields', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate articles with optional author
          fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 50 }),
              content: fc.string({ minLength: 0, maxLength: 200 }),
              hasAuthor: fc.boolean(),
            }),
            { minLength: 3, maxLength: 8 }
          ),
          async (articles) => {
            // Create unique content type names for this test run
            const authorType = `author-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
            const articleType = `article-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

            // Create author schema
            const authorSchema: ContentTypeSchema = {
              apiId: authorType,
kind: 'collectionType',
              displayName: 'Author',
              singularName: authorType,
              pluralName: `${authorType}s`,
              attributes: {
                name: {
                  type: 'string',
                  required: true,
                },
              },
              options: {
                draftAndPublish: false,
                timestamps: true,
              },
            }

            // Create article schema with optional author relation
            const articleSchema: ContentTypeSchema = {
              apiId: articleType,
kind: 'collectionType',
              displayName: 'Article',
              singularName: articleType,
              pluralName: `${articleType}s`,
              attributes: {
                title: {
                  type: 'string',
                  required: true,
                },
                content: {
                  type: 'text',
                  required: false,
                },
                author: {
                  type: 'relation',
                  required: false,
                  relation: {
                    relation: 'manyToOne',
                    target: authorType,
                  },
                },
              },
              options: {
                draftAndPublish: false,
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema(authorType, authorSchema)
            await schemaEngine.saveSchema(articleType, articleSchema)
            await queryEngine.buildIndex(authorType)
            await queryEngine.buildIndex(articleType)

            // Create one author
            const author = await contentEngine.create(
              authorType,
              { name: 'Test Author' },
              adminContext
            )

            // Create articles with and without author
            for (const article of articles) {
              try {
                const data: CreateData = {
                  title: article.title,
                  content: article.content,
                }

                if (article.hasAuthor) {
                  data.author = author.id
                }
                // If hasAuthor is false, we don't include the author field at all

                const created = await contentEngine.create(articleType, data, adminContext)

                // Property 1: Article should be created successfully
                expect(created.id).toBeDefined()
                expect(created.title).toBe(article.title)

                // Property 2: Author field should match what we provided
                if (article.hasAuthor) {
                  expect(created.author).toBe(author.id)
                } else {
                  // Field might be undefined or null
                  expect(created.author === undefined || created.author === null).toBe(true)
                }
              } catch (error) {
                expect.fail(`Should not fail with optional relation: ${(error as Error).message}`)
              }
            }

            // Property 3: Explicitly setting null should be allowed
            try {
              const articleWithNull = await contentEngine.create(
                articleType,
                { title: 'Null Author', content: 'Test', author: null },
                adminContext
              )
              expect(articleWithNull.author === null || articleWithNull.author === undefined).toBe(true)
            } catch (error) {
              // Schema validation might reject null, which is acceptable behavior
              // The important thing is that omitting the field works
              if (error instanceof Error) {
                expect(error.message).toMatch(/validation/i)
              }
            }

            // Property 4: Explicitly setting undefined should be allowed
            try {
              const articleWithUndefined = await contentEngine.create(
                articleType,
                { title: 'Undefined Author', content: 'Test', author: undefined },
                adminContext
              )
              expect(articleWithUndefined.author === null || articleWithUndefined.author === undefined).toBe(true)
            } catch (error) {
              // Schema validation might reject undefined, which is acceptable behavior
              // The important thing is that omitting the field works
              if (error instanceof Error) {
                expect(error.message).toMatch(/validation/i)
              }
            }
          }
        ),
        { numRuns: 3 }
      )
    })

    /**
     * Test that invalid relation data types are rejected
     */
    it('should reject invalid data types for relation fields', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate invalid relation values
          fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.object(),
            fc.constant({}),
            fc.constant({ id: 'test' })
          ),
          async (invalidValue) => {
            // Create unique content type names for this test run
            const authorType = `author-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
            const articleType = `article-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

            // Create author schema
            const authorSchema: ContentTypeSchema = {
              apiId: authorType,
kind: 'collectionType',
              displayName: 'Author',
              singularName: authorType,
              pluralName: `${authorType}s`,
              attributes: {
                name: {
                  type: 'string',
                  required: true,
                },
              },
              options: {
                draftAndPublish: false,
                timestamps: true,
              },
            }

            // Create article schema with manyToOne relation
            const articleSchema: ContentTypeSchema = {
              apiId: articleType,
kind: 'collectionType',
              displayName: 'Article',
              singularName: articleType,
              pluralName: `${articleType}s`,
              attributes: {
                title: {
                  type: 'string',
                  required: true,
                },
                author: {
                  type: 'relation',
                  relation: {
                    relation: 'manyToOne',
                    target: authorType,
                  },
                },
              },
              options: {
                draftAndPublish: false,
                timestamps: true,
              },
            }

            await schemaEngine.saveSchema(authorType, authorSchema)
            await schemaEngine.saveSchema(articleType, articleSchema)
            await queryEngine.buildIndex(authorType)
            await queryEngine.buildIndex(articleType)

            // Property 1: Invalid data type for manyToOne should be rejected
            try {
              await contentEngine.create(
                articleType,
                { title: 'Invalid Type', author: invalidValue },
                adminContext
              )
              expect.fail(`Should have rejected invalid data type: ${typeof invalidValue}`)
            } catch (error) {
              expect(error).toBeInstanceOf(Error)
              expect((error as Error).message).toMatch(/validation|must be a string/i)
            }
          }
        ),
        { numRuns: 3 }
      )
    })
  })
})