import { FileEngine } from './file-engine.js'
import { join } from 'path'

/**
 * MetadataEngine manages system-level metadata, such as incremental IDs.
 * 
 * It stores metadata in `.cms/metadata.json`.
 */
export class MetadataEngine {
  private metadataPath: string
  private metadata: Record<string, { lastId: number }> = {}
  private initialized = false

  constructor(private baseDir: string, private fileEngine: FileEngine) {
    this.metadataPath = join(this.baseDir, '.cms', 'metadata.json')
  }

  /**
   * Initialize the metadata engine by loading the metadata file.
   */
  async init(): Promise<void> {
    if (this.initialized) return

    try {
      const data = await this.fileEngine.readFile(this.metadataPath)
      this.metadata = data as Record<string, { lastId: number }>
    } catch (error) {
      // If file doesn't exist, start with empty metadata
      this.metadata = {}
    }

    this.initialized = true
  }

  /**
   * Get the next incremental ID for a content type.
   * 
   * @param contentType - The API ID of the content type
   * @returns The next ID (lastId + 1)
   */
  getNextId(contentType: string): number {
    const lastId = this.metadata[contentType]?.lastId || 0
    return lastId + 1
  }

  /**
   * Update the last used ID for a content type and save to disk.
   * 
   * @param contentType - The API ID of the content type
   * @param id - The ID that was just used
   */
  async updateLastId(contentType: string, id: number): Promise<void> {
    if (!this.metadata[contentType]) {
      this.metadata[contentType] = { lastId: 0 }
    }
    
    if (id > this.metadata[contentType].lastId) {
      this.metadata[contentType].lastId = id
      await this.save()
    }
  }

  /**
   * Delete metadata for a content type.
   * 
   * @param contentType - The API ID of the content type
   */
  async deleteMetadata(contentType: string): Promise<void> {
    if (this.metadata[contentType]) {
      delete this.metadata[contentType]
      await this.save()
    }
  }

  /**
   * Save metadata to disk.
   */
  private async save(): Promise<void> {
    await this.fileEngine.writeAtomic(this.metadataPath, this.metadata)
  }
}
