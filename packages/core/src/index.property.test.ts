/**
 * Property-based tests for CMS boot determinism
 * 
 * These tests validate that the CMS boot process produces deterministic
 * in-memory indexes that exactly reflect the file system state.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import * as fc from 'fast-check'
import { CMS } from './index.js'
import type { ContentEntry, ContentTypeSchema } from './types/index.js'

describe('CMS - Property-Based Tests', () => {
  let testDir: string

  beforeEach(async () => {
    // Create a unique test directory for each test
    testDir = join(
      process.cwd(),
      'test-data',
      `cms-pbt-${Date.now()}-${Math.random().toString(36).substring(2)}`
    )
    await fs.mkdir(testDir, { recursive: true })
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
   * Property P15: Boot Determinism
   * 
   * **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
   * 
   * For any file system state, booting the system produces a deterministic in-memory index
   * that exactly reflects that file system state.
   * 
   * This property ensures that:
   * 1. Given the same file system state, multiple boots produce identical indexes
   * 2. The in-memory index accurately reflects all content files
   * 3. Boot process is deterministic (same input → same output)
   */
  describe('P15: Boot Determinism', () => {
    /**
     * Test that booting the CMS multiple times with the same file system state
     * produces identical in-memory indexes.
     */
    it('should produce identical indexes when booting from the same file system state', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate content type schemas
          fc.array(
            fc.record({
              apiId: fc.string({ minLength: 3, maxLength: 20 })
kind: 'collectionType',
                .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
              displayName: fc.string({ minLength: 3, maxLength: 50 }),
              singularName: fc.string({ minLength: 3, maxLength: 30 }),
              pluralName: fc.string({ minLength: 3, maxLength: 30 }),
            }).filter(schema => schema.singularName !== schema.pluralName), // Ensure different
            { minLength: 1, maxLength: 3 }
          ).map(schemas => {
            // Ensure unique apiIds
            const uniqueSchemas = new Map<string, typeof schemas[0]>()
            for (const schema of schemas) {
              uniqueSchemas.set(schema.apiId, schema)
            }
            return Array.from(uniqueSchemas.values())
          }),
          // Generate content entries for each content type
          fc.array(
            fc.record({
              id: fc.uuid(),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              content: fc.string({ minLength: 0, maxLength: 200 }),
              count: fc.integer({ min: 0, max: 100 }),
              active: fc.boolean(),
              createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                .map(d => d.toISOString()),
              updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                .map(d => d.toISOString()),
              publishedAt: fc.option(
                fc.date({ min: new Date('2020-01-01'), max: new Date() })
                  .map(d => d.toISOString()),
                { nil: null }
              ),
            }),
            { minLength: 0, maxLength: 10 }
          ),
          async (schemas, entries) => {
            // Skip if no schemas
            if (schemas.length === 0) {
              return true
            }

            // Step 1: Set up file system state
            await setupFileSystemState(testDir, schemas, entries)

            // Step 2: Boot CMS first time
            const cms1 = new CMS(testDir)
            await cms1.initialize()

            // Step 3: Capture first boot index state
            const index1 = captureIndexState(cms1)

            // Step 4: Boot CMS second time (fresh instance)
            const cms2 = new CMS(testDir)
            await cms2.initialize()

            // Step 5: Capture second boot index state
            const index2 = captureIndexState(cms2)

            // Step 6: Verify indexes are identical
            expect(index1).toEqual(index2)

            // Step 7: Verify index matches file system
            await verifyIndexMatchesFileSystem(testDir, cms1, schemas, entries)

            return true
          }
        ),
        {
          numRuns: 10, // Run 10 random test cases
          timeout: 60000, // 60 second timeout per test
        }
      )
    }, 70000) // 70 second test timeout

    /**
     * Test that the index accurately reflects all content files on disk
     */
    it('should build index that exactly matches file system content', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a single content type
          fc.record({
            apiId: fc.constantFrom('articles', 'posts', 'pages', 'products'),
kind: 'collectionType',
            displayName: fc.string({ minLength: 3, maxLength: 50 }),
            singularName: fc.constantFrom('article', 'post', 'page', 'product'),
            pluralName: fc.constantFrom('articles', 'posts', 'pages', 'products'),
          }),
          // Generate content entries
          fc.array(
            fc.record({
              id: fc.uuid(),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              slug: fc.string({ minLength: 3, maxLength: 50 })
                .filter(s => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)),
              createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                .map(d => d.toISOString()),
              updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                .map(d => d.toISOString()),
            }),
            { minLength: 1, maxLength: 15 }
          ).map(entries => {
            // Ensure unique IDs
            const uniqueEntries = new Map<string, typeof entries[0]>()
            for (const entry of entries) {
              uniqueEntries.set(entry.id, entry)
            }
            return Array.from(uniqueEntries.values())
          }),
          async (schema, entries) => {
            // Create a fresh test directory for this run
            const runTestDir = join(
              process.cwd(),
              'test-data',
              `cms-pbt-${Date.now()}-${Math.random().toString(36).substring(2)}`
            )
            await fs.mkdir(runTestDir, { recursive: true })

            try {
              // Step 1: Set up file system with schema and entries
              await setupFileSystemState(runTestDir, [schema], entries)

              // Step 2: Boot CMS
              const cms = new CMS(runTestDir)
              await cms.initialize()

              // Step 3: Get index from query engine
              const queryEngine = cms.getQueryEngine()
              const index = queryEngine.getIndex(schema.apiId)

              // Step 4: Verify index has exactly the same entries as file system
              expect(index.entries.size).toBe(entries.length)

              // Step 5: Verify each entry in index matches file system
              for (const entry of entries) {
                const indexEntry = index.entries.get(entry.id)
                expect(indexEntry).toBeDefined()
                expect(indexEntry?.id).toBe(entry.id)
                expect(indexEntry?.title).toBe(entry.title)
                expect(indexEntry?.slug).toBe(entry.slug)
                expect(indexEntry?.createdAt).toBe(entry.createdAt)
                expect(indexEntry?.updatedAt).toBe(entry.updatedAt)
              }

              // Step 6: Verify no extra entries in index
              for (const [id, indexEntry] of index.entries) {
                const fileEntry = entries.find(e => e.id === id)
                expect(fileEntry).toBeDefined()
              }
            } finally {
              // Clean up
              try {
                await fs.rm(runTestDir, { recursive: true, force: true })
              } catch {
                // Ignore cleanup errors
              }
            }

            return true
          }
        ),
        {
          numRuns: 10,
          timeout: 60000,
        }
      )
    }, 70000) // 70 second test timeout

    /**
     * Test that boot process is deterministic even with empty file system
     */
    it('should handle empty file system deterministically', async () => {
      // Create minimal RBAC config
      const cmsDir = join(testDir, '.cms')
      await fs.mkdir(cmsDir, { recursive: true })
      
      const defaultRBACConfig = {
        roles: {
          admin: {
            id: 'admin',
            name: 'Administrator',
            description: 'Full access',
            type: 'admin' as const,
            permissions: [{ action: '*' as const, subject: 'all' }],
          },
        },
        defaultRole: 'admin',
      }
      
      await fs.writeFile(
        join(cmsDir, 'rbac.json'),
        JSON.stringify(defaultRBACConfig, null, 2)
      )

      // Boot CMS twice
      const cms1 = new CMS(testDir)
      await cms1.initialize()
      const index1 = captureIndexState(cms1)

      const cms2 = new CMS(testDir)
      await cms2.initialize()
      const index2 = captureIndexState(cms2)

      // Indexes should be identical (both empty or with same content)
      expect(index1).toEqual(index2)
    })
  })
})

