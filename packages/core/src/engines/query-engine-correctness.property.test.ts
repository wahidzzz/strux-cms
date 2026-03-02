import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import * as fc from 'fast-check'
import { QueryEngine } from './query-engine.js'
import { FileEngine } from './file-engine.js'
import type { ContentEntry, FilterGroup, QueryParams } from '../types/index.js'

/**
 * Property-based tests for Query Correctness
 * 
 * These tests validate Property P5: Query Correctness
 * For any filter and set of entries, query results contain exactly the entries
 * that match the filter—no more, no less.
 */
describe('QueryEngine - Query Correctness Property Tests', () => {
  let queryEngine: QueryEngine
  let fileEngine: FileEngine
  let testDir: string
  let contentDir: string

  beforeEach(async () => {
    // Create a unique test directory for each test
    testDir = join(
      process.cwd(),
      'test-data',
      `query-correctness-${Date.now()}-${Math.random().toString(36).substring(2)}`
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
   * Helper to ensure unique IDs in generated entries
   */
  function ensureUniqueIds<T extends { id: string }>(entries: T[]): T[] {
    const seen = new Set<string>()
    return entries.map((e, i) => {
      let uniqueId = e.id
      while (seen.has(uniqueId)) {
        uniqueId = `${e.id}-${i}-${Math.random().toString(36).substring(2)}`
      }
      seen.add(uniqueId)
      return { ...e, id: uniqueId }
    })
  }

  /**
   * Property P5: Query Correctness
   * 
   * **Validates: Requirements 3.1, 3.7, 3.8**
   * 
   * For any filter and set of entries, query results contain exactly the entries
   * that match the filter—no more, no less.
   */
  describe('P5: Query Correctness', () => {
    /**
     * Test equality operator ($eq)
     */
    it('should return exactly entries matching $eq filter', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          fc.array(
            fc.record({
              id: fc.uuid(),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              status: fc.constantFrom('draft', 'published', 'archived'),
              count: fc.integer({ min: 0, max: 100 }),
              createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                .map(d => d.toISOString()),
              updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                .map(d => d.toISOString()),
            }),
            { minLength: 5, maxLength: 30 }
          ),
          fc.constantFrom('draft', 'published', 'archived'),
          async (contentType, rawEntries, targetStatus) => {
            // Ensure unique IDs
            const entries = ensureUniqueIds(rawEntries)

            // Clean up any existing directory for this content type
            const typeDir = join(contentDir, contentType)
            try {
              await fs.rm(typeDir, { recursive: true, force: true })
            } catch {
              // Ignore if doesn't exist
            }

            // Setup
            await fs.mkdir(typeDir, { recursive: true })

            for (const entry of entries) {
              const filePath = join(typeDir, `${entry.id}.json`)
              await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf8')
            }

            await queryEngine.buildIndex(contentType)

            // Query with $eq filter
            const filter: FilterGroup = { status: { $eq: targetStatus } }
            const results = queryEngine.query(contentType, { filters: filter })

            // Manually compute expected results
            const expected = entries.filter(e => e.status === targetStatus)

            // Property: Results contain exactly the matching entries
            expect(results.length).toBe(expected.length)

            // Every result should match the filter
            for (const result of results) {
              expect(result.status).toBe(targetStatus)
            }

            // Every expected entry should be in results
            for (const expectedEntry of expected) {
              const found = results.find(r => r.id === expectedEntry.id)
              expect(found).toBeDefined()
            }
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test comparison operators ($gt, $gte, $lt, $lte)
     */
    it('should return exactly entries matching comparison filters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          fc.array(
            fc.record({
              id: fc.uuid(),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              count: fc.integer({ min: 0, max: 100 }),
              createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                .map(d => d.toISOString()),
              updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                .map(d => d.toISOString()),
            }),
            { minLength: 10, maxLength: 30 }
          ),
          fc.integer({ min: 0, max: 100 }),
          async (contentType, rawEntries, threshold) => {
            const entries = ensureUniqueIds(rawEntries)

            // Clean up any existing directory for this content type
            const typeDir = join(contentDir, contentType)
            try {
              await fs.rm(typeDir, { recursive: true, force: true })
            } catch {
              // Ignore if doesn't exist
            }

            // Setup
            await fs.mkdir(typeDir, { recursive: true })

            for (const entry of entries) {
              const filePath = join(typeDir, `${entry.id}.json`)
              await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf8')
            }

            await queryEngine.buildIndex(contentType)

            // Test $gt
            const gtFilter: FilterGroup = { count: { $gt: threshold } }
            const gtResults = queryEngine.query(contentType, { filters: gtFilter })
            const gtExpected = entries.filter(e => e.count > threshold)

            expect(gtResults.length).toBe(gtExpected.length)
            for (const result of gtResults) {
              expect(result.count).toBeGreaterThan(threshold)
            }

            // Test $gte
            const gteFilter: FilterGroup = { count: { $gte: threshold } }
            const gteResults = queryEngine.query(contentType, { filters: gteFilter })
            const gteExpected = entries.filter(e => e.count >= threshold)

            expect(gteResults.length).toBe(gteExpected.length)
            for (const result of gteResults) {
              expect(result.count).toBeGreaterThanOrEqual(threshold)
            }

            // Test $lt
            const ltFilter: FilterGroup = { count: { $lt: threshold } }
            const ltResults = queryEngine.query(contentType, { filters: ltFilter })
            const ltExpected = entries.filter(e => e.count < threshold)

            expect(ltResults.length).toBe(ltExpected.length)
            for (const result of ltResults) {
              expect(result.count).toBeLessThan(threshold)
            }
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test logical operators ($and, $or, $not)
     */
    it('should return exactly entries matching logical operator filters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          fc.array(
            fc.record({
              id: fc.uuid(),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              status: fc.constantFrom('draft', 'published', 'archived'),
              count: fc.integer({ min: 0, max: 100 }),
              active: fc.boolean(),
              createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                .map(d => d.toISOString()),
              updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                .map(d => d.toISOString()),
            }),
            { minLength: 10, maxLength: 30 }
          ),
          async (contentType, rawEntries) => {
            const entries = ensureUniqueIds(rawEntries)

            // Clean up any existing directory for this content type
            const typeDir = join(contentDir, contentType)
            try {
              await fs.rm(typeDir, { recursive: true, force: true })
            } catch {
              // Ignore if doesn't exist
            }

            // Setup
            await fs.mkdir(typeDir, { recursive: true })

            for (const entry of entries) {
              const filePath = join(typeDir, `${entry.id}.json`)
              await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf8')
            }

            await queryEngine.buildIndex(contentType)

            // Test $and
            const andFilter: FilterGroup = {
              $and: [
                { status: { $eq: 'published' } },
                { count: { $gt: 50 } }
              ]
            }
            const andResults = queryEngine.query(contentType, { filters: andFilter })
            const andExpected = entries.filter(e => e.status === 'published' && e.count > 50)

            expect(andResults.length).toBe(andExpected.length)

            // Test $or
            const orFilter: FilterGroup = {
              $or: [
                { status: { $eq: 'draft' } },
                { active: { $eq: true } }
              ]
            }
            const orResults = queryEngine.query(contentType, { filters: orFilter })
            const orExpected = entries.filter(e => e.status === 'draft' || e.active === true)

            expect(orResults.length).toBe(orExpected.length)

            // Test $not
            const notFilter: FilterGroup = {
              $not: { status: { $eq: 'archived' } }
            }
            const notResults = queryEngine.query(contentType, { filters: notFilter })
            const notExpected = entries.filter(e => e.status !== 'archived')

            expect(notResults.length).toBe(notExpected.length)
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test that empty filters return all entries
     */
    it('should return all entries when no filters are applied', async () => {
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
            { minLength: 5, maxLength: 30 }
          ),
          async (contentType, rawEntries) => {
            const entries = ensureUniqueIds(rawEntries)

            // Clean up any existing directory for this content type
            const typeDir = join(contentDir, contentType)
            try {
              await fs.rm(typeDir, { recursive: true, force: true })
            } catch {
              // Ignore if doesn't exist
            }

            // Setup
            await fs.mkdir(typeDir, { recursive: true })

            for (const entry of entries) {
              const filePath = join(typeDir, `${entry.id}.json`)
              await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf8')
            }

            await queryEngine.buildIndex(contentType)

            // Query without filters
            const results = queryEngine.query(contentType, {})

            // Property: Should return all entries
            expect(results.length).toBe(entries.length)

            // Every entry should be in results
            for (const entry of entries) {
              const found = results.find(r => r.id === entry.id)
              expect(found).toBeDefined()
            }
          }
        ),
        { numRuns: 5 }
      )
    })

    /**
     * Test that filters returning no matches produce empty results
     */
    it('should return empty array when no entries match the filter', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          fc.array(
            fc.record({
              id: fc.uuid(),
              title: fc.string({ minLength: 1, maxLength: 100 }),
              count: fc.integer({ min: 0, max: 50 }), // All entries have count <= 50
              createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                .map(d => d.toISOString()),
              updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
                .map(d => d.toISOString()),
            }),
            { minLength: 5, maxLength: 30 }
          ),
          async (contentType, rawEntries) => {
            const entries = ensureUniqueIds(rawEntries)

            // Clean up any existing directory for this content type
            const typeDir = join(contentDir, contentType)
            try {
              await fs.rm(typeDir, { recursive: true, force: true })
            } catch {
              // Ignore if doesn't exist
            }

            // Setup
            await fs.mkdir(typeDir, { recursive: true })

            for (const entry of entries) {
              const filePath = join(typeDir, `${entry.id}.json`)
              await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf8')
            }

            await queryEngine.buildIndex(contentType)

            // Query with filter that matches nothing (count > 100, but all entries have count <= 50)
            const filter: FilterGroup = { count: { $gt: 100 } }
            const results = queryEngine.query(contentType, { filters: filter })

            // Property: Should return empty array
            expect(results.length).toBe(0)
          }
        ),
        { numRuns: 5 }
      )
    })
  })
})
