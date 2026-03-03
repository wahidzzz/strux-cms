import { promises as fs } from 'fs'
import { dirname } from 'path'
import type { WriteOperation } from '../types/index.js'

/**
 * AsyncMutex provides mutual exclusion for async operations.
 *
 * Ensures only one operation can hold the lock at a time.
 * Operations wait in a FIFO queue for their turn.
 */
class AsyncMutex {
  private locked = false
  private waitQueue: Array<() => void> = []

  /**
   * Acquire the mutex lock.
   * If the lock is already held, waits until it's released.
   *
   * @returns Promise that resolves when the lock is acquired
   */
  async acquire(): Promise<void> {
    // If not locked, acquire immediately
    if (!this.locked) {
      this.locked = true
      return
    }

    // Otherwise, wait in queue
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve)
    })
  }

  /**
   * Release the mutex lock.
   * If there are waiting operations, the next one in queue acquires the lock.
   */
  release(): void {
    // If there are waiting operations, give lock to next in queue
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!
      next() // Resolve the waiting promise
    } else {
      // No one waiting, unlock
      this.locked = false
    }
  }

  /**
   * Check if the mutex is currently locked.
   *
   * @returns true if locked, false otherwise
   */
  isLocked(): boolean {
    return this.locked
  }
}

/**
 * FileEngine manages all file system operations with atomic writes and concurrency control.
 *
 * Key features:
 * - Atomic writes using temp file + fsync + rename pattern
 * - Per-content-type async mutex for write serialization
 * - Global write limit (max 20 concurrent writes across all content types)
 * - JSON serialization and parsing with error handling
 * - Directory creation with recursive option
 * - Cleanup on errors
 *
 * Validates: Requirements 1.6, 1.7, 10.3, 10.5, 12.8, 12.9
 */
export class FileEngine {
  private mutexes: Map<string, AsyncMutex> = new Map()
  private writeQueues: Map<string, number> = new Map()
  private globalWriteCount: number = 0
  private readonly MAX_CONCURRENT_WRITES = 20

  /**
   * Acquire a write lock for a specific content type.
   *
   * This ensures:
   * - Only one write per content type at a time (mutual exclusion)
   * - Maximum 20 concurrent writes across all content types (global limit)
   * - FIFO ordering within each content type (fairness)
   *
   * Algorithm:
   * 1. Get or create mutex for content type
   * 2. Increment queue counter for this content type
   * 3. Wait for global write limit (if at capacity)
   * 4. Acquire mutex (wait if another write is in progress for this type)
   * 5. Increment global write counter
   *
   * @param contentType - The content type to lock (e.g., "articles", "users")
   * @throws Error if contentType is invalid
   */
  /**
     * Acquire a write lock for a specific content type.
     *
     * This ensures:
     * - Only one write per content type at a time (mutual exclusion)
     * - Maximum 20 concurrent writes across all content types (global limit)
     * - FIFO ordering within each content type (fairness)
     *
     * Algorithm:
     * 1. Get or create mutex for content type
     * 2. Increment queue counter for this content type
     * 3. Acquire mutex (wait if another write is in progress for this type)
     * 4. Wait for global write limit (if at capacity)
     * 5. Increment global write counter
     *
     * @param contentType - The content type to lock (e.g., "articles", "users")
     * @throws Error if contentType is invalid
     */
    async acquireLock(contentType: string): Promise<void> {
      // Validate input
      if (!contentType || typeof contentType !== 'string') {
        throw new Error('Invalid contentType: must be a non-empty string')
      }

      // Step 1: Get or create mutex for content type
      if (!this.mutexes.has(contentType)) {
        this.mutexes.set(contentType, new AsyncMutex())
      }
      const mutex = this.mutexes.get(contentType)!

      // Step 2: Increment queue counter
      const queueSize = (this.writeQueues.get(contentType) || 0) + 1
      this.writeQueues.set(contentType, queueSize)

      // Step 3: Acquire mutex (wait if another write is in progress)
      await mutex.acquire()

      // Step 4: Wait for global write limit (after acquiring mutex)
      while (this.globalWriteCount >= this.MAX_CONCURRENT_WRITES) {
        await this.sleep(10) // Back off and retry
      }

      // Step 5: Increment global write counter
      this.globalWriteCount++
    }

