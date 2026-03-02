import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import * as fc from 'fast-check'
import { QueryEngine } from './query-engine.js'
import { FileEngine } from './file-engine.js'
import type { ContentEntry } from '../types/index.js'

/**
 * Property-based tests for QueryEngine
 * 
 * These tests validate universal correctness properties using fast-check
 * to generate random test cases.
 */
describe('QueryEngine - Property-Based Tests', () => {
  let queryEngine: QueryEngine
  let fileEngine: FileEngine
  let testDir: string
  let contentDir: string

  beforeEach(async () => {
    // Create a unique test directory for each test
    testDir = join(
      process.cwd(),
      'test-data',
      `query-pbt-${Date.now()}-${Math.random().toString(36).substring(2)}`
    )
    contentDir = join(testDir, 'content', 'api')
    await fs.mkdir(contentDir, { recursive: true })
    
    fileEngine = new FileEngine(testDir)
    queryEngine = new QueryEngine(contentDir, fileEngine)
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
   * Property P3: Index Consistency
   * 
   * **Validates: Requirements 9.3, 10.7, 12.10**
   * 
   * For any content type, the in-memory index entries exactly match the file system entries,
   * and each index entry's data matches the content of its corresponding file.
   */
  describe('P3: Index Consistency', () => {
    /**
     * Test that after building an index, all file system entries are in the index
     * and all index entries match their corresponding files.
     */
    it('should maintain exact consistency between index and file system after buildIndex', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a content type name
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          // Generate an array of content entries
          fc.array(
            fc.record({
              id: fc.uuid(),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              content: fc.string({ minLength: 0, maxLength: 500 }),
              count: fc.integer({ min: 0, max: 1000 }),
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
            { minLength: 0, maxLength: 50 }
          ),
          async (contentType, entries) => {
            // Step 1: Clean up any existing directory for this content type
            const typeDir = join(contentDir, contentType)
            try {
              await fs.rm(typeDir, { recursive: true, force: true })
            } catch {
              // Ignore if doesn't exist
            }
            await fs.mkdir(typeDir, { recursive: true })

            for (const entry of entries) {
              const filePath = join(typeDir, `${entry.id}.json`)
              await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf8')
            }

            // Step 2: Build index
            await queryEngine.buildIndex(contentType)

            // Step 3: Get the index
            const index = queryEngine.getIndex(contentType)
            expect(index).toBeDefined()

            // Property 1: Index must contain exactly the same number of entries as files
            expect(index!.entries.size).toBe(entries.length)

            // Property 2: Every file system entry must be in the index
            for (const entry of entries) {
              const indexEntry = index!.entries.get(entry.id)
              expect(indexEntry).toBeDefined()
              expect(indexEntry!.id).toBe(entry.id)
            }

            // Property 3: Every index entry must match its corresponding file
            for (const [id, indexEntry] of index!.entries) {
              const filePath = join(typeDir, `${id}.json`)
              const fileContent = await fs.readFile(filePath, 'utf8')
              const fileEntry = JSON.parse(fileContent) as ContentEntry

              // All fields must match
              expect(indexEntry.id).toBe(fileEntry.id)
              expect(indexEntry.title).toBe(fileEntry.title)
              expect(indexEntry.content).toBe(fileEntry.content)
              expect(indexEntry.count).toBe(fileEntry.count)
              expect(indexEntry.active).toBe(fileEntry.active)
              expect(indexEntry.createdAt).toBe(fileEntry.createdAt)
              expect(indexEntry.updatedAt).toBe(fileEntry.updatedAt)
              expect(indexEntry.publishedAt).toBe(fileEntry.publishedAt)
            }

            // Property 4: No extra entries in index that don't exist in file system
            const fileIds = new Set(entries.map(e => e.id))
            for (const id of index!.entries.keys()) {
              expect(fileIds.has(id)).toBe(true)
            }
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test that after updating the index, it remains consistent with file system
     */
    it('should maintain consistency after updateIndex operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          fc.array(
            fc.record({
              id: fc.uuid(),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                .map(d => d.toISOString()),
              updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                .map(d => d.toISOString()),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          async (contentType, initialEntries) => {
            // Step 1: Write initial entries to file system
            const typeDir = join(contentDir, contentType)
            await fs.mkdir(typeDir, { recursive: true })

            for (const entry of initialEntries) {
              const filePath = join(typeDir, `${entry.id}.json`)
              await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf8')
            }

            // Step 2: Build initial index
            await queryEngine.buildIndex(contentType)

            // Step 3: Update some entries
            const entriesToUpdate = initialEntries.slice(0, Math.min(5, initialEntries.length))
            
            for (const entry of entriesToUpdate) {
              const updatedEntry: ContentEntry = {
                ...entry,
                title: `Updated: ${entry.title}`,
                updatedAt: new Date().toISOString(),
              }

              // Write to file system
              const filePath = join(typeDir, `${entry.id}.json`)
              await fs.writeFile(filePath, JSON.stringify(updatedEntry, null, 2), 'utf8')

              // Update index
              queryEngine.updateIndex(contentType, entry.id, updatedEntry)
            }

            // Step 4: Verify consistency
            const index = queryEngine.getIndex(contentType)
            expect(index).toBeDefined()

            // Property 1: Index size should still match file count
            const files = await fs.readdir(typeDir)
            const jsonFiles = files.filter(f => f.endsWith('.json'))
            expect(index!.entries.size).toBe(jsonFiles.length)

            // Property 2: Every index entry must match its file
            for (const [id, indexEntry] of index!.entries) {
              const filePath = join(typeDir, `${id}.json`)
              const fileContent = await fs.readFile(filePath, 'utf8')
              const fileEntry = JSON.parse(fileContent) as ContentEntry

              expect(indexEntry.id).toBe(fileEntry.id)
              expect(indexEntry.title).toBe(fileEntry.title)
              expect(indexEntry.updatedAt).toBe(fileEntry.updatedAt)
            }

            // Property 3: Updated entries should have new values
            for (const entry of entriesToUpdate) {
              const indexEntry = index!.entries.get(entry.id)
              expect(indexEntry).toBeDefined()
              expect(indexEntry!.title).toContain('Updated:')
            }
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test that after removing entries from index, it remains consistent
     */
    it('should maintain consistency after removeFromIndex operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          fc.array(
            fc.record({
              id: fc.uuid(),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                .map(d => d.toISOString()),
              updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                .map(d => d.toISOString()),
            }),
            { minLength: 3, maxLength: 20 }
          ),
          async (contentType, entries) => {
            // Step 1: Write entries to file system
            const typeDir = join(contentDir, contentType)
            await fs.mkdir(typeDir, { recursive: true })

            for (const entry of entries) {
              const filePath = join(typeDir, `${entry.id}.json`)
              await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf8')
            }

            // Step 2: Build index
            await queryEngine.buildIndex(contentType)

            // Step 3: Remove some entries
            const entriesToRemove = entries.slice(0, Math.min(2, entries.length))
            
            for (const entry of entriesToRemove) {
              // Remove from file system
              const filePath = join(typeDir, `${entry.id}.json`)
              await fs.unlink(filePath)

              // Remove from index
              queryEngine.removeFromIndex(contentType, entry.id)
            }

            // Step 4: Verify consistency
            const index = queryEngine.getIndex(contentType)
            expect(index).toBeDefined()

            // Property 1: Index size should match remaining file count
            const files = await fs.readdir(typeDir)
            const jsonFiles = files.filter(f => f.endsWith('.json'))
            expect(index!.entries.size).toBe(jsonFiles.length)

            // Property 2: Removed entries should not be in index
            for (const entry of entriesToRemove) {
              expect(index!.entries.has(entry.id)).toBe(false)
            }

            // Property 3: Remaining entries should still be in index and match files
            const remainingEntries = entries.filter(
              e => !entriesToRemove.some(r => r.id === e.id)
            )

            for (const entry of remainingEntries) {
              const indexEntry = index!.entries.get(entry.id)
              expect(indexEntry).toBeDefined()

              const filePath = join(typeDir, `${entry.id}.json`)
              const fileContent = await fs.readFile(filePath, 'utf8')
              const fileEntry = JSON.parse(fileContent) as ContentEntry

              expect(indexEntry!.id).toBe(fileEntry.id)
              expect(indexEntry!.title).toBe(fileEntry.title)
            }
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test that rebuildAllIndexes maintains consistency across multiple content types
     */
    it('should maintain consistency across all content types after rebuildAllIndexes', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate multiple content types with entries
          fc.array(
            fc.record({
              contentType: fc.string({ minLength: 1, maxLength: 20 })
                .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
              entries: fc.array(
                fc.record({
                  id: fc.uuid(),
                  title: fc.string({ minLength: 1, maxLength: 100 }),
                  createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                    .map(d => d.toISOString()),
                  updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                    .map(d => d.toISOString()),
                }),
                { minLength: 0, maxLength: 20 }
              ),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (contentTypes) => {
            // Ensure unique content type names
            const uniqueTypes = new Map<string, typeof contentTypes[0]>()
            for (const ct of contentTypes) {
              if (!uniqueTypes.has(ct.contentType)) {
                uniqueTypes.set(ct.contentType, ct)
              }
            }

            // Step 1: Clean up content directory and recreate
            try {
              await fs.rm(contentDir, { recursive: true, force: true })
            } catch {
              // Ignore if doesn't exist
            }
            await fs.mkdir(contentDir, { recursive: true })

            // Step 2: Write all entries to file system
            for (const { contentType, entries } of uniqueTypes.values()) {
              const typeDir = join(contentDir, contentType)
              await fs.mkdir(typeDir, { recursive: true })

              for (const entry of entries) {
                const filePath = join(typeDir, `${entry.id}.json`)
                await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf8')
              }
            }

            // Step 3: Rebuild all indexes
            await queryEngine.rebuildAllIndexes()

            // Step 4: Verify consistency for each content type
            for (const { contentType, entries } of uniqueTypes.values()) {
              const index = queryEngine.getIndex(contentType)
              expect(index).toBeDefined()

              // Property 1: Index size matches file count
              expect(index!.entries.size).toBe(entries.length)

              // Property 2: All entries are in index
              for (const entry of entries) {
                const indexEntry = index!.entries.get(entry.id)
                expect(indexEntry).toBeDefined()
                expect(indexEntry!.id).toBe(entry.id)
              }

              // Property 3: All index entries match files
              const typeDir = join(contentDir, contentType)
              for (const [id, indexEntry] of index!.entries) {
                const filePath = join(typeDir, `${id}.json`)
                const fileContent = await fs.readFile(filePath, 'utf8')
                const fileEntry = JSON.parse(fileContent) as ContentEntry

                expect(indexEntry.id).toBe(fileEntry.id)
                expect(indexEntry.title).toBe(fileEntry.title)
                expect(indexEntry.createdAt).toBe(fileEntry.createdAt)
                expect(indexEntry.updatedAt).toBe(fileEntry.updatedAt)
              }
            }
          }
        ),
        { numRuns: 3 }
      )
    })

    /**
     * Test that field indexes remain consistent with main index
     */
    it('should maintain field index consistency with main index', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          fc.array(
            fc.record({
              id: fc.uuid(),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              slug: fc.string({ minLength: 1, maxLength: 50 })
                .map(s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
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
            { minLength: 1, maxLength: 30 }
          ),
          async (contentType, entries) => {
            // Step 1: Write entries to file system
            const typeDir = join(contentDir, contentType)
            await fs.mkdir(typeDir, { recursive: true })

            for (const entry of entries) {
              const filePath = join(typeDir, `${entry.id}.json`)
              await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf8')
            }

            // Step 2: Build index
            await queryEngine.buildIndex(contentType)

            // Step 3: Get the index
            const index = queryEngine.getIndex(contentType)
            expect(index).toBeDefined()

            // Property 1: Field indexes should reference only entries in main index
            for (const [fieldName, fieldIndex] of index!.fieldIndexes) {
              for (const [value, idSet] of fieldIndex) {
                for (const id of idSet) {
                  expect(index!.entries.has(id)).toBe(true)
                }
              }
            }

            // Property 2: Every indexed field value should match the entry's actual value
            for (const [fieldName, fieldIndex] of index!.fieldIndexes) {
              for (const [value, idSet] of fieldIndex) {
                for (const id of idSet) {
                  const entry = index!.entries.get(id)!
                  expect(entry[fieldName]).toBe(value)
                }
              }
            }

            // Property 3: Every entry with an indexed field should be in the field index
            const indexedFields = ['slug', 'publishedAt', 'createdAt', 'status']
            for (const entry of index!.entries.values()) {
              for (const fieldName of indexedFields) {
                if (fieldName in entry) {
                  const fieldIndex = index!.fieldIndexes.get(fieldName)
                  expect(fieldIndex).toBeDefined()

                  const value = entry[fieldName]
                  const idSet = fieldIndex!.get(value)
                  expect(idSet).toBeDefined()
                  expect(idSet!.has(entry.id)).toBe(true)
                }
              }
            }
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test that index remains consistent after a sequence of mixed operations
     */
    it('should maintain consistency through mixed create/update/delete operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          fc.array(
            fc.record({
              id: fc.uuid(),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                .map(d => d.toISOString()),
              updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                .map(d => d.toISOString()),
            }),
            { minLength: 5, maxLength: 20 }
          ),
          async (contentType, initialEntries) => {
            const typeDir = join(contentDir, contentType)
            await fs.mkdir(typeDir, { recursive: true })

            // Step 1: Create initial entries
            for (const entry of initialEntries) {
              const filePath = join(typeDir, `${entry.id}.json`)
              await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf8')
            }

            await queryEngine.buildIndex(contentType)

            // Step 2: Perform mixed operations
            const operations = [
              // Update first entry
              async () => {
                const entry = initialEntries[0]
                const updated: ContentEntry = {
                  ...entry,
                  title: 'Updated Title',
                  updatedAt: new Date().toISOString(),
                }
                const filePath = join(typeDir, `${entry.id}.json`)
                await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf8')
                queryEngine.updateIndex(contentType, entry.id, updated)
              },
              // Delete second entry
              async () => {
                if (initialEntries.length > 1) {
                  const entry = initialEntries[1]
                  const filePath = join(typeDir, `${entry.id}.json`)
                  await fs.unlink(filePath)
                  queryEngine.removeFromIndex(contentType, entry.id)
                }
              },
              // Add new entry
              async () => {
                const newEntry: ContentEntry = {
                  id: `new-${Date.now()}`,
                  title: 'New Entry',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }
                const filePath = join(typeDir, `${newEntry.id}.json`)
                await fs.writeFile(filePath, JSON.stringify(newEntry, null, 2), 'utf8')
                queryEngine.updateIndex(contentType, newEntry.id, newEntry)
              },
            ]

            for (const operation of operations) {
              await operation()
            }

            // Step 3: Verify final consistency
            const index = queryEngine.getIndex(contentType)
            expect(index).toBeDefined()

            // Property 1: Index size matches file count
            const files = await fs.readdir(typeDir)
            const jsonFiles = files.filter(f => f.endsWith('.json'))
            expect(index!.entries.size).toBe(jsonFiles.length)

            // Property 2: Every file has a corresponding index entry
            for (const file of jsonFiles) {
              const filePath = join(typeDir, file)
              const fileContent = await fs.readFile(filePath, 'utf8')
              const fileEntry = JSON.parse(fileContent) as ContentEntry

              const indexEntry = index!.entries.get(fileEntry.id)
              expect(indexEntry).toBeDefined()
              expect(indexEntry!.id).toBe(fileEntry.id)
              expect(indexEntry!.title).toBe(fileEntry.title)
            }

            // Property 3: Every index entry has a corresponding file
            for (const [id, indexEntry] of index!.entries) {
              const filePath = join(typeDir, `${id}.json`)
              const fileExists = await fs.access(filePath).then(() => true).catch(() => false)
              expect(fileExists).toBe(true)

              if (fileExists) {
                const fileContent = await fs.readFile(filePath, 'utf8')
                const fileEntry = JSON.parse(fileContent) as ContentEntry
                expect(indexEntry.id).toBe(fileEntry.id)
                expect(indexEntry.title).toBe(fileEntry.title)
              }
            }
          }
        ),
        { numRuns: 3 }
      )
    })

    /**
     * Test that empty content types maintain consistency
     */
    it('should maintain consistency for empty content types', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          async (contentType) => {
            // Step 1: Create empty content type directory
            const typeDir = join(contentDir, contentType)
            await fs.mkdir(typeDir, { recursive: true })

            // Step 2: Build index
            await queryEngine.buildIndex(contentType)

            // Step 3: Verify consistency
            const index = queryEngine.getIndex(contentType)
            expect(index).toBeDefined()

            // Property 1: Empty index
            expect(index!.entries.size).toBe(0)

            // Property 2: No field indexes
            expect(index!.fieldIndexes.size).toBe(0)

            // Property 3: lastUpdated is set
            expect(index!.lastUpdated).toBeGreaterThan(0)
          }
        ),
        { numRuns: 3 }
      )
    })
  })
})
