import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import * as fc from 'fast-check'
import { FileEngine } from './file-engine'

/**
 * Property-based tests for FileEngine
 * 
 * These tests validate universal correctness properties using fast-check
 * to generate random test cases.
 */
describe('FileEngine - Property-Based Tests', () => {
  let fileEngine: FileEngine
  let testDir: string

  beforeEach(async () => {
    fileEngine = new FileEngine()
    // Create a unique test directory for each test
    testDir = join(
      process.cwd(),
      'test-data',
      `pbt-${Date.now()}-${Math.random().toString(36).substring(2)}`
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
   * Property P1: Atomic Write Consistency
   * 
   * **Validates: Requirements 1.6, 12.8, 12.9, NFR-10**
   * 
   * For any file path and data, when an atomic write operation is performed,
   * reading the file afterward returns either the new data or the previous data,
   * never partial or corrupted data.
   */
  describe('P1: Atomic Write Consistency', () => {
    it('should ensure reads return complete data, never partial or corrupted', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary JSON-serializable data
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            name: fc.string({ maxLength: 100 }),
            value: fc.integer(),
            nested: fc.record({
              flag: fc.boolean(),
              items: fc.array(fc.string(), { maxLength: 10 })
            }),
            timestamp: fc.date().map(d => d.toISOString())
          }),
          // Generate a file name
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => !s.includes('/') && !s.includes('\\') && !s.includes('\0'))
            .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '_')),
          async (data, fileName) => {
            const filePath = join(testDir, `${fileName}.json`)

            // Write data atomically
            await fileEngine.writeAtomic(filePath, data)

            // Read the file back
            const readData = await fileEngine.readFile(filePath)

            // Property: The read data must exactly match the written data
            expect(readData).toEqual(data)

            // Property: The file must contain valid JSON (not corrupted)
            const rawContent = await fs.readFile(filePath, 'utf8')
            const parsedContent = JSON.parse(rawContent)
            expect(parsedContent).toEqual(data)
          }
        ),
        { numRuns: 10 }
      )
    })

    it('should ensure sequential writes maintain atomicity', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate an array of data objects to write sequentially
          fc.array(
            fc.record({
              version: fc.integer({ min: 1, max: 1000 }),
              content: fc.string({ maxLength: 200 }),
              metadata: fc.record({
                author: fc.string({ maxLength: 50 }),
                tags: fc.array(fc.string({ maxLength: 20 }), { maxLength: 5 })
              })
            }),
            { minLength: 2, maxLength: 10 }
          ),
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => !s.includes('/') && !s.includes('\\') && !s.includes('\0'))
            .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '_')),
          async (dataArray, fileName) => {
            const filePath = join(testDir, `${fileName}.json`)

            // Write each data object sequentially
            for (const data of dataArray) {
              await fileEngine.writeAtomic(filePath, data)

              // After each write, verify the file contains complete, valid data
              const readData = await fileEngine.readFile(filePath)
              
              // Property: Read data must be valid JSON-serializable object
              expect(readData).toBeDefined()
              expect(typeof readData).toBe('object')
              
              // Property: The file content must be parseable JSON
              const rawContent = await fs.readFile(filePath, 'utf8')
              expect(() => JSON.parse(rawContent)).not.toThrow()
            }

            // Final verification: file should contain the last written data
            const finalData = await fileEngine.readFile(filePath)
            expect(finalData).toEqual(dataArray[dataArray.length - 1])
          }
        ),
        { numRuns: 5 }
      )
    })

    it('should handle write failures without leaving partial data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            value: fc.integer()
          }),
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => !s.includes('/') && !s.includes('\\') && !s.includes('\0'))
            .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '_')),
          async (initialData, fileName) => {
            const filePath = join(testDir, `${fileName}.json`)

            // Write initial valid data
            await fileEngine.writeAtomic(filePath, initialData)

            // Verify initial data is written correctly
            const beforeFailure = await fileEngine.readFile(filePath)
            expect(beforeFailure).toEqual(initialData)

            // Attempt to write non-serializable data (should fail)
            const circular: any = { data: initialData }
            circular.self = circular

            try {
              await fileEngine.writeAtomic(filePath, circular)
            } catch {
              // Expected to fail
            }

            // Property: After a failed write, the file should still contain
            // the previous valid data (not partial or corrupted)
            const afterFailure = await fileEngine.readFile(filePath)
            expect(afterFailure).toEqual(initialData)

            // Property: No temp files should be left behind
            const files = await fs.readdir(testDir)
            const tempFiles = files.filter(f => f.includes('.tmp.'))
            expect(tempFiles).toHaveLength(0)
          }
        ),
        { numRuns: 5 }
      )
    })

    it('should maintain atomicity with nested directory structures', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            id: fc.uuid(),
            data: fc.string({ maxLength: 100 })
          }),
          // Generate nested path components
          fc.array(
            fc.string({ minLength: 1, maxLength: 10 })
              .filter(s => !s.includes('/') && !s.includes('\\') && !s.includes('\0'))
              .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '_')),
            { minLength: 1, maxLength: 5 }
          ),
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => !s.includes('/') && !s.includes('\\') && !s.includes('\0'))
            .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '_')),
          async (data, pathComponents, fileName) => {
            const nestedPath = join(testDir, ...pathComponents)
            const filePath = join(nestedPath, `${fileName}.json`)

            // Write data to nested path (should create directories)
            await fileEngine.writeAtomic(filePath, data)

            // Property: File should exist and contain correct data
            const readData = await fileEngine.readFile(filePath)
            expect(readData).toEqual(data)

            // Property: All parent directories should exist
            const stats = await fs.stat(nestedPath)
            expect(stats.isDirectory()).toBe(true)

            // Property: File content should be valid JSON
            const rawContent = await fs.readFile(filePath, 'utf8')
            const parsedContent = JSON.parse(rawContent)
            expect(parsedContent).toEqual(data)
          }
        ),
        { numRuns: 5 }
      )
    })

    it('should handle concurrent writes to different files atomically', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate multiple data objects for concurrent writes
          fc.array(
            fc.record({
              fileName: fc.string({ minLength: 1, maxLength: 20 })
                .filter(s => !s.includes('/') && !s.includes('\\') && !s.includes('\0'))
                .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '_')),
              data: fc.record({
                id: fc.uuid(),
                value: fc.integer(),
                text: fc.string({ maxLength: 100 })
              })
            }),
            { minLength: 2, maxLength: 10 }
          ),
          async (writeOperations) => {
            // Ensure unique file names
            const uniqueOps = Array.from(
              new Map(writeOperations.map(op => [op.fileName, op])).values()
            )

            if (uniqueOps.length < 2) {
              // Skip if we don't have at least 2 unique files
              return
            }

            // Write all files concurrently
            await Promise.all(
              uniqueOps.map(op =>
                fileEngine.writeAtomic(join(testDir, `${op.fileName}.json`), op.data)
              )
            )

            // Property: All files should exist and contain correct data
            for (const op of uniqueOps) {
              const filePath = join(testDir, `${op.fileName}.json`)
              const readData = await fileEngine.readFile(filePath)
              expect(readData).toEqual(op.data)

              // Property: Each file should contain valid JSON
              const rawContent = await fs.readFile(filePath, 'utf8')
              const parsedContent = JSON.parse(rawContent)
              expect(parsedContent).toEqual(op.data)
            }

            // Property: No temp files should remain
            const files = await fs.readdir(testDir)
            const tempFiles = files.filter(f => f.includes('.tmp.'))
            expect(tempFiles).toHaveLength(0)
          }
        ),
        { numRuns: 5 }
      )
    })
  })

  /**
   * Property P2: Write Serialization
   * 
   * **Validates: Requirements 1.7, 10.3, NFR-11**
   * 
   * For any content type and set of concurrent write operations, the final state
   * is equivalent to some sequential execution of those operations.
   * 
   * This property ensures:
   * - Writes to the same content type are serialized (one at a time)
   * - No race conditions or data corruption from concurrent writes
   * - The final state is consistent with some valid ordering of operations
   * - Mutex exclusivity is maintained (at most one write per content type at a time)
   */
  describe('P2: Write Serialization', () => {
    it('should serialize concurrent writes to the same content type', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a content type name
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => !s.includes('/') && !s.includes('\\') && !s.includes('\0'))
            .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '_')),
          // Generate multiple write operations (each with a unique version number)
          fc.array(
            fc.record({
              id: fc.uuid(),
              version: fc.integer({ min: 1, max: 10000 }),
              data: fc.string({ maxLength: 100 }),
              timestamp: fc.date().map(d => d.toISOString())
            }),
            { minLength: 5, maxLength: 20 }
          ),
          async (contentType, writeOps) => {
            // Ensure unique version numbers for tracking order
            const uniqueOps = writeOps.map((op, index) => ({
              ...op,
              version: index + 1 // Sequential version numbers
            }))

            const filePath = join(testDir, contentType, 'entry.json')

            // Track the order in which writes complete
            const completionOrder: number[] = []

            // Execute all writes concurrently
            await Promise.all(
              uniqueOps.map(async (op) => {
                // Acquire lock for this content type
                await fileEngine.acquireLock(contentType)
                
                try {
                  // Write the data
                  await fileEngine.writeAtomic(filePath, op)
                  
                  // Record completion order
                  completionOrder.push(op.version)
                } finally {
                  // Always release lock
                  fileEngine.releaseLock(contentType)
                }
              })
            )

            // Property 1: All writes should have completed
            expect(completionOrder).toHaveLength(uniqueOps.length)

            // Property 2: The final file should contain data from one of the write operations
            const finalData = await fileEngine.readFile(filePath) as any
            const matchingOp = uniqueOps.find(op => 
              op.id === finalData.id && 
              op.version === finalData.version &&
              op.data === finalData.data
            )
            expect(matchingOp).toBeDefined()

            // Property 3: The final state should be the last write that completed
            expect(finalData.version).toBe(completionOrder[completionOrder.length - 1])

            // Property 4: No temp files should remain
            const files = await fs.readdir(join(testDir, contentType))
            const tempFiles = files.filter(f => f.includes('.tmp.'))
            expect(tempFiles).toHaveLength(0)
          }
        ),
        { numRuns: 5 }
      )
    })

    it('should maintain mutex exclusivity during concurrent writes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => !s.includes('/') && !s.includes('\\') && !s.includes('\0'))
            .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '_')),
          fc.integer({ min: 3, max: 10 }),
          async (contentType, numWrites) => {
            const filePath = join(testDir, contentType, 'test.json')
            
            // Track concurrent access
            let currentlyWriting = 0
            let maxConcurrent = 0
            const violations: string[] = []

            // Execute concurrent writes
            await Promise.all(
              Array.from({ length: numWrites }, async (_, i) => {
                await fileEngine.acquireLock(contentType)
                
                try {
                  // Increment counter
                  currentlyWriting++
                  maxConcurrent = Math.max(maxConcurrent, currentlyWriting)
                  
                  // Property: At most one write should be in progress
                  if (currentlyWriting > 1) {
                    violations.push(`Multiple concurrent writes detected: ${currentlyWriting}`)
                  }
                  
                  // Simulate write operation
                  await fileEngine.writeAtomic(filePath, { 
                    writeNumber: i,
                    timestamp: Date.now()
                  })
                  
                  // Small delay to increase chance of detecting race conditions
                  await new Promise(resolve => setTimeout(resolve, 5))
                  
                } finally {
                  // Decrement counter
                  currentlyWriting--
                  fileEngine.releaseLock(contentType)
                }
              })
            )

            // Property: No violations should have occurred
            expect(violations).toHaveLength(0)
            
            // Property: Maximum concurrent writes should be 1
            expect(maxConcurrent).toBe(1)
            
            // Property: All writes should have completed (counter back to 0)
            expect(currentlyWriting).toBe(0)
          }
        ),
        { numRuns: 5 }
      )
    })

    it('should allow concurrent writes to different content types', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate multiple content types
          fc.array(
            fc.string({ minLength: 1, maxLength: 20 })
              .filter(s => !s.includes('/') && !s.includes('\\') && !s.includes('\0'))
              .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '_')),
            { minLength: 2, maxLength: 5 }
          ),
          fc.integer({ min: 2, max: 5 }),
          async (contentTypes, writesPerType) => {
            // Ensure unique content types
            const uniqueTypes = Array.from(new Set(contentTypes))
            if (uniqueTypes.length < 2) {
              return // Skip if we don't have at least 2 unique types
            }

            // Create a unique subdirectory for this iteration
            const iterationDir = join(testDir, `iter-${Date.now()}-${Math.random().toString(36).substring(2)}`)
            await fs.mkdir(iterationDir, { recursive: true })

            const startTime = Date.now()
            const writeResults: Array<{ contentType: string; duration: number }> = []

            // Execute writes to different content types concurrently
            await Promise.all(
              uniqueTypes.map(async (contentType) => {
                const writeStart = Date.now()
                
                // Perform multiple writes to this content type
                for (let i = 0; i < writesPerType; i++) {
                  await fileEngine.acquireLock(contentType)
                  
                  try {
                    const filePath = join(iterationDir, contentType, `entry-${i}.json`)
                    await fileEngine.writeAtomic(filePath, {
                      contentType,
                      writeNumber: i,
                      timestamp: Date.now()
                    })
                  } finally {
                    fileEngine.releaseLock(contentType)
                  }
                }
                
                const writeDuration = Date.now() - writeStart
                writeResults.push({ contentType, duration: writeDuration })
              })
            )

            const totalDuration = Date.now() - startTime

            // Property: All writes should have completed
            expect(writeResults).toHaveLength(uniqueTypes.length)

            // Property: Each content type should have all its files
            for (const contentType of uniqueTypes) {
              const dir = join(iterationDir, contentType)
              try {
                const files = await fs.readdir(dir)
                const jsonFiles = files.filter(f => f.endsWith('.json') && !f.includes('.tmp.'))
                expect(jsonFiles).toHaveLength(writesPerType)
              } catch (error) {
                // If directory doesn't exist, that's a failure
                throw new Error(`Directory not found for content type ${contentType}: ${error}`)
              }
            }

            // Property: Concurrent execution should be faster than sequential
            // (total time should be less than sum of individual times)
            const sumOfDurations = writeResults.reduce((sum, r) => sum + r.duration, 0)
            // Allow some overhead, but should still show parallelism benefit
            expect(totalDuration).toBeLessThan(sumOfDurations * 0.9)
          }
        ),
        { numRuns: 3 }
      )
    })

    it('should respect global write limit across all content types', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate multiple content types
          fc.array(
            fc.string({ minLength: 1, maxLength: 20 })
              .filter(s => !s.includes('/') && !s.includes('\\') && !s.includes('\0'))
              .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '_')),
            { minLength: 3, maxLength: 10 }
          ),
          async (contentTypes) => {
            // Ensure unique content types
            const uniqueTypes = Array.from(new Set(contentTypes))
            if (uniqueTypes.length < 3) {
              return // Skip if we don't have at least 3 unique types
            }

            let maxGlobalWrites = 0
            const globalWriteSnapshots: number[] = []

            // Execute many concurrent writes across different content types
            await Promise.all(
              uniqueTypes.flatMap((contentType, typeIndex) =>
                Array.from({ length: 3 }, async (_, writeIndex) => {
                  await fileEngine.acquireLock(contentType)
                  
                  try {
                    // Capture global write count
                    const currentGlobal = fileEngine.getGlobalWriteCount()
                    globalWriteSnapshots.push(currentGlobal)
                    maxGlobalWrites = Math.max(maxGlobalWrites, currentGlobal)
                    
                    const filePath = join(testDir, contentType, `entry-${writeIndex}.json`)
                    await fileEngine.writeAtomic(filePath, {
                      contentType,
                      typeIndex,
                      writeIndex,
                      timestamp: Date.now()
                    })
                    
                    // Small delay to increase observation window
                    await new Promise(resolve => setTimeout(resolve, 5))
                  } finally {
                    fileEngine.releaseLock(contentType)
                  }
                })
              )
            )

            // Property: Global write count should never exceed MAX_CONCURRENT_WRITES (20)
            expect(maxGlobalWrites).toBeLessThanOrEqual(20)
            
            // Property: All global write snapshots should be within limit
            for (const snapshot of globalWriteSnapshots) {
              expect(snapshot).toBeLessThanOrEqual(20)
              expect(snapshot).toBeGreaterThanOrEqual(0)
            }

            // Property: Final global write count should be 0 (all released)
            expect(fileEngine.getGlobalWriteCount()).toBe(0)
          }
        ),
        { numRuns: 3 }
      )
    })

    it('should handle lock release even when write fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => !s.includes('/') && !s.includes('\\') && !s.includes('\0'))
            .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '_')),
          fc.integer({ min: 3, max: 8 }),
          async (contentType, numWrites) => {
            const results: Array<{ success: boolean; error?: string }> = []

            // Execute writes where some will fail
            await Promise.all(
              Array.from({ length: numWrites }, async (_, i) => {
                await fileEngine.acquireLock(contentType)
                
                try {
                  const filePath = join(testDir, contentType, `entry-${i}.json`)
                  
                  // Every third write attempts to write non-serializable data
                  if (i % 3 === 0) {
                    const circular: any = { index: i }
                    circular.self = circular
                    
                    try {
                      await fileEngine.writeAtomic(filePath, circular)
                      results.push({ success: true })
                    } catch (error) {
                      results.push({ 
                        success: false, 
                        error: error instanceof Error ? error.message : String(error)
                      })
                    }
                  } else {
                    // Normal write
                    await fileEngine.writeAtomic(filePath, { index: i, data: 'valid' })
                    results.push({ success: true })
                  }
                } finally {
                  // Always release lock
                  fileEngine.releaseLock(contentType)
                }
              })
            )

            // Property: All operations should have completed (success or failure)
            expect(results).toHaveLength(numWrites)

            // Property: Some writes should have failed (the circular reference ones)
            const failures = results.filter(r => !r.success)
            expect(failures.length).toBeGreaterThan(0)

            // Property: Some writes should have succeeded
            const successes = results.filter(r => r.success)
            expect(successes.length).toBeGreaterThan(0)

            // Property: Global write count should be 0 (all locks released)
            expect(fileEngine.getGlobalWriteCount()).toBe(0)

            // Property: Queue size should be 0 (all operations completed)
            expect(fileEngine.getQueueSize(contentType)).toBe(0)
          }
        ),
        { numRuns: 5 }
      )
    })

    it('should maintain FIFO ordering within a content type', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => !s.includes('/') && !s.includes('\\') && !s.includes('\0'))
            .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '_')),
          fc.integer({ min: 5, max: 15 }),
          async (contentType, numWrites) => {
            const filePath = join(testDir, contentType, 'sequence.json')
            const acquisitionOrder: number[] = []
            const completionOrder: number[] = []

            // Execute writes concurrently
            await Promise.all(
              Array.from({ length: numWrites }, async (_, i) => {
                // Record when we start waiting for the lock
                const requestTime = Date.now()
                
                await fileEngine.acquireLock(contentType)
                
                // Record acquisition order
                acquisitionOrder.push(i)
                
                try {
                  // Write with sequence number
                  await fileEngine.writeAtomic(filePath, {
                    sequence: i,
                    requestTime,
                    acquireTime: Date.now()
                  })
                  
                  // Small delay
                  await new Promise(resolve => setTimeout(resolve, 2))
                  
                  // Record completion
                  completionOrder.push(i)
                } finally {
                  fileEngine.releaseLock(contentType)
                }
              })
            )

            // Property: All writes should have completed
            expect(acquisitionOrder).toHaveLength(numWrites)
            expect(completionOrder).toHaveLength(numWrites)

            // Property: Acquisition order should match completion order
            // (FIFO queue ensures this)
            expect(completionOrder).toEqual(acquisitionOrder)

            // Property: Final file should contain the last write
            const finalData = await fileEngine.readFile(filePath) as any
            expect(finalData.sequence).toBe(completionOrder[completionOrder.length - 1])

            // Property: All operations should be complete (no pending locks)
            expect(fileEngine.getGlobalWriteCount()).toBe(0)
            expect(fileEngine.getQueueSize(contentType)).toBe(0)
          }
        ),
        { numRuns: 5 }
      )
    })
  })
})