  /**
   * Release a write lock for a specific content type.
   *
   * This must be called after acquireLock, even if the write operation fails.
   * Typically used in a try-finally block to ensure cleanup.
   *
   * Algorithm:
   * 1. Get mutex for content type
   * 2. Release mutex (allows next waiting write to proceed)
   * 3. Decrement global write counter
   * 4. Decrement queue counter for this content type
   *
   * @param contentType - The content type to unlock
   * @throws Error if contentType is invalid or lock was not acquired
   */
  releaseLock(contentType: string): void {
    // Validate input
    if (!contentType || typeof contentType !== 'string') {
      throw new Error('Invalid contentType: must be a non-empty string')
    }

    // Get mutex for content type
    const mutex = this.mutexes.get(contentType)
    if (!mutex) {
      throw new Error(`No mutex found for contentType: ${contentType}`)
    }

    // Get current queue size
    const queueSize = this.writeQueues.get(contentType) || 0

    // Release mutex (allows next waiting write to proceed)
    mutex.release()

    // Decrement global write counter
    this.globalWriteCount--

    // Decrement queue counter
    this.writeQueues.set(contentType, Math.max(0, queueSize - 1))
  }

  /**
   * Helper method to sleep for a specified duration.
   * Used for backoff when waiting for global write limit.
   *
   * @param ms - Milliseconds to sleep
   * @returns Promise that resolves after the specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Get the current number of concurrent writes across all content types.
   * Useful for monitoring and testing.
   *
   * @returns Current global write count
   */
  getGlobalWriteCount(): number {
    return this.globalWriteCount
  }

  /**
   * Get the current queue size for a specific content type.
   * Useful for monitoring and testing.
   *
   * @param contentType - The content type to check
   * @returns Current queue size for the content type
   */
  getQueueSize(contentType: string): number {
    return this.writeQueues.get(contentType) || 0
  }

   /**
    * Write data atomically to a file using temp file + fsync + rename pattern.
    *
    * This ensures no partial writes or corruption even if the process crashes during write.
    *
    * Algorithm:
    * 1. Serialize data to JSON
    * 2. Create temp file path with timestamp and random suffix
    * 3. Ensure parent directory exists
    * 4. Write to temp file
    * 5. Sync to disk (fsync)
    * 6. Atomic rename to final path
    * 7. Sync parent directory
    * 8. Cleanup temp file on error
    *
    * @param path - Target file path
    * @param data - Data to write (will be serialized to JSON)
    * @throws Error if path is invalid or write fails
    */
   async writeAtomic(path: string, data: unknown): Promise<void> {
     // Step 1: Validate inputs
     if (!path || typeof path !== 'string') {
       throw new Error('Invalid path: path must be a non-empty string')
     }

     // Step 2: Serialize data to JSON
     let json: string
     try {
       json = JSON.stringify(data, null, 2)
     } catch (error) {
       throw new Error(
         `Failed to serialize data to JSON: ${error instanceof Error ? error.message : String(error)}`
       )
     }

     // Step 3: Create temp file path with timestamp and random suffix
     const timestamp = Date.now()
     const random = Math.random().toString(36).substring(2, 15)
     const tempPath = `${path}.tmp.${timestamp}.${random}`

     try {
       // Step 4: Ensure parent directory exists
       const dir = dirname(path)
       await fs.mkdir(dir, { recursive: true })

       // Step 5: Write to temp file
       await fs.writeFile(tempPath, json, 'utf8')

       // Step 6: Sync to disk (critical for atomicity)
       const fd = await fs.open(tempPath, 'r+')
       try {
         await fd.sync()
       } finally {
         await fd.close()
       }

       // Step 7: Atomic rename (this is the atomic operation)
       await fs.rename(tempPath, path)

       // Step 8: Sync parent directory (ensures rename is persisted)
       const dirFd = await fs.open(dir, 'r')
       try {
         await dirFd.sync()
       } finally {
         await dirFd.close()
       }
     } catch (error) {
       // Step 9: Cleanup temp file on error
       try {
         await fs.unlink(tempPath)
       } catch {
         // Ignore cleanup errors
       }
       throw new Error(
         `Failed to write file atomically: ${error instanceof Error ? error.message : String(error)}`
       )
     }
   }

