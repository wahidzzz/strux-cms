import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { QueryEngine } from './query-engine.js'
import { FileEngine } from './file-engine.js'
import type { ContentEntry } from '../types/index.js'

describe('QueryEngine', () => {
  let queryEngine: QueryEngine
  let fileEngine: FileEngine
  let testDir: string
  let contentDir: string

  beforeEach(async () => {
    // Create a unique test directory for each test
    testDir = join(
      process.cwd(),
      'test-data',
      `query-test-${Date.now()}-${Math.random().toString(36).substring(2)}`
    )
    contentDir = join(testDir, 'content', 'api')
    await fs.mkdir(contentDir, { recursive: true })

    fileEngine = new FileEngine()
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

  describe('buildIndex', () => {
    it('should build index for empty content type', async () => {
      const contentType = 'articles'
      const typeDir = join(contentDir, contentType)
      await fs.mkdir(typeDir, { recursive: true })

      await queryEngine.buildIndex(contentType)

      const index = queryEngine.getIndex(contentType)
      expect(index).toBeDefined()
      expect(index!.entries.size).toBe(0)
    })

    it('should build index for content type with entries', async () => {
      const contentType = 'articles'
      const typeDir = join(contentDir, contentType)
      await fs.mkdir(typeDir, { recursive: true })

      // Create test entries
      const entries: ContentEntry[] = [
        {
          id: '1',
          title: 'Article 1',
          slug: 'article-1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          publishedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          title: 'Article 2',
          slug: 'article-2',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          publishedAt: null,
        },
      ]

      for (const entry of entries) {
        await fileEngine.writeAtomic(join(typeDir, `${entry.id}.json`), entry)
      }

      await queryEngine.buildIndex(contentType)

      const index = queryEngine.getIndex(contentType)
      expect(index).toBeDefined()
      expect(index!.entries.size).toBe(2)
      
      // Check entries exist (ignore _searchableText property)
      const entry1 = index!.entries.get('1')
      expect(entry1?.id).toBe('1')
      expect(entry1?.title).toBe('Article 1')
      expect(entry1?.slug).toBe('article-1')
      
      const entry2 = index!.entries.get('2')
      expect(entry2?.id).toBe('2')
      expect(entry2?.title).toBe('Article 2')
      expect(entry2?.slug).toBe('article-2')
    })

    it('should build field indexes for common fields', async () => {
      const contentType = 'articles'
      const typeDir = join(contentDir, contentType)
      await fs.mkdir(typeDir, { recursive: true })

      const entry: ContentEntry = {
        id: '1',
        title: 'Test Article',
        slug: 'test-article',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        publishedAt: '2024-01-01T00:00:00Z',
      }

      await fileEngine.writeAtomic(join(typeDir, `${entry.id}.json`), entry)
      await queryEngine.buildIndex(contentType)

      const index = queryEngine.getIndex(contentType)
      expect(index).toBeDefined()

      // Check slug index
      const slugIndex = index!.fieldIndexes.get('slug')
      expect(slugIndex).toBeDefined()
      expect(slugIndex!.get('test-article')).toContain('1')

      // Check publishedAt index
      const publishedAtIndex = index!.fieldIndexes.get('publishedAt')
      expect(publishedAtIndex).toBeDefined()
      expect(publishedAtIndex!.get('2024-01-01T00:00:00Z')).toContain('1')
    })

    it('should build searchable text', async () => {
      const contentType = 'articles'
      const typeDir = join(contentDir, contentType)
      await fs.mkdir(typeDir, { recursive: true })

      const entry: ContentEntry = {
        id: '1',
        title: 'Test Article',
        content: 'This is the content',
        slug: 'test-article',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      await fileEngine.writeAtomic(join(typeDir, `${entry.id}.json`), entry)
      await queryEngine.buildIndex(contentType)

      const index = queryEngine.getIndex(contentType)
      const indexedEntry = index!.entries.get('1') as any

      expect(indexedEntry._searchableText).toBeDefined()
      expect(indexedEntry._searchableText).toContain('test article')
      expect(indexedEntry._searchableText).toContain('this is the content')
    })

    it('should handle non-existent content type directory', async () => {
      const contentType = 'nonexistent'

      await queryEngine.buildIndex(contentType)

      const index = queryEngine.getIndex(contentType)
      expect(index).toBeDefined()
      expect(index!.entries.size).toBe(0)
    })

    it('should skip invalid JSON files', async () => {
      const contentType = 'articles'
      const typeDir = join(contentDir, contentType)
      await fs.mkdir(typeDir, { recursive: true })

      // Create a valid entry
      const validEntry: ContentEntry = {
        id: '1',
        title: 'Valid Article',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }
      await fileEngine.writeAtomic(join(typeDir, '1.json'), validEntry)

      // Create an invalid JSON file
      await fs.writeFile(join(typeDir, '2.json'), 'invalid json{', 'utf8')

      await queryEngine.buildIndex(contentType)

      const index = queryEngine.getIndex(contentType)
      expect(index).toBeDefined()
      expect(index!.entries.size).toBe(1)
      
      // Check entry exists (ignore _searchableText property)
      const entry = index!.entries.get('1')
      expect(entry?.id).toBe('1')
      expect(entry?.title).toBe('Valid Article')
    })
  })

  describe('rebuildAllIndexes', () => {
    it('should rebuild indexes for all content types', async () => {
      // Create multiple content types
      const contentTypes = ['articles', 'pages', 'users']

      for (const type of contentTypes) {
        const typeDir = join(contentDir, type)
        await fs.mkdir(typeDir, { recursive: true })

        const entry: ContentEntry = {
          id: '1',
          name: `${type} entry`,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }

        await fileEngine.writeAtomic(join(typeDir, '1.json'), entry)
      }

      await queryEngine.rebuildAllIndexes()

      // Verify all indexes were built
      for (const type of contentTypes) {
        const index = queryEngine.getIndex(type)
        expect(index).toBeDefined()
        expect(index!.entries.size).toBe(1)
      }
    })

    it('should handle non-existent content directory', async () => {
      const emptyQueryEngine = new QueryEngine(
        join(testDir, 'nonexistent'),
        fileEngine
      )

      await expect(emptyQueryEngine.rebuildAllIndexes()).resolves.not.toThrow()
    })

    it('should complete within performance target for small datasets', async () => {
      const contentType = 'articles'
      const typeDir = join(contentDir, contentType)
      await fs.mkdir(typeDir, { recursive: true })

      // Create 100 entries
      for (let i = 1; i <= 100; i++) {
        const entry: ContentEntry = {
          id: String(i),
          title: `Article ${i}`,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }
        await fileEngine.writeAtomic(join(typeDir, `${i}.json`), entry)
      }

      const startTime = Date.now()
      await queryEngine.rebuildAllIndexes()
      const duration = Date.now() - startTime

      // Should be very fast for 100 entries
      expect(duration).toBeLessThan(1000)
    })
  })

  describe('updateIndex', () => {
    it('should update existing entry in index', async () => {
      const contentType = 'articles'
      const typeDir = join(contentDir, contentType)
      await fs.mkdir(typeDir, { recursive: true })

      const originalEntry: ContentEntry = {
        id: '1',
        title: 'Original Title',
        slug: 'original-slug',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      await fileEngine.writeAtomic(join(typeDir, '1.json'), originalEntry)
      await queryEngine.buildIndex(contentType)

      const updatedEntry: ContentEntry = {
        id: '1',
        title: 'Updated Title',
        slug: 'updated-slug',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      }

      queryEngine.updateIndex(contentType, '1', updatedEntry)

      const index = queryEngine.getIndex(contentType)
      expect(index!.entries.get('1')).toEqual(updatedEntry)

      // Check that field indexes were updated
      const slugIndex = index!.fieldIndexes.get('slug')
      expect(slugIndex!.get('updated-slug')).toContain('1')
      expect(slugIndex!.has('original-slug')).toBe(false)
    })

    it('should add new entry to index', async () => {
      const contentType = 'articles'

      const newEntry: ContentEntry = {
        id: '1',
        title: 'New Article',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      queryEngine.updateIndex(contentType, '1', newEntry)

      const index = queryEngine.getIndex(contentType)
      expect(index).toBeDefined()
      expect(index!.entries.get('1')).toEqual(newEntry)
    })
  })

  describe('removeFromIndex', () => {
    it('should remove entry from index', async () => {
      const contentType = 'articles'
      const typeDir = join(contentDir, contentType)
      await fs.mkdir(typeDir, { recursive: true })

      const entry: ContentEntry = {
        id: '1',
        title: 'Test Article',
        slug: 'test-article',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      await fileEngine.writeAtomic(join(typeDir, '1.json'), entry)
      await queryEngine.buildIndex(contentType)

      queryEngine.removeFromIndex(contentType, '1')

      const index = queryEngine.getIndex(contentType)
      expect(index!.entries.has('1')).toBe(false)

      // Check that field indexes were cleaned up
      const slugIndex = index!.fieldIndexes.get('slug')
      expect(slugIndex?.has('test-article')).toBe(false)
    })

    it('should handle removing non-existent entry', async () => {
      const contentType = 'articles'

      queryEngine.removeFromIndex(contentType, 'nonexistent')

      // Should not throw
      expect(true).toBe(true)
    })

    it('should handle removing from non-existent content type', async () => {
      queryEngine.removeFromIndex('nonexistent', '1')

      // Should not throw
      expect(true).toBe(true)
    })
  })

  describe('query with filters', () => {
    let contentType: string
    let typeDir: string

    beforeEach(async () => {
      contentType = 'articles'
      typeDir = join(contentDir, contentType)
      await fs.mkdir(typeDir, { recursive: true })

      // Create test entries with various data types
      const entries: ContentEntry[] = [
        {
          id: '1',
          title: 'First Article',
          slug: 'first-article',
          views: 100,
          rating: 4.5,
          status: 'published',
          tags: ['tech', 'news'],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          publishedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          title: 'Second Article',
          slug: 'second-article',
          views: 200,
          rating: 3.8,
          status: 'draft',
          tags: ['tech'],
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          publishedAt: null,
        },
        {
          id: '3',
          title: 'Third Article',
          slug: 'third-article',
          views: 150,
          rating: 4.2,
          status: 'published',
          tags: ['news'],
          createdAt: '2024-01-03T00:00:00Z',
          updatedAt: '2024-01-03T00:00:00Z',
          publishedAt: '2024-01-03T00:00:00Z',
        },
        {
          id: '4',
          title: 'Fourth Article',
          slug: 'fourth-article',
          views: 50,
          rating: null,
          status: 'archived',
          tags: [],
          createdAt: '2024-01-04T00:00:00Z',
          updatedAt: '2024-01-04T00:00:00Z',
          publishedAt: null,
        },
      ]

      for (const entry of entries) {
        await fileEngine.writeAtomic(join(typeDir, `${entry.id}.json`), entry)
      }

      await queryEngine.buildIndex(contentType)
    })

    describe('equality operators', () => {
      it('should filter with $eq operator', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            status: { $eq: 'published' },
          },
        })

        expect(results).toHaveLength(2)
        expect(results.map((r) => r.id).sort()).toEqual(['1', '3'])
      })

      it('should filter with direct equality', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            status: 'draft',
          },
        })

        expect(results).toHaveLength(1)
        expect(results[0].id).toBe('2')
      })

      it('should filter with $ne operator', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            status: { $ne: 'published' },
          },
        })

        expect(results).toHaveLength(2)
        expect(results.map((r) => r.id).sort()).toEqual(['2', '4'])
      })
    })

    describe('comparison operators', () => {
      it('should filter with $gt operator', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            views: { $gt: 100 },
          },
        })

        expect(results).toHaveLength(2)
        expect(results.map((r) => r.id).sort()).toEqual(['2', '3'])
      })

      it('should filter with $gte operator', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            views: { $gte: 150 },
          },
        })

        expect(results).toHaveLength(2)
        expect(results.map((r) => r.id).sort()).toEqual(['2', '3'])
      })

      it('should filter with $lt operator', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            views: { $lt: 150 },
          },
        })

        expect(results).toHaveLength(2)
        expect(results.map((r) => r.id).sort()).toEqual(['1', '4'])
      })

      it('should filter with $lte operator', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            views: { $lte: 150 },
          },
        })

        expect(results).toHaveLength(3)
        expect(results.map((r) => r.id).sort()).toEqual(['1', '3', '4'])
      })

      it('should filter with comparison on strings', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            slug: { $gt: 'second-article' },
          },
        })

        expect(results).toHaveLength(1)
        expect(results[0].id).toBe('3')
      })
    })

    describe('array membership operators', () => {
      it('should filter with $in operator', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            status: { $in: ['published', 'draft'] },
          },
        })

        expect(results).toHaveLength(3)
        expect(results.map((r) => r.id).sort()).toEqual(['1', '2', '3'])
      })

      it('should filter with $notIn operator', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            status: { $notIn: ['published', 'draft'] },
          },
        })

        expect(results).toHaveLength(1)
        expect(results[0].id).toBe('4')
      })
    })

    describe('string matching operators', () => {
      it('should filter with $contains operator', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            title: { $contains: 'First' },
          },
        })

        expect(results).toHaveLength(1)
        expect(results[0].id).toBe('1')
      })

      it('should filter with $notContains operator', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            title: { $notContains: 'First' },
          },
        })

        expect(results).toHaveLength(3)
        expect(results.map((r) => r.id).sort()).toEqual(['2', '3', '4'])
      })

      it('should filter with $containsi operator (case-insensitive)', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            title: { $containsi: 'FIRST' },
          },
        })

        expect(results).toHaveLength(1)
        expect(results[0].id).toBe('1')
      })

      it('should filter with $notContainsi operator (case-insensitive)', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            title: { $notContainsi: 'FIRST' },
          },
        })

        expect(results).toHaveLength(3)
        expect(results.map((r) => r.id).sort()).toEqual(['2', '3', '4'])
      })

      it('should filter with $startsWith operator', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            title: { $startsWith: 'First' },
          },
        })

        expect(results).toHaveLength(1)
        expect(results[0].id).toBe('1')
      })

      it('should filter with $endsWith operator', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            title: { $endsWith: 'Article' },
          },
        })

        expect(results).toHaveLength(4)
      })
    })

    describe('null check operators', () => {
      it('should filter with $null operator (true)', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            rating: { $null: true },
          },
        })

        expect(results).toHaveLength(1)
        expect(results[0].id).toBe('4')
      })

      it('should filter with $null operator (false)', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            rating: { $null: false },
          },
        })

        expect(results).toHaveLength(3)
        expect(results.map((r) => r.id).sort()).toEqual(['1', '2', '3'])
      })

      it('should filter with $notNull operator (true)', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            rating: { $notNull: true },
          },
        })

        expect(results).toHaveLength(3)
        expect(results.map((r) => r.id).sort()).toEqual(['1', '2', '3'])
      })

      it('should filter with $notNull operator (false)', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            rating: { $notNull: false },
          },
        })

        expect(results).toHaveLength(1)
        expect(results[0].id).toBe('4')
      })

      it('should treat undefined as null', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            nonExistentField: { $null: true },
          },
        })

        expect(results).toHaveLength(4)
      })
    })

    describe('logical operators', () => {
      it('should filter with $and operator', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            $and: [{ status: 'published' }, { views: { $gt: 100 } }],
          },
        })

        expect(results).toHaveLength(1)
        expect(results[0].id).toBe('3')
      })

      it('should filter with $or operator', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            $or: [{ status: 'draft' }, { status: 'archived' }],
          },
        })

        expect(results).toHaveLength(2)
        expect(results.map((r) => r.id).sort()).toEqual(['2', '4'])
      })

      it('should filter with $not operator', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            $not: { status: 'published' },
          },
        })

        expect(results).toHaveLength(2)
        expect(results.map((r) => r.id).sort()).toEqual(['2', '4'])
      })

      it('should filter with nested logical operators', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            $and: [
              {
                $or: [{ status: 'published' }, { status: 'draft' }],
              },
              { views: { $gte: 100 } },
            ],
          },
        })

        expect(results).toHaveLength(3)
        expect(results.map((r) => r.id).sort()).toEqual(['1', '2', '3'])
      })
    })

    describe('combined filters', () => {
      it('should filter with multiple field conditions', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            status: 'published',
            views: { $gte: 100 },
          },
        })

        expect(results).toHaveLength(2)
        expect(results.map((r) => r.id).sort()).toEqual(['1', '3'])
      })

      it('should filter with complex nested conditions', () => {
        const results = queryEngine.query(contentType, {
          filters: {
            $and: [
              {
                $or: [{ status: 'published' }, { status: 'draft' }],
              },
              {
                $not: { views: { $lt: 100 } },
              },
            ],
          },
        })

        expect(results).toHaveLength(3)
        expect(results.map((r) => r.id).sort()).toEqual(['1', '2', '3'])
      })
    })

    describe('publication state filtering', () => {
      it('should filter by publicationState=live', () => {
        const results = queryEngine.query(contentType, {
          publicationState: 'live',
        })

        expect(results).toHaveLength(2)
        expect(results.map((r) => r.id).sort()).toEqual(['1', '3'])
      })

      it('should filter by publicationState=preview', () => {
        const results = queryEngine.query(contentType, {
          publicationState: 'preview',
        })

        expect(results).toHaveLength(4)
      })

      it('should combine publicationState with filters', () => {
        const results = queryEngine.query(contentType, {
          publicationState: 'live',
          filters: {
            views: { $gt: 100 },
          },
        })

        expect(results).toHaveLength(1)
        expect(results[0].id).toBe('3')
      })
    })
  })

  describe('query with sorting', () => {
    let contentType: string
    let typeDir: string

    beforeEach(async () => {
      contentType = 'articles'
      typeDir = join(contentDir, contentType)
      await fs.mkdir(typeDir, { recursive: true })

      const entries: ContentEntry[] = [
        {
          id: '1',
          title: 'Article C',
          views: 100,
          createdAt: '2024-01-03T00:00:00Z',
          updatedAt: '2024-01-03T00:00:00Z',
        },
        {
          id: '2',
          title: 'Article A',
          views: 200,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: '3',
          title: 'Article B',
          views: 150,
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ]

      for (const entry of entries) {
        await fileEngine.writeAtomic(join(typeDir, `${entry.id}.json`), entry)
      }

      await queryEngine.buildIndex(contentType)
    })

    it('should sort by single field ascending', () => {
      const results = queryEngine.query(contentType, {
        sort: [{ field: 'title', order: 'asc' }],
      })

      expect(results.map((r) => r.id)).toEqual(['2', '3', '1'])
    })

    it('should sort by single field descending', () => {
      const results = queryEngine.query(contentType, {
        sort: [{ field: 'views', order: 'desc' }],
      })

      expect(results.map((r) => r.id)).toEqual(['2', '3', '1'])
    })

    it('should sort by multiple fields', () => {
      const results = queryEngine.query(contentType, {
        sort: [
          { field: 'views', order: 'asc' },
          { field: 'title', order: 'asc' },
        ],
      })

      expect(results.map((r) => r.id)).toEqual(['1', '3', '2'])
    })
  })

  describe('query with pagination', () => {
    let contentType: string
    let typeDir: string

    beforeEach(async () => {
      contentType = 'articles'
      typeDir = join(contentDir, contentType)
      await fs.mkdir(typeDir, { recursive: true })

      // Create 10 entries
      for (let i = 1; i <= 10; i++) {
        const entry: ContentEntry = {
          id: String(i),
          title: `Article ${i}`,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }
        await fileEngine.writeAtomic(join(typeDir, `${i}.json`), entry)
      }

      await queryEngine.buildIndex(contentType)
    })

    it('should paginate with page/pageSize', () => {
      const results = queryEngine.query(contentType, {
        sort: [{ field: 'id', order: 'asc' }],
        pagination: { page: 2, pageSize: 3 },
      })

      expect(results).toHaveLength(3)
      // String IDs are sorted lexicographically: 1, 10, 2, 3, 4, 5, 6, 7, 8, 9
      // Page 2 with pageSize 3 means items 4-6 (0-indexed: 3-5)
      // So we get: 3, 4, 5
      expect(results.map((r) => r.id)).toEqual(['3', '4', '5'])
    })

    it('should paginate with start/limit', () => {
      const results = queryEngine.query(contentType, {
        sort: [{ field: 'id', order: 'asc' }],
        pagination: { start: 5, limit: 3 },
      })

      expect(results).toHaveLength(3)
      // String IDs are sorted lexicographically: 1, 10, 2, 3, 4, 5, 6, 7, 8, 9
      // Start at index 5, take 3 items: 5, 6, 7
      expect(results.map((r) => r.id)).toEqual(['5', '6', '7'])
    })

    it('should use default pagination', () => {
      const results = queryEngine.query(contentType, {
        pagination: {},
      })

      expect(results).toHaveLength(10)
    })
  })

  describe('query with field selection', () => {
    let contentType: string
    let typeDir: string

    beforeEach(async () => {
      contentType = 'articles'
      typeDir = join(contentDir, contentType)
      await fs.mkdir(typeDir, { recursive: true })

      const entry: ContentEntry = {
        id: '1',
        title: 'Test Article',
        content: 'Test content',
        views: 100,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      await fileEngine.writeAtomic(join(typeDir, '1.json'), entry)
      await queryEngine.buildIndex(contentType)
    })

    it('should select specific fields', () => {
      const results = queryEngine.query(contentType, {
        fields: ['title', 'views'],
      })

      expect(results).toHaveLength(1)
      expect(results[0]).toHaveProperty('id')
      expect(results[0]).toHaveProperty('title')
      expect(results[0]).toHaveProperty('views')
      expect(results[0]).toHaveProperty('createdAt')
      expect(results[0]).toHaveProperty('updatedAt')
      expect(results[0]).not.toHaveProperty('content')
    })
  })

  describe('count', () => {
    let contentType: string
    let typeDir: string

    beforeEach(async () => {
      contentType = 'articles'
      typeDir = join(contentDir, contentType)
      await fs.mkdir(typeDir, { recursive: true })

      const entries: ContentEntry[] = [
        {
          id: '1',
          status: 'published',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          publishedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          status: 'draft',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          publishedAt: null,
        },
        {
          id: '3',
          status: 'published',
          createdAt: '2024-01-03T00:00:00Z',
          updatedAt: '2024-01-03T00:00:00Z',
          publishedAt: '2024-01-03T00:00:00Z',
        },
      ]

      for (const entry of entries) {
        await fileEngine.writeAtomic(join(typeDir, `${entry.id}.json`), entry)
      }

      await queryEngine.buildIndex(contentType)
    })

    it('should count all entries', () => {
      const count = queryEngine.count(contentType)
      expect(count).toBe(3)
    })

    it('should count with filters', () => {
      const count = queryEngine.count(contentType, {
        filters: { status: 'published' },
      })
      expect(count).toBe(2)
    })

    it('should count with publicationState', () => {
      const count = queryEngine.count(contentType, {
        publicationState: 'live',
      })
      expect(count).toBe(2)
    })

    it('should return 0 for non-existent content type', () => {
      const count = queryEngine.count('nonexistent')
      expect(count).toBe(0)
    })
  })

  describe('error handling', () => {
    it('should throw error for non-existent content type in query', () => {
      expect(() => {
        queryEngine.query('nonexistent')
      }).toThrow('Index not found for content type: nonexistent')
    })
  })

  describe('populateRelations', () => {
    let contentType: string
    let typeDir: string

    beforeEach(async () => {
      contentType = 'articles'
      typeDir = join(contentDir, contentType)
      await fs.mkdir(typeDir, { recursive: true })

      // Create author content type
      const authorDir = join(contentDir, 'authors')
      await fs.mkdir(authorDir, { recursive: true })

      // Create test authors
      const authors: ContentEntry[] = [
        {
          id: 'author-1',
          name: 'John Doe',
          email: 'john@example.com',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'author-2',
          name: 'Jane Smith',
          email: 'jane@example.com',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ]

      for (const author of authors) {
        await fileEngine.writeAtomic(join(authorDir, `${author.id}.json`), author)
      }

      // Create test articles with author relations
      const articles: ContentEntry[] = [
        {
          id: '1',
          title: 'Article 1',
          author: 'author-1', // manyToOne relation
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          publishedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          title: 'Article 2',
          author: 'author-2', // manyToOne relation
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          publishedAt: null,
        },
      ]

      for (const article of articles) {
        await fileEngine.writeAtomic(join(typeDir, `${article.id}.json`), article)
      }

      // Build indexes
      await queryEngine.buildIndex('authors')
      await queryEngine.buildIndex(contentType)
    })

    it('should return entries without population when schemaEngine is not provided', () => {
      const results = queryEngine.query(contentType, {
        populate: { author: true },
      })

      expect(results).toHaveLength(2)
      expect(results[0].author).toBe('author-1') // Still an ID
      expect(results[1].author).toBe('author-2') // Still an ID
    })

    it('should skip population when schema has no relations', () => {
      // Create a mock SchemaEngine that returns no relations
      const mockSchemaEngine = {
        getRelationsCached: () => [],
      }

      const queryEngineWithSchema = new QueryEngine(
        contentDir,
        fileEngine,
        mockSchemaEngine as any
      )

      // Copy indexes from original engine
      queryEngineWithSchema['indexes'] = queryEngine['indexes']

      const results = queryEngineWithSchema.query(contentType, {
        populate: { author: true },
      })

      expect(results).toHaveLength(2)
      expect(results[0].author).toBe('author-1') // Still an ID
    })

    it('should populate manyToOne relation', () => {
      // Create a mock SchemaEngine with relation config
      const mockSchemaEngine = {
        getRelationsCached: (ct: string) => {
          if (ct === 'articles') {
            return [
              {
                fieldName: 'author',
                config: {
                  relation: 'manyToOne' as const,
                  target: 'authors',
                },
              },
            ]
          }
          return []
        },
      }

      const queryEngineWithSchema = new QueryEngine(
        contentDir,
        fileEngine,
        mockSchemaEngine as any
      )

      // Copy indexes from original engine
      queryEngineWithSchema['indexes'] = queryEngine['indexes']

      const results = queryEngineWithSchema.query(contentType, {
        populate: { author: true },
      })

      expect(results).toHaveLength(2)
      
      // Check first article's author is populated
      expect(results[0].author).toBeTypeOf('object')
      expect((results[0].author as any).id).toBe('author-1')
      expect((results[0].author as any).name).toBe('John Doe')
      expect((results[0].author as any).email).toBe('john@example.com')

      // Check second article's author is populated
      expect(results[1].author).toBeTypeOf('object')
      expect((results[1].author as any).id).toBe('author-2')
      expect((results[1].author as any).name).toBe('Jane Smith')
    })

    it('should populate with field selection', () => {
      const mockSchemaEngine = {
        getRelationsCached: (ct: string) => {
          if (ct === 'articles') {
            return [
              {
                fieldName: 'author',
                config: {
                  relation: 'manyToOne' as const,
                  target: 'authors',
                },
              },
            ]
          }
          return []
        },
      }

      const queryEngineWithSchema = new QueryEngine(
        contentDir,
        fileEngine,
        mockSchemaEngine as any
      )

      queryEngineWithSchema['indexes'] = queryEngine['indexes']

      const results = queryEngineWithSchema.query(contentType, {
        populate: {
          author: {
            fields: ['name'],
          },
        },
      })

      expect(results).toHaveLength(2)
      
      // Check only selected fields are included
      const author = results[0].author as any
      expect(author.id).toBeDefined() // Always included
      expect(author.name).toBe('John Doe')
      expect(author.email).toBeUndefined() // Not selected
    })

    it('should populate oneToMany relation', async () => {
      // Create category with multiple articles
      const categoryDir = join(contentDir, 'categories')
      await fs.mkdir(categoryDir, { recursive: true })

      const category: ContentEntry = {
        id: 'cat-1',
        name: 'Technology',
        articles: ['1', '2'], // oneToMany relation
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      await fileEngine.writeAtomic(join(categoryDir, `${category.id}.json`), category)
      await queryEngine.buildIndex('categories')

      const mockSchemaEngine = {
        getRelationsCached: (ct: string) => {
          if (ct === 'categories') {
            return [
              {
                fieldName: 'articles',
                config: {
                  relation: 'oneToMany' as const,
                  target: 'articles',
                },
              },
            ]
          }
          return []
        },
      }

      const queryEngineWithSchema = new QueryEngine(
        contentDir,
        fileEngine,
        mockSchemaEngine as any
      )

      queryEngineWithSchema['indexes'] = queryEngine['indexes']

      const results = queryEngineWithSchema.query('categories', {
        populate: { articles: true },
      })

      expect(results).toHaveLength(1)
      expect(Array.isArray(results[0].articles)).toBe(true)
      
      const articles = results[0].articles as any[]
      expect(articles).toHaveLength(2)
      expect(articles[0].id).toBe('1')
      expect(articles[0].title).toBe('Article 1')
      expect(articles[1].id).toBe('2')
      expect(articles[1].title).toBe('Article 2')
    })

    it('should handle nested population', async () => {
      // Create comment content type with author relation
      const commentDir = join(contentDir, 'comments')
      await fs.mkdir(commentDir, { recursive: true })

      const comment: ContentEntry = {
        id: 'comment-1',
        text: 'Great article!',
        author: 'author-1',
        article: '1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      await fileEngine.writeAtomic(join(commentDir, `${comment.id}.json`), comment)
      await queryEngine.buildIndex('comments')

      const mockSchemaEngine = {
        getRelationsCached: (ct: string) => {
          if (ct === 'comments') {
            return [
              {
                fieldName: 'author',
                config: {
                  relation: 'manyToOne' as const,
                  target: 'authors',
                },
              },
              {
                fieldName: 'article',
                config: {
                  relation: 'manyToOne' as const,
                  target: 'articles',
                },
              },
            ]
          }
          if (ct === 'articles') {
            return [
              {
                fieldName: 'author',
                config: {
                  relation: 'manyToOne' as const,
                  target: 'authors',
                },
              },
            ]
          }
          return []
        },
      }

      const queryEngineWithSchema = new QueryEngine(
        contentDir,
        fileEngine,
        mockSchemaEngine as any
      )

      queryEngineWithSchema['indexes'] = queryEngine['indexes']

      const results = queryEngineWithSchema.query('comments', {
        populate: {
          article: {
            populate: {
              author: true,
            },
          },
        },
      })

      expect(results).toHaveLength(1)
      
      const article = results[0].article as any
      expect(article.id).toBe('1')
      expect(article.title).toBe('Article 1')
      
      const author = article.author as any
      expect(author.id).toBe('author-1')
      expect(author.name).toBe('John Doe')
    })

    it('should handle circular references', async () => {
      // Create circular reference: article -> author -> favoriteArticle -> author
      const authorDir = join(contentDir, 'authors')
      
      // Update author to have favorite article
      const authorWithFavorite: ContentEntry = {
        id: 'author-1',
        name: 'John Doe',
        email: 'john@example.com',
        favoriteArticle: '1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      }

      await fileEngine.writeAtomic(
        join(authorDir, `${authorWithFavorite.id}.json`),
        authorWithFavorite
      )
      await queryEngine.buildIndex('authors')

      const mockSchemaEngine = {
        getRelationsCached: (ct: string) => {
          if (ct === 'articles') {
            return [
              {
                fieldName: 'author',
                config: {
                  relation: 'manyToOne' as const,
                  target: 'authors',
                },
              },
            ]
          }
          if (ct === 'authors') {
            return [
              {
                fieldName: 'favoriteArticle',
                config: {
                  relation: 'manyToOne' as const,
                  target: 'articles',
                },
              },
            ]
          }
          return []
        },
      }

      const queryEngineWithSchema = new QueryEngine(
        contentDir,
        fileEngine,
        mockSchemaEngine as any
      )

      queryEngineWithSchema['indexes'] = queryEngine['indexes']

      // This should not cause infinite recursion
      const results = queryEngineWithSchema.query('articles', {
        filters: { id: '1' },
        populate: {
          author: {
            populate: {
              favoriteArticle: {
                populate: {
                  author: true,
                },
              },
            },
          },
        },
      })

      expect(results).toHaveLength(1)
      
      const article = results[0]
      const author = article.author as any
      expect(author.id).toBe('author-1')
      
      const favoriteArticle = author.favoriteArticle as any
      expect(favoriteArticle.id).toBe('1')
      
      // The nested author should NOT be populated to prevent circular reference
      // It should remain as the ID string
      expect(favoriteArticle.author).toBe('author-1')
    })

    it('should handle missing related entries gracefully', () => {
      const mockSchemaEngine = {
        getRelationsCached: (ct: string) => {
          if (ct === 'articles') {
            return [
              {
                fieldName: 'author',
                config: {
                  relation: 'manyToOne' as const,
                  target: 'authors',
                },
              },
            ]
          }
          return []
        },
      }

      const queryEngineWithSchema = new QueryEngine(
        contentDir,
        fileEngine,
        mockSchemaEngine as any
      )

      queryEngineWithSchema['indexes'] = queryEngine['indexes']

      // Update article to reference non-existent author
      const index = queryEngineWithSchema.getIndex('articles')!
      const article = index.entries.get('1')!
      article.author = 'non-existent-author'

      const results = queryEngineWithSchema.query('articles', {
        filters: { id: '1' },
        populate: { author: true },
      })

      expect(results).toHaveLength(1)
      // Author should still be the ID since it couldn't be populated
      expect(results[0].author).toBe('non-existent-author')
    })

    it('should handle null relation values', () => {
      const mockSchemaEngine = {
        getRelationsCached: (ct: string) => {
          if (ct === 'articles') {
            return [
              {
                fieldName: 'author',
                config: {
                  relation: 'manyToOne' as const,
                  target: 'authors',
                },
              },
            ]
          }
          return []
        },
      }

      const queryEngineWithSchema = new QueryEngine(
        contentDir,
        fileEngine,
        mockSchemaEngine as any
      )

      queryEngineWithSchema['indexes'] = queryEngine['indexes']

      // Update article to have null author
      const index = queryEngineWithSchema.getIndex('articles')!
      const article = index.entries.get('1')!
      article.author = null

      const results = queryEngineWithSchema.query('articles', {
        filters: { id: '1' },
        populate: { author: true },
      })

      expect(results).toHaveLength(1)
      expect(results[0].author).toBeNull()
    })
  })
})
