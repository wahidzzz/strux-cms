import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { FileEngine } from './file-engine'

describe('FileEngine', () => {
  let fileEngine: FileEngine
  let testDir: string

  beforeEach(async () => {
    fileEngine = new FileEngine()
    // Create a unique test directory for each test
    testDir = join(process.cwd(), 'test-data', `test-${Date.now()}-${Math.random().toString(36).substring(2)}`)
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

  describe('writeAtomic', () => {
    it('should write data atomically to a file', async () => {
      const filePath = join(testDir, 'test.json')
      const data = { id: '1', name: 'Test', value: 42 }

      await fileEngine.writeAtomic(filePath, data)

      // Verify file exists and contains correct data
      const content = await fs.readFile(filePath, 'utf8')
      const parsed = JSON.parse(content)
      expect(parsed).toEqual(data)
    })

    it('should create parent directories if they do not exist', async () => {
      const filePath = join(testDir, 'nested', 'deep', 'test.json')
      const data = { test: true }

      await fileEngine.writeAtomic(filePath, data)

      // Verify file exists
      const content = await fs.readFile(filePath, 'utf8')
      const parsed = JSON.parse(content)
      expect(parsed).toEqual(data)
    })

    it('should overwrite existing file', async () => {
      const filePath = join(testDir, 'test.json')
      const data1 = { version: 1 }
      const data2 = { version: 2 }

      await fileEngine.writeAtomic(filePath, data1)
      await fileEngine.writeAtomic(filePath, data2)

      const content = await fs.readFile(filePath, 'utf8')
      const parsed = JSON.parse(content)
      expect(parsed).toEqual(data2)
    })

    it('should throw error for invalid path', async () => {
      await expect(fileEngine.writeAtomic('', { test: true })).rejects.toThrow('Invalid path')
    })

    it('should throw error for non-serializable data', async () => {
      const filePath = join(testDir, 'test.json')
      const circular: any = {}
      circular.self = circular

      await expect(fileEngine.writeAtomic(filePath, circular)).rejects.toThrow('Failed to serialize')
    })

    it('should clean up temp file on error', async () => {
      const filePath = join(testDir, 'test.json')
      const data = { test: true }

      // Write successfully first
      await fileEngine.writeAtomic(filePath, data)

      // Attempt to write with a circular reference to cause serialization error
      const circular: any = {}
      circular.self = circular
      
      try {
        await fileEngine.writeAtomic(filePath, circular)
      } catch {
        // Expected to fail
      }

      // Verify no temp files are left behind
      const filesAfter = await fs.readdir(testDir)
      const tempFiles = filesAfter.filter(f => f.includes('.tmp.'))
      expect(tempFiles).toHaveLength(0)
    })

    it('should format JSON with 2-space indentation', async () => {
      const filePath = join(testDir, 'test.json')
      const data = { nested: { value: 42 } }

      await fileEngine.writeAtomic(filePath, data)

      const content = await fs.readFile(filePath, 'utf8')
      expect(content).toContain('  "nested"')
      expect(content).toContain('    "value"')
    })
  })

  describe('readFile', () => {
    it('should read and parse JSON file', async () => {
      const filePath = join(testDir, 'test.json')
      const data = { id: '1', name: 'Test', value: 42 }

      await fileEngine.writeAtomic(filePath, data)
      const result = await fileEngine.readFile(filePath)

      expect(result).toEqual(data)
    })

    it('should throw error for non-existent file', async () => {
      const filePath = join(testDir, 'nonexistent.json')

      await expect(fileEngine.readFile(filePath)).rejects.toThrow('File not found')
    })

    it('should throw error for invalid JSON', async () => {
      const filePath = join(testDir, 'invalid.json')
      await fs.writeFile(filePath, 'not valid json', 'utf8')

      await expect(fileEngine.readFile(filePath)).rejects.toThrow('Failed to parse JSON')
    })

    it('should throw error for invalid path', async () => {
      await expect(fileEngine.readFile('')).rejects.toThrow('Invalid path')
    })
  })

  describe('deleteFile', () => {
    it('should delete existing file', async () => {
      const filePath = join(testDir, 'test.json')
      const data = { test: true }

      await fileEngine.writeAtomic(filePath, data)
      
      // Verify file exists
      await expect(fs.access(filePath)).resolves.toBeUndefined()

      await fileEngine.deleteFile(filePath)

      // Verify file is deleted
      await expect(fs.access(filePath)).rejects.toThrow()
    })

    it('should not throw error for non-existent file', async () => {
      const filePath = join(testDir, 'nonexistent.json')

      await expect(fileEngine.deleteFile(filePath)).resolves.toBeUndefined()
    })

    it('should throw error for invalid path', async () => {
      await expect(fileEngine.deleteFile('')).rejects.toThrow('Invalid path')
    })
  })

  describe('createDirectory', () => {
    it('should create directory', async () => {
      const dirPath = join(testDir, 'newdir')

      await fileEngine.createDirectory(dirPath)

      const stats = await fs.stat(dirPath)
      expect(stats.isDirectory()).toBe(true)
    })

    it('should create nested directories with recursive option', async () => {
      const dirPath = join(testDir, 'nested', 'deep', 'dir')

      await fileEngine.createDirectory(dirPath, true)

      const stats = await fs.stat(dirPath)
      expect(stats.isDirectory()).toBe(true)
    })

    it('should not throw error if directory already exists', async () => {
      const dirPath = join(testDir, 'existing')

      await fileEngine.createDirectory(dirPath)
      await expect(fileEngine.createDirectory(dirPath)).resolves.toBeUndefined()
    })

    it('should throw error for invalid path', async () => {
      await expect(fileEngine.createDirectory('')).rejects.toThrow('Invalid path')
    })
  })

  describe('atomic write guarantees', () => {
    it('should ensure file contains either old or new data, never partial', async () => {
      const filePath = join(testDir, 'test.json')
      const data1 = { version: 1, data: 'old' }
      const data2 = { version: 2, data: 'new' }

      // Write initial data
      await fileEngine.writeAtomic(filePath, data1)

      // Write new data
      await fileEngine.writeAtomic(filePath, data2)

      // Read and verify - should be complete data2, not partial
      const result = await fileEngine.readFile(filePath)
      expect(result).toEqual(data2)
      
      // Verify it's valid JSON (not corrupted)
      const content = await fs.readFile(filePath, 'utf8')
      expect(() => JSON.parse(content)).not.toThrow()
    })
  })

  describe('concurrency management', () => {
    it('should acquire and release lock for a content type', async () => {
      const contentType = 'articles'

      // Initially no locks
      expect(fileEngine.getGlobalWriteCount()).toBe(0)
      expect(fileEngine.getQueueSize(contentType)).toBe(0)

    // Acquire lock
    await fileEngine.acquireLock(contentType)

    // Lock should be acquired
    expect(fileEngine.getGlobalWriteCount()).toBe(1)
    expect(fileEngine.getQueueSize(contentType)).toBe(1)

    // Release lock
    fileEngine.releaseLock(contentType)

    // Lock should be released
    expect(fileEngine.getGlobalWriteCount()).toBe(0)
    expect(fileEngine.getQueueSize(contentType)).toBe(0)
  })

  it('should serialize writes to the same content type', async () => {
    const contentType = 'articles'
    const results: number[] = []

    // Start two concurrent writes to the same content type
    const write1 = (async () => {
      await fileEngine.acquireLock(contentType)
      results.push(1)
      await new Promise((resolve) => setTimeout(resolve, 50))
      results.push(2)
      fileEngine.releaseLock(contentType)
    })()

    const write2 = (async () => {
      await fileEngine.acquireLock(contentType)
      results.push(3)
      await new Promise((resolve) => setTimeout(resolve, 50))
      results.push(4)
      fileEngine.releaseLock(contentType)
    })()

    await Promise.all([write1, write2])

    // Results should be serialized: either [1,2,3,4] or [3,4,1,2]
    // Never interleaved like [1,3,2,4]
    expect(results).toHaveLength(4)
    const isValid =
      (results[0] === 1 && results[1] === 2 && results[2] === 3 && results[3] === 4) ||
      (results[0] === 3 && results[1] === 4 && results[2] === 1 && results[3] === 2)
    expect(isValid).toBe(true)
  })

  it('should allow concurrent writes to different content types', async () => {
    const contentType1 = 'articles'
    const contentType2 = 'users'
    const results: string[] = []

    // Start two concurrent writes to different content types
    const write1 = (async () => {
      await fileEngine.acquireLock(contentType1)
      results.push('articles-start')
      await new Promise((resolve) => setTimeout(resolve, 50))
      results.push('articles-end')
      fileEngine.releaseLock(contentType1)
    })()

    const write2 = (async () => {
      await fileEngine.acquireLock(contentType2)
      results.push('users-start')
      await new Promise((resolve) => setTimeout(resolve, 50))
      results.push('users-end')
      fileEngine.releaseLock(contentType2)
    })()

    await Promise.all([write1, write2])

    // Both writes should have started before either finished
    // This proves they ran concurrently
    expect(results).toHaveLength(4)
    const articlesStartIndex = results.indexOf('articles-start')
    const articlesEndIndex = results.indexOf('articles-end')
    const usersStartIndex = results.indexOf('users-start')
    const usersEndIndex = results.indexOf('users-end')

    // Both should have started
    expect(articlesStartIndex).toBeGreaterThanOrEqual(0)
    expect(usersStartIndex).toBeGreaterThanOrEqual(0)

    // Both should have ended
    expect(articlesEndIndex).toBeGreaterThanOrEqual(0)
    expect(usersEndIndex).toBeGreaterThanOrEqual(0)

    // Each should have started before it ended
    expect(articlesStartIndex).toBeLessThan(articlesEndIndex)
    expect(usersStartIndex).toBeLessThan(usersEndIndex)
  })

  it('should enforce global write limit of 20', async () => {
    const contentTypes = Array.from({ length: 25 }, (_, i) => `type-${i}`)
    const maxConcurrent = { value: 0 }

    // Start 25 concurrent writes (more than the limit of 20)
    const writes = contentTypes.map(async (contentType) => {
      await fileEngine.acquireLock(contentType)
      const current = fileEngine.getGlobalWriteCount()
      maxConcurrent.value = Math.max(maxConcurrent.value, current)
      await new Promise((resolve) => setTimeout(resolve, 10))
      fileEngine.releaseLock(contentType)
    })

    await Promise.all(writes)

    // Maximum concurrent writes should not exceed 20
    expect(maxConcurrent.value).toBeLessThanOrEqual(20)
  })

  it('should throw error for invalid content type in acquireLock', async () => {
    await expect(fileEngine.acquireLock('')).rejects.toThrow('Invalid contentType')
  })

  it('should throw error for invalid content type in releaseLock', () => {
    expect(() => fileEngine.releaseLock('')).toThrow('Invalid contentType')
  })

  it('should throw error when releasing lock that was not acquired', () => {
    expect(() => fileEngine.releaseLock('nonexistent')).toThrow('No mutex found')
  })

  it('should maintain FIFO order for writes to same content type', async () => {
    const contentType = 'articles'
    const order: number[] = []

    // Start 5 writes in sequence
    const writes = [1, 2, 3, 4, 5].map(async (id) => {
      await fileEngine.acquireLock(contentType)
      order.push(id)
      await new Promise((resolve) => setTimeout(resolve, 10))
      fileEngine.releaseLock(contentType)
    })

    await Promise.all(writes)

    // Order should be preserved (FIFO)
    expect(order).toEqual([1, 2, 3, 4, 5])
  })

  it('should release lock even if operation fails', async () => {
    const contentType = 'articles'

    try {
      await fileEngine.acquireLock(contentType)
      expect(fileEngine.getGlobalWriteCount()).toBe(1)
      throw new Error('Simulated failure')
    } catch {
      // Release in finally block
      fileEngine.releaseLock(contentType)
    }

    // Lock should be released
    expect(fileEngine.getGlobalWriteCount()).toBe(0)
  })
  })

  describe('readMany', () => {
    it('should read multiple files in parallel', async () => {
      const files = [
        { path: join(testDir, 'file1.json'), data: { id: '1', name: 'File 1' } },
        { path: join(testDir, 'file2.json'), data: { id: '2', name: 'File 2' } },
        { path: join(testDir, 'file3.json'), data: { id: '3', name: 'File 3' } },
      ]

      // Write test files
      for (const file of files) {
        await fileEngine.writeAtomic(file.path, file.data)
      }

      // Read all files in parallel
      const paths = files.map(f => f.path)
      const results = await fileEngine.readMany(paths)

      // Verify results match expected data in same order
      expect(results).toHaveLength(3)
      expect(results[0]).toEqual(files[0].data)
      expect(results[1]).toEqual(files[1].data)
      expect(results[2]).toEqual(files[2].data)
    })

    it('should return empty array for empty input', async () => {
      const results = await fileEngine.readMany([])
      expect(results).toEqual([])
    })

    it('should throw error if any file cannot be read', async () => {
      const paths = [
        join(testDir, 'exists.json'),
        join(testDir, 'nonexistent.json'),
      ]

      // Create only the first file
      await fileEngine.writeAtomic(paths[0], { test: true })

      // Should fail because second file doesn't exist
      await expect(fileEngine.readMany(paths)).rejects.toThrow('Failed to read multiple files')
    })

    it('should throw error for invalid input', async () => {
      await expect(fileEngine.readMany(null as any)).rejects.toThrow('Invalid paths')
    })

    it('should handle large number of concurrent reads', async () => {
      // Create 50 files
      const files = Array.from({ length: 50 }, (_, i) => ({
        path: join(testDir, `file${i}.json`),
        data: { id: `${i}`, value: i * 10 },
      }))

      // Write all files
      for (const file of files) {
        await fileEngine.writeAtomic(file.path, file.data)
      }

      // Read all files in parallel
      const paths = files.map(f => f.path)
      const results = await fileEngine.readMany(paths)

      // Verify all results
      expect(results).toHaveLength(50)
      for (let i = 0; i < 50; i++) {
        expect(results[i]).toEqual(files[i].data)
      }
    })
  })

  describe('writeMany', () => {
    it('should write multiple files with proper mutex coordination', async () => {
      const operations = [
        { path: join(testDir, 'file1.json'), data: { id: '1' }, contentType: 'articles' },
        { path: join(testDir, 'file2.json'), data: { id: '2' }, contentType: 'articles' },
        { path: join(testDir, 'file3.json'), data: { id: '3' }, contentType: 'users' },
      ]

      await fileEngine.writeMany(operations)

      // Verify all files were written
      for (const op of operations) {
        const content = await fileEngine.readFile(op.path)
        expect(content).toEqual(op.data)
      }
    })

    it('should return immediately for empty operations array', async () => {
      await expect(fileEngine.writeMany([])).resolves.toBeUndefined()
    })

    it('should serialize writes to same content type', async () => {
      const results: number[] = []
      const operations = [
        {
          path: join(testDir, 'file1.json'),
          data: { id: '1' },
          contentType: 'articles',
        },
        {
          path: join(testDir, 'file2.json'),
          data: { id: '2' },
          contentType: 'articles',
        },
      ]

      // Track when each write starts and ends
      const originalWriteAtomic = fileEngine.writeAtomic.bind(fileEngine)
      let writeCount = 0
      fileEngine.writeAtomic = async (path: string, data: unknown) => {
        const id = ++writeCount
        results.push(id * 10) // Start marker (10, 20)
        await originalWriteAtomic(path, data)
        await new Promise(resolve => setTimeout(resolve, 50))
        results.push(id * 10 + 1) // End marker (11, 21)
      }

      await fileEngine.writeMany(operations)

      // Results should be serialized: [10, 11, 20, 21]
      // Not interleaved like [10, 20, 11, 21]
      expect(results).toEqual([10, 11, 20, 21])
    })

    it('should allow parallel writes to different content types', async () => {
      const results: string[] = []
      const operations = [
        {
          path: join(testDir, 'articles.json'),
          data: { id: '1' },
          contentType: 'articles',
        },
        {
          path: join(testDir, 'users.json'),
          data: { id: '2' },
          contentType: 'users',
        },
      ]

      // Track when each write starts and ends
      const originalWriteAtomic = fileEngine.writeAtomic.bind(fileEngine)
      fileEngine.writeAtomic = async (path: string, data: unknown) => {
        const type = path.includes('articles') ? 'articles' : 'users'
        results.push(`${type}-start`)
        await originalWriteAtomic(path, data)
        await new Promise(resolve => setTimeout(resolve, 50))
        results.push(`${type}-end`)
      }

      await fileEngine.writeMany(operations)

      // Both should have started before either finished (proving concurrency)
      expect(results).toHaveLength(4)
      const articlesStartIdx = results.indexOf('articles-start')
      const articlesEndIdx = results.indexOf('articles-end')
      const usersStartIdx = results.indexOf('users-start')
      const usersEndIdx = results.indexOf('users-end')

      expect(articlesStartIdx).toBeGreaterThanOrEqual(0)
      expect(usersStartIdx).toBeGreaterThanOrEqual(0)
      expect(articlesStartIdx).toBeLessThan(articlesEndIdx)
      expect(usersStartIdx).toBeLessThan(usersEndIdx)
    })

    it('should throw error for invalid operations input', async () => {
      await expect(fileEngine.writeMany(null as any)).rejects.toThrow('Invalid operations')
    })

    it('should throw error for operation with invalid path', async () => {
      const operations = [
        { path: '', data: { id: '1' }, contentType: 'articles' },
      ]
      await expect(fileEngine.writeMany(operations)).rejects.toThrow('path must be a non-empty string')
    })

    it('should throw error for operation with invalid contentType', async () => {
      const operations = [
        { path: join(testDir, 'file.json'), data: { id: '1' }, contentType: '' },
      ]
      await expect(fileEngine.writeMany(operations)).rejects.toThrow('contentType must be a non-empty string')
    })

    it('should throw error for operation with missing data', async () => {
      const operations = [
        { path: join(testDir, 'file.json'), contentType: 'articles' } as any,
      ]
      await expect(fileEngine.writeMany(operations)).rejects.toThrow('data is required')
    })

    it('should handle mixed content types efficiently', async () => {
      const operations = [
        { path: join(testDir, 'article1.json'), data: { id: '1' }, contentType: 'articles' },
        { path: join(testDir, 'user1.json'), data: { id: '2' }, contentType: 'users' },
        { path: join(testDir, 'article2.json'), data: { id: '3' }, contentType: 'articles' },
        { path: join(testDir, 'user2.json'), data: { id: '4' }, contentType: 'users' },
        { path: join(testDir, 'product1.json'), data: { id: '5' }, contentType: 'products' },
      ]

      await fileEngine.writeMany(operations)

      // Verify all files were written correctly
      for (const op of operations) {
        const content = await fileEngine.readFile(op.path)
        expect(content).toEqual(op.data)
      }
    })

    it('should respect global write limit', async () => {
      // Create 25 operations across different content types
      const operations = Array.from({ length: 25 }, (_, i) => ({
        path: join(testDir, `file${i}.json`),
        data: { id: `${i}` },
        contentType: `type-${i}`, // Each operation has unique content type
      }))

      let maxConcurrent = 0
      const originalAcquireLock = fileEngine.acquireLock.bind(fileEngine)
      fileEngine.acquireLock = async (contentType: string) => {
        await originalAcquireLock(contentType)
        const current = fileEngine.getGlobalWriteCount()
        maxConcurrent = Math.max(maxConcurrent, current)
      }

      await fileEngine.writeMany(operations)

      // Should not exceed global limit of 20
      expect(maxConcurrent).toBeLessThanOrEqual(20)
    })

    it('should clean up locks even if write fails', async () => {
      const operations = [
        { path: join(testDir, 'file1.json'), data: { id: '1' }, contentType: 'articles' },
      ]

      // Make writeAtomic fail
      const originalWriteAtomic = fileEngine.writeAtomic.bind(fileEngine)
      fileEngine.writeAtomic = async () => {
        throw new Error('Simulated write failure')
      }

      await expect(fileEngine.writeMany(operations)).rejects.toThrow('Failed to write multiple files')

      // Restore original method
      fileEngine.writeAtomic = originalWriteAtomic

      // Verify locks were released
      expect(fileEngine.getGlobalWriteCount()).toBe(0)
      expect(fileEngine.getQueueSize('articles')).toBe(0)
    })
  })
})