/**
 * Helper function to set up file system state with schemas and content
 */
async function setupFileSystemState(
  basePath: string,
  schemas: Array<{
    apiId: string
kind: 'collectionType',
    displayName: string
    singularName: string
    pluralName: string
  }>,
  entries: ContentEntry[]
): Promise<void> {
  // Create directory structure
  const schemaDir = join(basePath, 'schema')
  const contentDir = join(basePath, 'content', 'api')
  const cmsDir = join(basePath, '.cms')

  await fs.mkdir(schemaDir, { recursive: true })
  await fs.mkdir(contentDir, { recursive: true })
  await fs.mkdir(cmsDir, { recursive: true })

  // Write schemas
  for (const schema of schemas) {
    const fullSchema: ContentTypeSchema = {
      ...schema,
      attributes: {
        title: {
          type: 'string',
          required: true,
        },
        content: {
          type: 'text',
        },
        count: {
          type: 'number',
        },
        active: {
          type: 'boolean',
        },
        slug: {
          type: 'uid',
          targetField: 'title',
        },
      },
    }

    await fs.writeFile(
      join(schemaDir, `${schema.apiId}.schema.json`),
      JSON.stringify(fullSchema, null, 2)
    )
  }

  // Write content entries (distribute across content types)
  if (entries.length > 0 && schemas.length > 0) {
    for (let i = 0; i < entries.length; i++) {
      const schema = schemas[i % schemas.length]
      const typeDir = join(contentDir, schema.apiId)
      await fs.mkdir(typeDir, { recursive: true })

      const entry = entries[i]
      await fs.writeFile(
        join(typeDir, `${entry.id}.json`),
        JSON.stringify(entry, null, 2)
      )
    }
  }

  // Create default RBAC config
  const defaultRBACConfig = {
    roles: {
      admin: {
        id: 'admin',
        name: 'Administrator',
        description: 'Full access',
        type: 'admin' as const,
        permissions: [{ action: '*' as const, subject: 'all' }],
      },
    },
    defaultRole: 'admin',
  }

  await fs.writeFile(
    join(cmsDir, 'rbac.json'),
    JSON.stringify(defaultRBACConfig, null, 2)
  )
}

/**
 * Helper function to capture the current state of all indexes
 */
function captureIndexState(cms: CMS): Record<string, any> {
  const queryEngine = cms.getQueryEngine()
  const allIndexes = queryEngine.getAllIndexes()
  const state: Record<string, any> = {}

  for (const [contentType, index] of allIndexes) {
    state[contentType] = {
      entryCount: index.entries.size,
      entries: Array.from(index.entries.entries()).map(([id, entry]) => ({
        id,
        ...entry,
      })),
    }
  }

  return state
}

/**
 * Helper function to verify index matches file system
 */
async function verifyIndexMatchesFileSystem(
  basePath: string,
  cms: CMS,
  schemas: Array<{ apiId: string
kind: 'collectionType', }>,
  entries: ContentEntry[]
): Promise<void> {
  const queryEngine = cms.getQueryEngine()
  const contentDir = join(basePath, 'content', 'api')

  for (const schema of schemas) {
    const index = queryEngine.getIndex(schema.apiId)
    
    // Skip if index doesn't exist (no entries for this type)
    if (!index) {
      continue
    }
    
    const typeDir = join(contentDir, schema.apiId)

    // Count files in directory
    let fileCount = 0
    try {
      const files = await fs.readdir(typeDir)
      fileCount = files.filter(f => f.endsWith('.json')).length
    } catch {
      // Directory might not exist if no entries
      fileCount = 0
    }

    // Count entries for this content type
    const entriesForType = entries.filter((_, i) => schemas[i % schemas.length].apiId === schema.apiId)
    
    // Index should have same number of entries as files
    expect(index.entries.size).toBe(Math.min(fileCount, entriesForType.length))
  }
}
