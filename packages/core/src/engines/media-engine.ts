import { createHash } from 'crypto'
import { extname, dirname, join } from 'path'
import { nanoid } from 'nanoid'
import { promises as fs } from 'fs'
import sharp from 'sharp'
import type { FileEngine } from './file-engine'
import type {
  UploadFile,
  MediaFile,
  MediaFolder,
  RequestContext,
  MediaFormat,
  QueryParams,
  PaginatedResult,
  FilterGroup,
  FilterOperator,
  SortParam,
  PaginationParam,
  UpdateMediaData,
} from '../types'

/**
 * MediaEngine handles file uploads, storage, and metadata management for the media library.
 *
 * Responsibilities:
 * - Validate file uploads (size, type, extension)
 * - Generate unique filenames using hash
 * - Store files in /uploads/ directory
 * - Store metadata in .cms/media.json
 * - Support batch uploads with uploadMany
 *
 * **Validates: Requirements 7.1, 7.2, 7.3**
 */
export class MediaEngine {
  private readonly fileEngine: FileEngine
  private readonly uploadsDir: string
  private readonly metadataPath: string
  private readonly maxFileSize = 50 * 1024 * 1024 // 50MB default
  private readonly allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'application/pdf',
    'video/mp4',
    'video/webm',
    'audio/mpeg',
    'audio/wav',
  ]
  private readonly allowedExtensions = [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.svg',
    '.pdf',
    '.mp4',
    '.webm',
    '.mp3',
    '.wav',
  ]

  constructor(fileEngine: FileEngine, baseDir: string = process.cwd()) {
    this.fileEngine = fileEngine
    this.uploadsDir = join(baseDir, 'uploads')
    this.metadataPath = join(baseDir, '.cms', 'media.json')
  }

  /**
   * Upload a single file with validation.
   *
   * Algorithm:
   * 1. Validate file (size, type, extension)
   * 2. Generate unique hash for filename
   * 3. Create MediaFile metadata
   * 4. Store file in /uploads/ directory
   * 5. If image, generate formats (thumbnail, small, medium, large)
   * 6. Update metadata in .cms/media.json
   *
   * **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
   *
   * @param file - The file to upload
   * @param context - Request context with user information
   * @returns MediaFile metadata
   * @throws Error if validation fails or upload fails
   */
  async upload(file: UploadFile, _context: RequestContext): Promise<MediaFile> {
    // Step 1: Validate file
    this.validateFile(file)

    // Step 2: Generate unique hash for filename
    const hash = this.generateHash(file.buffer)
    const ext = extname(file.name).toLowerCase()

    // Step 3: Create MediaFile metadata
    const mediaFile: MediaFile = {
      id: nanoid(),
      name: file.name,
      hash,
      ext,
      mime: file.mimetype,
      size: file.size,
      url: `/uploads/${hash}${ext}`,
      provider: 'local',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // Step 4: Store file in /uploads/ directory
    const filePath = join(this.uploadsDir, `${hash}${ext}`)
    await this.fileEngine.acquireLock('media')
    try {
      await this.writeBinaryFile(filePath, file.buffer)

      // Step 5: If image, generate formats and add dimensions
      if (this.isImage(file.mimetype)) {
        const imageInfo = await this.getImageInfo(file.buffer)
        // Only process if we got valid dimensions
        if (imageInfo.width > 0 && imageInfo.height > 0) {
          mediaFile.width = imageInfo.width
          mediaFile.height = imageInfo.height
          
          // Generate image formats
          mediaFile.formats = await this.generateImageFormats(file.buffer, hash, ext)
        }
      }

      // Step 6: Update metadata in .cms/media.json
      await this.updateMetadata(mediaFile)
    } finally {
      this.fileEngine.releaseLock('media')
    }

    return mediaFile
  }

  /**
   * Upload multiple files in batch.
   *
   * Algorithm:
   * 1. Validate all files
   * 2. Generate hashes and metadata for all files
   * 3. Store all files in /uploads/ directory
   * 4. For images, generate formats and add dimensions
   * 5. Update metadata in .cms/media.json with all files
   *
   * **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
   *
   * @param files - Array of files to upload
   * @param context - Request context with user information
   * @returns Array of MediaFile metadata
   * @throws Error if any validation fails or upload fails
   */
  async uploadMany(
    files: UploadFile[],
    _context: RequestContext
  ): Promise<MediaFile[]> {
    // Step 1: Validate all files
    for (const file of files) {
      this.validateFile(file)
    }

    // Step 2: Generate hashes and metadata for all files
    const mediaFiles: MediaFile[] = files.map((file) => {
      const hash = this.generateHash(file.buffer)
      const ext = extname(file.name).toLowerCase()

      return {
        id: nanoid(),
        name: file.name,
        hash,
        ext,
        mime: file.mimetype,
        size: file.size,
        url: `/uploads/${hash}${ext}`,
        provider: 'local',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    })

    // Step 3: Store all files in /uploads/ directory
    await this.fileEngine.acquireLock('media')
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const mediaFile = mediaFiles[i]
        const filePath = join(this.uploadsDir, `${mediaFile.hash}${mediaFile.ext}`)
        await this.writeBinaryFile(filePath, file.buffer)

        // Step 4: For images, generate formats and add dimensions
        if (this.isImage(file.mimetype)) {
          const imageInfo = await this.getImageInfo(file.buffer)
          // Only process if we got valid dimensions
          if (imageInfo.width > 0 && imageInfo.height > 0) {
            mediaFile.width = imageInfo.width
            mediaFile.height = imageInfo.height
            
            // Generate image formats
            mediaFile.formats = await this.generateImageFormats(
              file.buffer,
              mediaFile.hash,
              mediaFile.ext
            )
          }
        }
      }

      // Step 5: Update metadata in .cms/media.json with all files
      await this.updateMetadataMany(mediaFiles)
    } finally {
      this.fileEngine.releaseLock('media')
    }

    return mediaFiles
  }

  /**
   * Find a single media file by ID.
   *
   * Algorithm:
   * 1. Read metadata from .cms/media.json
   * 2. Return the media file with matching ID or null if not found
   *
   * **Validates: Requirement 7.5**
   *
   * @param id - The media file ID
   * @returns MediaFile or null if not found
   */
  async findOne(id: string): Promise<MediaFile | null> {
    // Step 1: Read metadata from .cms/media.json
    let metadata: Record<string, MediaFile> = {}
    try {
      const data = await this.fileEngine.readFile(this.metadataPath)
      if (data && typeof data === 'object') {
        metadata = data as Record<string, MediaFile>
      }
    } catch (error) {
      // File doesn't exist yet, return null
      return null
    }

    // Step 2: Return the media file with matching ID or null
    return metadata[id] || null
  }

  /**
   * Find multiple media files with query support.
   *
   * Algorithm:
   * 1. Read all metadata from .cms/media.json
   * 2. Convert to array of media files
   * 3. Apply filters (folder, mime type, size)
   * 4. Apply sorting
   * 5. Apply pagination
   * 6. Return paginated result
   *
   * Supported filters:
   * - folder: Filter by folder path (exact match)
   * - mime: Filter by MIME type (exact match or $contains)
   * - size: Filter by file size ($gt, $gte, $lt, $lte)
   *
   * **Validates: Requirement 7.5**
   *
   * @param query - Query parameters (filters, sort, pagination)
   * @returns Paginated result with media files
   */
  async findMany(query?: QueryParams): Promise<PaginatedResult<MediaFile>> {
    // Step 1: Read all metadata from .cms/media.json
    let metadata: Record<string, MediaFile> = {}
    try {
      const data = await this.fileEngine.readFile(this.metadataPath)
      if (data && typeof data === 'object') {
        metadata = data as Record<string, MediaFile>
      }
    } catch (error) {
      // File doesn't exist yet, return empty result
      return {
        data: [],
        meta: {
          pagination: {
            page: 1,
            pageSize: 25,
            pageCount: 0,
            total: 0,
          },
        },
      }
    }

    // Step 2: Convert to array of media files
    let results = Object.values(metadata)

    // Step 3: Apply filters
    if (query?.filters) {
      results = this.applyFilters(results, query.filters)
    }

    // Step 4: Apply sorting
    if (query?.sort && query.sort.length > 0) {
      results = this.applySorting(results, query.sort)
    }

    // Step 5: Apply pagination
    const { page, pageSize, start, limit } = this.normalizePagination(query?.pagination)
    const total = results.length
    const actualStart = start !== undefined ? start : (page - 1) * pageSize
    const actualLimit = limit !== undefined ? limit : pageSize
    const paginatedResults = results.slice(actualStart, actualStart + actualLimit)

    // Step 6: Return paginated result
    return {
      data: paginatedResults,
      meta: {
        pagination: {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize),
          total,
        },
      },
    }
  }
  /**
   * Update media file metadata.
   *
   * Algorithm:
   * 1. Read existing metadata from .cms/media.json
   * 2. Find the media file by ID
   * 3. Update allowed fields (alternativeText, caption, folder, name)
   * 4. Update updatedAt timestamp
   * 5. Write updated metadata back to .cms/media.json
   *
   * **Validates: Requirement 7.6**
   *
   * @param id - The media file ID
   * @param data - Update data (alternativeText, caption, folder, name)
   * @returns Updated MediaFile
   * @throws Error if media file not found
   */
  async update(id: string, data: UpdateMediaData): Promise<MediaFile> {
    await this.fileEngine.acquireLock('media')
    try {
      // Step 1: Read existing metadata
      let metadata: Record<string, MediaFile> = {}
      try {
        const metadataContent = await this.fileEngine.readFile(this.metadataPath)
        if (metadataContent && typeof metadataContent === 'object') {
          metadata = metadataContent as Record<string, MediaFile>
        }
      } catch (error) {
        throw new Error('Media metadata file not found')
      }

      // Step 2: Find the media file by ID
      const mediaFile = metadata[id]
      if (!mediaFile) {
        throw new Error(`Media file with ID ${id} not found`)
      }

      // Step 3: Update allowed fields
      if (data.alternativeText !== undefined) {
        mediaFile.alternativeText = data.alternativeText
      }
      if (data.caption !== undefined) {
        mediaFile.caption = data.caption
      }
      if (data.folder !== undefined) {
        mediaFile.folder = data.folder
      }
      if (data.name !== undefined) {
        mediaFile.name = data.name
      }

      // Step 4: Update updatedAt timestamp
      mediaFile.updatedAt = new Date().toISOString()

      // Step 5: Write updated metadata back
      metadata[id] = mediaFile
      await this.fileEngine.writeAtomic(this.metadataPath, metadata)

      return mediaFile
    } finally {
      this.fileEngine.releaseLock('media')
    }
  }

  /**
   * Delete media file and all its format variants.
   *
   * Algorithm:
   * 1. Read existing metadata from .cms/media.json
   * 2. Find the media file by ID
   * 3. Delete the main file from /uploads/
   * 4. Delete all format files (thumbnail, small, medium, large) if they exist
   * 5. Remove the entry from metadata
   * 6. Write updated metadata back to .cms/media.json
   *
   * **Validates: Requirement 7.6**
   *
   * @param id - The media file ID
   * @throws Error if media file not found
   */
  async delete(id: string): Promise<void> {
    await this.fileEngine.acquireLock('media')
    try {
      // Step 1: Read existing metadata
      let metadata: Record<string, MediaFile> = {}
      try {
        const metadataContent = await this.fileEngine.readFile(this.metadataPath)
        if (metadataContent && typeof metadataContent === 'object') {
          metadata = metadataContent as Record<string, MediaFile>
        }
      } catch (error) {
        throw new Error('Media metadata file not found')
      }

      // Step 2: Find the media file by ID
      const mediaFile = metadata[id]
      if (!mediaFile) {
        throw new Error(`Media file with ID ${id} not found`)
      }

      // Step 3: Delete the main file from /uploads/
      const mainFilePath = join(this.uploadsDir, `${mediaFile.hash}${mediaFile.ext}`)
      try {
        await fs.unlink(mainFilePath)
      } catch (error) {
        // File might not exist, log but continue
        console.warn(`Failed to delete main file: ${mainFilePath}`, error)
      }

      // Step 4: Delete all format files if they exist
      if (mediaFile.formats) {
        const formatNames: Array<keyof typeof mediaFile.formats> = [
          'thumbnail',
          'small',
          'medium',
          'large',
        ]

        for (const formatName of formatNames) {
          const format = mediaFile.formats[formatName]
          if (format) {
            const formatPath = join(this.uploadsDir, `${format.hash}${format.ext}`)
            try {
              await fs.unlink(formatPath)
            } catch (error) {
              // File might not exist, log but continue
              console.warn(`Failed to delete format file: ${formatPath}`, error)
            }
          }
        }
      }

      // Step 5: Remove the entry from metadata
      delete metadata[id]

      // Step 6: Write updated metadata back
      await this.fileEngine.writeAtomic(this.metadataPath, metadata)
    } finally {
      this.fileEngine.releaseLock('media')
    }
  }

  /**
   * Apply filters to media files.
   *
   * Supports:
   * - folder: Exact match on folder field
   * - mime: Exact match or $contains on mime field
   * - size: Numeric comparisons ($gt, $gte, $lt, $lte)
   *
   * @param files - Array of media files
   * @param filters - Filter group
   * @returns Filtered array of media files
   */
  private applyFilters(files: MediaFile[], filters: FilterGroup): MediaFile[] {
    return files.filter((file) => this.matchesFilter(file, filters))
  }

  /**
   * Check if a media file matches a filter.
   *
   * @param file - Media file to check
   * @param filter - Filter to apply
   * @returns True if file matches filter
   */
  private matchesFilter(file: MediaFile, filter: FilterGroup): boolean {
    // Handle logical operators
    if (filter.$and) {
      return filter.$and.every((f) => this.matchesFilter(file, f))
    }
    if (filter.$or) {
      return filter.$or.some((f) => this.matchesFilter(file, f))
    }
    if (filter.$not) {
      return !this.matchesFilter(file, filter.$not)
    }

    // Handle field filters
    for (const [field, condition] of Object.entries(filter)) {
      if (field.startsWith('$')) continue // Skip logical operators

      const value = this.getFieldValue(file, field)

      if (typeof condition === 'object' && condition !== null) {
        // Handle filter operators
        if (!this.matchesOperator(value, condition as FilterOperator)) {
          return false
        }
      } else {
        // Direct equality
        if (value !== condition) {
          return false
        }
      }
    }

    return true
  }

  /**
   * Get field value from media file (supports dot notation).
   *
   * @param file - Media file
   * @param field - Field path (e.g., "folder", "mime", "size")
   * @returns Field value
   */
  private getFieldValue(file: MediaFile, field: string): unknown {
    const parts = field.split('.')
    let value: any = file
    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined
      }
      value = value[part]
    }
    return value
  }

  /**
   * Check if a value matches a filter operator.
   *
   * @param value - Value to check
   * @param operator - Filter operator
   * @returns True if value matches operator
   */
  private matchesOperator(value: unknown, operator: FilterOperator): boolean {
    // Check all operators - ALL must pass for the filter to match
    if (operator.$eq !== undefined && value !== operator.$eq) return false
    if (operator.$ne !== undefined && value === operator.$ne) return false
    if (operator.$gt !== undefined) {
      if (!(typeof value === 'number' && typeof operator.$gt === 'number' && value > operator.$gt)) {
        return false
      }
    }
    if (operator.$gte !== undefined) {
      if (!(typeof value === 'number' && typeof operator.$gte === 'number' && value >= operator.$gte)) {
        return false
      }
    }
    if (operator.$lt !== undefined) {
      if (!(typeof value === 'number' && typeof operator.$lt === 'number' && value < operator.$lt)) {
        return false
      }
    }
    if (operator.$lte !== undefined) {
      if (!(typeof value === 'number' && typeof operator.$lte === 'number' && value <= operator.$lte)) {
        return false
      }
    }
    if (operator.$in !== undefined && !operator.$in.includes(value)) return false
    if (operator.$notIn !== undefined && operator.$notIn.includes(value)) return false
    if (operator.$contains !== undefined) {
      if (!(typeof value === 'string' && value.includes(operator.$contains))) {
        return false
      }
    }
    if (operator.$containsi !== undefined) {
      if (
        !(
          typeof value === 'string' &&
          value.toLowerCase().includes(operator.$containsi.toLowerCase())
        )
      ) {
        return false
      }
    }
    if (operator.$startsWith !== undefined) {
      if (!(typeof value === 'string' && value.startsWith(operator.$startsWith))) {
        return false
      }
    }
    if (operator.$endsWith !== undefined) {
      if (!(typeof value === 'string' && value.endsWith(operator.$endsWith))) {
        return false
      }
    }
    if (operator.$null !== undefined) {
      const isNull = value === null
      if (operator.$null !== isNull) return false
    }

    return true
  }

  /**
   * Apply sorting to media files.
   *
   * @param files - Array of media files
   * @param sort - Sort parameters
   * @returns Sorted array of media files
   */
  private applySorting(files: MediaFile[], sort: SortParam[]): MediaFile[] {
    return [...files].sort((a, b) => {
      for (const { field, order } of sort) {
        const aValue = this.getFieldValue(a, field)
        const bValue = this.getFieldValue(b, field)

        let comparison = 0
        if (aValue !== undefined && aValue !== null && bValue !== undefined && bValue !== null) {
          if (aValue < bValue) comparison = -1
          else if (aValue > bValue) comparison = 1
        }

        if (comparison !== 0) {
          return order === 'asc' ? comparison : -comparison
        }
      }
      return 0
    })
  }

  /**
   * Normalize pagination parameters.
   *
   * Supports both page/pageSize and start/limit formats.
   *
   * @param pagination - Pagination parameters
   * @returns Normalized pagination with page, pageSize, start, limit
   */
  private normalizePagination(pagination?: PaginationParam): {
    page: number
    pageSize: number
    start?: number
    limit?: number
  } {
    const defaultPageSize = 25
    const defaultPage = 1

    if (!pagination) {
      return {
        page: defaultPage,
        pageSize: defaultPageSize,
      }
    }

    // If start/limit provided, use those
    if (pagination.start !== undefined || pagination.limit !== undefined) {
      const start = pagination.start || 0
      const limit = pagination.limit || defaultPageSize
      const page = Math.floor(start / limit) + 1
      return {
        page,
        pageSize: limit,
        start,
        limit,
      }
    }

    // Otherwise use page/pageSize
    const page = pagination.page || defaultPage
    const pageSize = pagination.pageSize || defaultPageSize
    return {
      page,
      pageSize,
    }
  }


  /**
   * Validate file upload.
   *
   * Checks:
   * - File size is within limit
   * - MIME type is allowed
   * - File extension is allowed
   *
   * **Validates: Requirement 7.1**
   *
   * @param file - The file to validate
   * @throws Error if validation fails
   */
  private validateFile(file: UploadFile): void {
    // Validate file size
    if (file.size > this.maxFileSize) {
      throw new Error(
        `File size exceeds maximum allowed size of ${this.maxFileSize} bytes`
      )
    }

    // Validate MIME type
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new Error(
        `File type ${file.mimetype} is not allowed. Allowed types: ${this.allowedMimeTypes.join(', ')}`
      )
    }

    // Validate file extension
    const ext = extname(file.name).toLowerCase()
    if (!this.allowedExtensions.includes(ext)) {
      throw new Error(
        `File extension ${ext} is not allowed. Allowed extensions: ${this.allowedExtensions.join(', ')}`
      )
    }
  }

  /**
   * Generate unique hash for filename using SHA-256.
   *
   * **Validates: Requirement 7.2**
   *
   * @param buffer - File buffer
   * @returns Hash string
   */
  private generateHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex').substring(0, 16)
  }

  /**
   * Write binary file atomically.
   *
   * Algorithm:
   * 1. Create temp file path
   * 2. Ensure parent directory exists
   * 3. Write buffer to temp file
   * 4. Sync to disk (fsync)
   * 5. Atomic rename to final path
   * 6. Sync parent directory
   *
   * @param path - Target file path
   * @param buffer - Binary data to write
   * @throws Error if write fails
   */
  private async writeBinaryFile(path: string, buffer: Buffer): Promise<void> {
    // Step 1: Create temp file path
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 15)
    const tempPath = `${path}.tmp.${timestamp}.${random}`

    try {
      // Step 2: Ensure parent directory exists
      const dir = dirname(path)
      await fs.mkdir(dir, { recursive: true })

      // Step 3: Write buffer to temp file
      await fs.writeFile(tempPath, buffer)

      // Step 4: Sync to disk (critical for atomicity)
      const fd = await fs.open(tempPath, 'r+')
      try {
        await fd.sync()
      } finally {
        await fd.close()
      }

      // Step 5: Atomic rename
      await fs.rename(tempPath, path)

      // Step 6: Sync parent directory
      const dirFd = await fs.open(dir, 'r')
      try {
        await dirFd.sync()
      } finally {
        await dirFd.close()
      }
    } catch (error) {
      // Cleanup temp file on error
      try {
        await fs.unlink(tempPath)
      } catch {
        // Ignore cleanup errors
      }
      throw new Error(
        `Failed to write binary file: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Update metadata file with new media file.
   *
   * Algorithm:
   * 1. Read existing metadata from .cms/media.json
   * 2. Add new media file to metadata
   * 3. Write updated metadata back to .cms/media.json
   *
   * **Validates: Requirement 7.3**
   *
   * @param mediaFile - The media file metadata to add
   */
  private async updateMetadata(mediaFile: MediaFile): Promise<void> {
    let metadata: Record<string, MediaFile> = {}

    // Step 1: Read existing metadata
    try {
      const data = await this.fileEngine.readFile(this.metadataPath)
      if (data && typeof data === 'object') {
        metadata = data as Record<string, MediaFile>
      }
    } catch (error) {
      // File doesn't exist yet, start with empty metadata
      metadata = {}
    }

    // Step 2: Add new media file to metadata
    metadata[mediaFile.id] = mediaFile

    // Step 3: Write updated metadata back
    await this.fileEngine.writeAtomic(this.metadataPath, metadata)
  }

  /**
   * Update metadata file with multiple new media files.
   *
   * Algorithm:
   * 1. Read existing metadata from .cms/media.json
   * 2. Add all new media files to metadata
   * 3. Write updated metadata back to .cms/media.json
   *
   * **Validates: Requirement 7.3**
   *
   * @param mediaFiles - Array of media file metadata to add
   */
  private async updateMetadataMany(mediaFiles: MediaFile[]): Promise<void> {
    let metadata: Record<string, MediaFile> = {}

    // Step 1: Read existing metadata
    try {
      const data = await this.fileEngine.readFile(this.metadataPath)
      if (data && typeof data === 'object') {
        metadata = data as Record<string, MediaFile>
      }
    } catch (error) {
      // File doesn't exist yet, start with empty metadata
      metadata = {}
    }

    // Step 2: Add all new media files to metadata
    for (const mediaFile of mediaFiles) {
      metadata[mediaFile.id] = mediaFile
    }

    // Step 3: Write updated metadata back
    await this.fileEngine.writeAtomic(this.metadataPath, metadata)
  }

  /**
   * Check if a MIME type is an image.
   *
   * @param mimetype - The MIME type to check
   * @returns True if the MIME type is an image
   */
  private isImage(mimetype: string): boolean {
    return mimetype.startsWith('image/') && mimetype !== 'image/svg+xml'
  }

  /**
   * Get image dimensions from buffer.
   *
   * @param buffer - Image buffer
   * @returns Image metadata with width and height
   */
  private async getImageInfo(buffer: Buffer): Promise<{ width: number; height: number }> {
    try {
      const metadata = await sharp(buffer).metadata()
      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
      }
    } catch (error) {
      // If sharp can't read the image, return zero dimensions
      return { width: 0, height: 0 }
    }
  }

  /**
   * Generate image formats (thumbnail, small, medium, large).
   *
   * Algorithm:
   * 1. Generate thumbnail (150x150)
   * 2. Generate small format (500px width)
   * 3. Generate medium format (750px width)
   * 4. Generate large format (1000px width)
   * 5. Store each format in /uploads/ with format suffix
   * 6. Return format metadata
   *
   * All formats preserve aspect ratio.
   *
   * **Validates: Requirement 7.4**
   *
   * @param buffer - Original image buffer
   * @param hash - Original file hash
   * @param ext - File extension
   * @returns MediaFormats object with all generated formats
   */
  private async generateImageFormats(
    buffer: Buffer,
    hash: string,
    ext: string
  ): Promise<{
    thumbnail?: MediaFormat
    small?: MediaFormat
    medium?: MediaFormat
    large?: MediaFormat
  }> {
    const formats: {
      thumbnail?: MediaFormat
      small?: MediaFormat
      medium?: MediaFormat
      large?: MediaFormat
    } = {}

    // Get original dimensions
    const metadata = await sharp(buffer).metadata()
    const originalWidth = metadata.width || 0

    // Define format configurations
    const formatConfigs = [
      { name: 'thumbnail', width: 150, height: 150, fit: 'cover' as const },
      { name: 'small', width: 500 },
      { name: 'medium', width: 750 },
      { name: 'large', width: 1000 },
    ]

    for (const config of formatConfigs) {
      // Skip if original is smaller than target width (except thumbnail)
      if (config.name !== 'thumbnail' && originalWidth < config.width) {
        continue
      }

      // Generate format
      let resizeOptions: sharp.ResizeOptions
      if (config.name === 'thumbnail') {
        // Thumbnail uses cover fit (crops to square)
        resizeOptions = {
          width: config.width,
          height: config.height,
          fit: config.fit,
          position: 'center',
        }
      } else {
        // Other formats preserve aspect ratio
        resizeOptions = {
          width: config.width,
          fit: 'inside',
        }
      }

      const resizedBuffer = await sharp(buffer).resize(resizeOptions).toBuffer()

      // Get dimensions of resized image
      const resizedMetadata = await sharp(resizedBuffer).metadata()
      const width = resizedMetadata.width || 0
      const height = resizedMetadata.height || 0

      // Generate hash for format
      const formatHash = `${hash}_${config.name}`
      const formatPath = join(this.uploadsDir, `${formatHash}${ext}`)

      // Write format file
      await this.writeBinaryFile(formatPath, resizedBuffer)

      // Create format metadata
      const format: MediaFormat = {
        name: config.name,
        hash: formatHash,
        ext,
        mime: metadata.format ? `image/${metadata.format}` : 'image/jpeg',
        width,
        height,
        size: resizedBuffer.length,
        url: `/uploads/${formatHash}${ext}`,
      }

      // Add to formats object
      if (config.name === 'thumbnail') {
        formats.thumbnail = format
      } else if (config.name === 'small') {
        formats.small = format
      } else if (config.name === 'medium') {
        formats.medium = format
      } else if (config.name === 'large') {
        formats.large = format
      }
    }

    return formats
  }

   /**
    * Create a new folder with optional parent folder.
    *
    * Algorithm:
    * 1. Read existing folders from .cms/folders.json
    * 2. Validate parent folder exists if provided
    * 3. Create new folder with unique ID
    * 4. Add folder to folders metadata
    * 5. Write updated folders metadata back to .cms/folders.json
    *
    * **Validates: Requirement 7.7**
    *
    * @param name - The folder name
    * @param parent - Optional parent folder ID
    * @returns MediaFolder metadata
    * @throws Error if parent folder doesn't exist
    */
   async createFolder(name: string, parent?: string): Promise<MediaFolder> {
     await this.fileEngine.acquireLock('media')
     try {
       // Step 1: Read existing folders
       const foldersPath = join(dirname(this.metadataPath), 'folders.json')
       let folders: Record<string, MediaFolder> = {}

       try {
         const data = await this.fileEngine.readFile(foldersPath)
         if (data && typeof data === 'object') {
           folders = data as Record<string, MediaFolder>
         }
       } catch (error) {
         // File doesn't exist yet, start with empty folders
         folders = {}
       }

       // Step 2: Validate parent folder exists if provided
       if (parent && !folders[parent]) {
         throw new Error(`Parent folder with ID ${parent} not found`)
       }

       // Step 3: Create new folder with unique ID
       const folder: MediaFolder = {
         id: nanoid(),
         name,
         parent,
         createdAt: new Date().toISOString(),
         updatedAt: new Date().toISOString(),
       }

       // Step 4: Add folder to folders metadata
       folders[folder.id] = folder

       // Step 5: Write updated folders metadata back
       await this.fileEngine.writeAtomic(foldersPath, folders)

       return folder
     } finally {
       this.fileEngine.releaseLock('media')
     }
   }

   /**
    * Move a media file to a folder.
    *
    * Algorithm:
    * 1. Validate folder exists in .cms/folders.json
    * 2. Update media file's folder field using update method
    *
    * **Validates: Requirement 7.7**
    *
    * @param fileId - The media file ID
    * @param folderId - The target folder ID
    * @returns Updated MediaFile
    * @throws Error if folder doesn't exist or file doesn't exist
    */
   async moveToFolder(fileId: string, folderId: string): Promise<MediaFile> {
     // Step 1: Validate folder exists
     const foldersPath = join(dirname(this.metadataPath), 'folders.json')
     let folders: Record<string, MediaFolder> = {}

     try {
       const data = await this.fileEngine.readFile(foldersPath)
       if (data && typeof data === 'object') {
         folders = data as Record<string, MediaFolder>
       }
     } catch (error) {
       throw new Error('Folders metadata file not found')
     }

     if (!folders[folderId]) {
       throw new Error(`Folder with ID ${folderId} not found`)
     }

     // Step 2: Update media file's folder field
     return await this.update(fileId, { folder: folderId })
   }
}