   /**
    * Read and parse a JSON file.
    *
    * @param path - File path to read
    * @returns Parsed JSON data
    * @throws Error if file doesn't exist, can't be read, or contains invalid JSON
    */
   async readFile(path: string): Promise<unknown> {
     // Validate input
     if (!path || typeof path !== 'string') {
       throw new Error('Invalid path: path must be a non-empty string')
     }

     try {
       // Read file content
       const content = await fs.readFile(path, 'utf8')

       // Parse JSON
       try {
         return JSON.parse(content)
       } catch (error) {
         throw new Error(
           `Failed to parse JSON from file: ${error instanceof Error ? error.message : String(error)}`
         )
       }
     } catch (error) {
       // Check if file doesn't exist
       if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
         throw new Error(`File not found: ${path}`)
       }
       throw new Error(
         `Failed to read file: ${error instanceof Error ? error.message : String(error)}`
       )
     }
   }

   /**
    * Delete a file with cleanup.
    *
    * @param path - File path to delete
    * @throws Error if file can't be deleted (except if it doesn't exist)
    */
   async deleteFile(path: string): Promise<void> {
     // Validate input
     if (!path || typeof path !== 'string') {
       throw new Error('Invalid path: path must be a non-empty string')
     }

     try {
       await fs.unlink(path)
     } catch (error) {
       // Ignore if file doesn't exist
       if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
         return
       }
       throw new Error(
         `Failed to delete file: ${error instanceof Error ? error.message : String(error)}`
       )
     }
   }

   /**
    * Create a directory with recursive option.
    *
    * @param path - Directory path to create
    * @param recursive - Whether to create parent directories (default: true)
    * @throws Error if directory can't be created
    */
   async createDirectory(path: string, recursive = true): Promise<void> {
     // Validate input
     if (!path || typeof path !== 'string') {
       throw new Error('Invalid path: path must be a non-empty string')
     }

     try {
       await fs.mkdir(path, { recursive })
     } catch (error) {
       // Ignore if directory already exists
       if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
         return
       }
       throw new Error(
         `Failed to create directory: ${error instanceof Error ? error.message : String(error)}`
       )
     }
   }

  /**
  * Delete a directory with recursive option.
  * 
  * @param path - Directory path to delete
  * @param recursive - Whether to delete parent and children (default: true)
  * @throws Error if directory can't be deleted
  */
  async deleteDirectory(path: string, recursive = true): Promise<void> {
    // Validate input
    if (!path || typeof path !== 'string') {
      throw new Error('Invalid path: path must be a non-empty string')
    }

    try {
      await fs.rm(path, { recursive, force: true })
    } catch (error) {
      throw new Error(
        `Failed to delete directory: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Read multiple files in parallel.
    *
    * This is more efficient than calling readFile in a loop because:
    * - All reads execute concurrently (no blocking)
    * - No locking needed (reads don't conflict)
    * - Optimized for high throughput (supports 200 concurrent reads)
    *
    * @param paths - Array of file paths to read
    * @returns Promise resolving to array of parsed JSON data (same order as input paths)
    * @throws Error if any file can't be read or parsed
    */
   async readMany(paths: string[]): Promise<unknown[]> {
     // Validate input
     if (!Array.isArray(paths)) {
       throw new Error('Invalid paths: must be an array')
     }

     if (paths.length === 0) {
       return []
     }

     // Read all files in parallel
     const readPromises = paths.map((path) => this.readFile(path))

     try {
       return await Promise.all(readPromises)
     } catch (error) {
       throw new Error(
         `Failed to read multiple files: ${error instanceof Error ? error.message : String(error)}`
       )
     }
   }

   /**
    * Write multiple files with proper mutex coordination.
    *
    * This is more efficient than calling writeAtomic in a loop because:
    * - Writes to different content types execute in parallel
    * - Writes to the same content type are properly serialized
    * - Respects global write limit (max 20 concurrent writes)
    * - Proper cleanup on errors
    *
    * Algorithm:
    * 1. Group operations by content type
    * 2. For each content type, serialize writes using mutex
    * 3. Execute writes to different content types in parallel
    * 4. Ensure locks are released even on error
    *
    * @param operations - Array of write operations with path, data, and contentType
    * @throws Error if any write fails
    */
   async writeMany(operations: WriteOperation[]): Promise<void> {
     // Validate input
     if (!Array.isArray(operations)) {
       throw new Error('Invalid operations: must be an array')
     }

     if (operations.length === 0) {
       return
     }

     // Validate each operation
     for (const op of operations) {
       if (!op.path || typeof op.path !== 'string') {
         throw new Error('Invalid operation: path must be a non-empty string')
       }
       if (!op.contentType || typeof op.contentType !== 'string') {
         throw new Error('Invalid operation: contentType must be a non-empty string')
       }
       if (op.data === undefined) {
         throw new Error('Invalid operation: data is required')
       }
     }

     // Group operations by content type
     const operationsByType = new Map<string, WriteOperation[]>()
     for (const op of operations) {
       if (!operationsByType.has(op.contentType)) {
         operationsByType.set(op.contentType, [])
       }
       operationsByType.get(op.contentType)!.push(op)
     }

     // Execute writes for each content type in parallel
     // Within each content type, writes are serialized by the mutex
     const writePromises = Array.from(operationsByType.entries()).map(
       async ([contentType, ops]) => {
         // Process operations for this content type sequentially
         for (const op of ops) {
           await this.acquireLock(contentType)
           try {
             await this.writeAtomic(op.path, op.data)
           } finally {
             this.releaseLock(contentType)
           }
         }
       }
     )

     try {
       await Promise.all(writePromises)
     } catch (error) {
       throw new Error(
         `Failed to write multiple files: ${error instanceof Error ? error.message : String(error)}`
       )
     }
   }


}
