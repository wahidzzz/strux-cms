import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { MediaEngine } from './media-engine'
import { FileEngine } from './file-engine'
import type { UploadFile, RequestContext } from '../types'

describe('MediaEngine', () => {
  let mediaEngine: MediaEngine
  let fileEngine: FileEngine
  let testDir: string
  let uploadsDir: string
  let metadataPath: string

  beforeEach(async () => {
    // Create a unique test directory for each test
    testDir = join(
      process.cwd(),
      'test-data',
      `media-test-${Date.now()}-${Math.random().toString(36).substring(2)}`
    )
    uploadsDir = join(testDir, 'uploads')
    metadataPath = join(testDir, '.cms', 'media.json')

    await fs.mkdir(testDir, { recursive: true })
    await fs.mkdir(uploadsDir, { recursive: true })
    await fs.mkdir(join(testDir, '.cms'), { recursive: true })

    fileEngine = new FileEngine()
    mediaEngine = new MediaEngine(fileEngine, testDir)
  })

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('upload', () => {
    it('should upload a valid image file', async () => {
      const file: UploadFile = {
        name: 'test-image.jpg',
        buffer: Buffer.from('fake-image-data'),
        mimetype: 'image/jpeg',
        size: 1024,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      const result = await mediaEngine.upload(file, context)

      // Verify metadata
      expect(result.id).toBeDefined()
      expect(result.name).toBe('test-image.jpg')
      expect(result.ext).toBe('.jpg')
      expect(result.mime).toBe('image/jpeg')
      expect(result.size).toBe(1024)
      expect(result.hash).toBeDefined()
      expect(result.url).toMatch(/^\/uploads\/[a-f0-9]+\.jpg$/)
      expect(result.provider).toBe('local')
      expect(result.createdAt).toBeDefined()
      expect(result.updatedAt).toBeDefined()

      // Verify file was written
      const filePath = join(uploadsDir, `${result.hash}${result.ext}`)
      const fileContent = await fs.readFile(filePath)
      expect(fileContent.toString()).toBe('fake-image-data')

      // Verify metadata was written
      const metadataContent = await fs.readFile(metadataPath, 'utf8')
      const metadata = JSON.parse(metadataContent)
      expect(metadata[result.id]).toEqual(result)
    })

    it('should reject file exceeding size limit', async () => {
      const file: UploadFile = {
        name: 'large-file.jpg',
        buffer: Buffer.alloc(51 * 1024 * 1024), // 51MB
        mimetype: 'image/jpeg',
        size: 51 * 1024 * 1024,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      await expect(mediaEngine.upload(file, context)).rejects.toThrow(
        'File size exceeds maximum'
      )
    })

    it('should reject file with invalid MIME type', async () => {
      const file: UploadFile = {
        name: 'test.exe',
        buffer: Buffer.from('fake-data'),
        mimetype: 'application/x-msdownload',
        size: 1024,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      await expect(mediaEngine.upload(file, context)).rejects.toThrow(
        'File type application/x-msdownload is not allowed'
      )
    })

    it('should reject file with invalid extension', async () => {
      const file: UploadFile = {
        name: 'test.exe',
        buffer: Buffer.from('fake-data'),
        mimetype: 'image/jpeg', // Valid MIME but invalid extension
        size: 1024,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      await expect(mediaEngine.upload(file, context)).rejects.toThrow(
        'File extension .exe is not allowed'
      )
    })

    it('should generate unique hash for different files', async () => {
      const file1: UploadFile = {
        name: 'file1.jpg',
        buffer: Buffer.from('content-1'),
        mimetype: 'image/jpeg',
        size: 9,
      }

      const file2: UploadFile = {
        name: 'file2.jpg',
        buffer: Buffer.from('content-2'),
        mimetype: 'image/jpeg',
        size: 9,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      const result1 = await mediaEngine.upload(file1, context)
      const result2 = await mediaEngine.upload(file2, context)

      expect(result1.hash).not.toBe(result2.hash)
      expect(result1.url).not.toBe(result2.url)
    })

    it('should handle multiple uploads to same metadata file', async () => {
      const file1: UploadFile = {
        name: 'file1.jpg',
        buffer: Buffer.from('content-1'),
        mimetype: 'image/jpeg',
        size: 9,
      }

      const file2: UploadFile = {
        name: 'file2.png',
        buffer: Buffer.from('content-2'),
        mimetype: 'image/png',
        size: 9,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      const result1 = await mediaEngine.upload(file1, context)
      const result2 = await mediaEngine.upload(file2, context)

      // Verify both files are in metadata
      const metadataContent = await fs.readFile(metadataPath, 'utf8')
      const metadata = JSON.parse(metadataContent)
      expect(metadata[result1.id]).toEqual(result1)
      expect(metadata[result2.id]).toEqual(result2)
    })
  })

  describe('uploadMany', () => {
    it('should upload multiple files in batch', async () => {
      const files: UploadFile[] = [
        {
          name: 'file1.jpg',
          buffer: Buffer.from('content-1'),
          mimetype: 'image/jpeg',
          size: 9,
        },
        {
          name: 'file2.png',
          buffer: Buffer.from('content-2'),
          mimetype: 'image/png',
          size: 9,
        },
        {
          name: 'file3.gif',
          buffer: Buffer.from('content-3'),
          mimetype: 'image/gif',
          size: 9,
        },
      ]

      const context: RequestContext = {
        role: 'admin',
      }

      const results = await mediaEngine.uploadMany(files, context)

      // Verify all files were uploaded
      expect(results).toHaveLength(3)
      expect(results[0].name).toBe('file1.jpg')
      expect(results[1].name).toBe('file2.png')
      expect(results[2].name).toBe('file3.gif')

      // Verify all files exist
      for (const result of results) {
        const filePath = join(uploadsDir, `${result.hash}${result.ext}`)
        const exists = await fs
          .access(filePath)
          .then(() => true)
          .catch(() => false)
        expect(exists).toBe(true)
      }

      // Verify all metadata was written
      const metadataContent = await fs.readFile(metadataPath, 'utf8')
      const metadata = JSON.parse(metadataContent)
      for (const result of results) {
        expect(metadata[result.id]).toEqual(result)
      }
    })

    it('should reject batch if any file is invalid', async () => {
      const files: UploadFile[] = [
        {
          name: 'file1.jpg',
          buffer: Buffer.from('content-1'),
          mimetype: 'image/jpeg',
          size: 9,
        },
        {
          name: 'file2.exe', // Invalid extension
          buffer: Buffer.from('content-2'),
          mimetype: 'application/x-msdownload',
          size: 9,
        },
      ]

      const context: RequestContext = {
        role: 'admin',
      }

      await expect(mediaEngine.uploadMany(files, context)).rejects.toThrow(
        'File type application/x-msdownload is not allowed'
      )
    })

    it('should handle empty array', async () => {
      const files: UploadFile[] = []

      const context: RequestContext = {
        role: 'admin',
      }

      const results = await mediaEngine.uploadMany(files, context)

      expect(results).toHaveLength(0)
    })
  })

  describe('file validation', () => {
    it('should accept all allowed image types', async () => {
      const allowedTypes = [
        { ext: '.jpg', mime: 'image/jpeg' },
        { ext: '.jpeg', mime: 'image/jpeg' },
        { ext: '.png', mime: 'image/png' },
        { ext: '.gif', mime: 'image/gif' },
        { ext: '.webp', mime: 'image/webp' },
        { ext: '.svg', mime: 'image/svg+xml' },
      ]

      const context: RequestContext = {
        role: 'admin',
      }

      for (const type of allowedTypes) {
        const file: UploadFile = {
          name: `test${type.ext}`,
          buffer: Buffer.from('test-data'),
          mimetype: type.mime,
          size: 100,
        }

        const result = await mediaEngine.upload(file, context)
        expect(result.ext).toBe(type.ext)
        expect(result.mime).toBe(type.mime)
      }
    })

    it('should accept PDF files', async () => {
      const file: UploadFile = {
        name: 'document.pdf',
        buffer: Buffer.from('fake-pdf-data'),
        mimetype: 'application/pdf',
        size: 1024,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      const result = await mediaEngine.upload(file, context)
      expect(result.ext).toBe('.pdf')
      expect(result.mime).toBe('application/pdf')
    })

    it('should accept video files', async () => {
      const file: UploadFile = {
        name: 'video.mp4',
        buffer: Buffer.from('fake-video-data'),
        mimetype: 'video/mp4',
        size: 1024,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      const result = await mediaEngine.upload(file, context)
      expect(result.ext).toBe('.mp4')
      expect(result.mime).toBe('video/mp4')
    })

    it('should accept audio files', async () => {
      const file: UploadFile = {
        name: 'audio.mp3',
        buffer: Buffer.from('fake-audio-data'),
        mimetype: 'audio/mpeg',
        size: 1024,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      const result = await mediaEngine.upload(file, context)
      expect(result.ext).toBe('.mp3')
      expect(result.mime).toBe('audio/mpeg')
    })
  })

  describe('image processing', () => {
    it('should generate image formats for uploaded images', async () => {
      // Create a simple 1200x800 PNG image using sharp
      const sharp = (await import('sharp')).default
      const imageBuffer = await sharp({
        create: {
          width: 1200,
          height: 800,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .png()
        .toBuffer()

      const file: UploadFile = {
        name: 'test-image.png',
        buffer: imageBuffer,
        mimetype: 'image/png',
        size: imageBuffer.length,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      const result = await mediaEngine.upload(file, context)

      // Verify dimensions were captured
      expect(result.width).toBe(1200)
      expect(result.height).toBe(800)

      // Verify formats were generated
      expect(result.formats).toBeDefined()
      expect(result.formats?.thumbnail).toBeDefined()
      expect(result.formats?.small).toBeDefined()
      expect(result.formats?.medium).toBeDefined()
      expect(result.formats?.large).toBeDefined()

      // Verify thumbnail format (150x150, cropped)
      expect(result.formats?.thumbnail?.width).toBe(150)
      expect(result.formats?.thumbnail?.height).toBe(150)
      expect(result.formats?.thumbnail?.url).toMatch(/\/uploads\/.*_thumbnail\.png$/)

      // Verify small format (500px width, aspect ratio preserved)
      expect(result.formats?.small?.width).toBe(500)
      expect(result.formats?.small?.height).toBeLessThanOrEqual(
        Math.round((500 / 1200) * 800)
      )
      expect(result.formats?.small?.url).toMatch(/\/uploads\/.*_small\.png$/)

      // Verify medium format (750px width, aspect ratio preserved)
      expect(result.formats?.medium?.width).toBe(750)
      expect(result.formats?.medium?.height).toBeLessThanOrEqual(
        Math.round((750 / 1200) * 800)
      )
      expect(result.formats?.medium?.url).toMatch(/\/uploads\/.*_medium\.png$/)

      // Verify large format (1000px width, aspect ratio preserved)
      expect(result.formats?.large?.width).toBe(1000)
      expect(result.formats?.large?.height).toBeLessThanOrEqual(
        Math.round((1000 / 1200) * 800)
      )
      expect(result.formats?.large?.url).toMatch(/\/uploads\/.*_large\.png$/)

      // Verify format files exist
      const thumbnailPath = join(
        uploadsDir,
        `${result.formats?.thumbnail?.hash}${result.formats?.thumbnail?.ext}`
      )
      const smallPath = join(
        uploadsDir,
        `${result.formats?.small?.hash}${result.formats?.small?.ext}`
      )
      const mediumPath = join(
        uploadsDir,
        `${result.formats?.medium?.hash}${result.formats?.medium?.ext}`
      )
      const largePath = join(
        uploadsDir,
        `${result.formats?.large?.hash}${result.formats?.large?.ext}`
      )

      expect(await fs.access(thumbnailPath).then(() => true).catch(() => false)).toBe(true)
      expect(await fs.access(smallPath).then(() => true).catch(() => false)).toBe(true)
      expect(await fs.access(mediumPath).then(() => true).catch(() => false)).toBe(true)
      expect(await fs.access(largePath).then(() => true).catch(() => false)).toBe(true)
    })

    it('should skip formats larger than original image', async () => {
      // Create a small 400x300 PNG image
      const sharp = (await import('sharp')).default
      const imageBuffer = await sharp({
        create: {
          width: 400,
          height: 300,
          channels: 3,
          background: { r: 0, g: 255, b: 0 },
        },
      })
        .png()
        .toBuffer()

      const file: UploadFile = {
        name: 'small-image.png',
        buffer: imageBuffer,
        mimetype: 'image/png',
        size: imageBuffer.length,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      const result = await mediaEngine.upload(file, context)

      // Verify dimensions
      expect(result.width).toBe(400)
      expect(result.height).toBe(300)

      // Verify formats
      expect(result.formats).toBeDefined()
      expect(result.formats?.thumbnail).toBeDefined() // Always generated
      expect(result.formats?.small).toBeUndefined() // Skipped (500 > 400)
      expect(result.formats?.medium).toBeUndefined() // Skipped (750 > 400)
      expect(result.formats?.large).toBeUndefined() // Skipped (1000 > 400)
    })

    it('should not generate formats for non-image files', async () => {
      const file: UploadFile = {
        name: 'document.pdf',
        buffer: Buffer.from('fake-pdf-data'),
        mimetype: 'application/pdf',
        size: 1024,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      const result = await mediaEngine.upload(file, context)

      // Verify no dimensions or formats for non-images
      expect(result.width).toBeUndefined()
      expect(result.height).toBeUndefined()
      expect(result.formats).toBeUndefined()
    })

    it('should not generate formats for SVG images', async () => {
      const file: UploadFile = {
        name: 'icon.svg',
        buffer: Buffer.from('<svg></svg>'),
        mimetype: 'image/svg+xml',
        size: 11,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      const result = await mediaEngine.upload(file, context)

      // Verify no dimensions or formats for SVG
      expect(result.width).toBeUndefined()
      expect(result.height).toBeUndefined()
      expect(result.formats).toBeUndefined()
    })
  })

  describe('findOne', () => {
    it('should find a media file by ID', async () => {
      const file: UploadFile = {
        name: 'test-image.jpg',
        buffer: Buffer.from('fake-image-data'),
        mimetype: 'image/jpeg',
        size: 1024,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      const uploaded = await mediaEngine.upload(file, context)
      const found = await mediaEngine.findOne(uploaded.id)

      expect(found).toEqual(uploaded)
    })

    it('should return null for non-existent ID', async () => {
      const found = await mediaEngine.findOne('non-existent-id')
      expect(found).toBeNull()
    })

    it('should return null when metadata file does not exist', async () => {
      const found = await mediaEngine.findOne('some-id')
      expect(found).toBeNull()
    })
  })

  describe('findMany', () => {
    beforeEach(async () => {
      // Upload test files
      const files: UploadFile[] = [
        {
          name: 'image1.jpg',
          buffer: Buffer.from('content-1'),
          mimetype: 'image/jpeg',
          size: 1024,
        },
        {
          name: 'image2.png',
          buffer: Buffer.from('content-2'),
          mimetype: 'image/png',
          size: 2048,
        },
        {
          name: 'document.pdf',
          buffer: Buffer.from('content-3'),
          mimetype: 'application/pdf',
          size: 4096,
        },
        {
          name: 'video.mp4',
          buffer: Buffer.from('content-4'),
          mimetype: 'video/mp4',
          size: 8192,
        },
      ]

      const context: RequestContext = {
        role: 'admin',
      }

      await mediaEngine.uploadMany(files, context)
    })

    it('should return all media files without query', async () => {
      const result = await mediaEngine.findMany()

      expect(result.data).toHaveLength(4)
      expect(result.meta.pagination.total).toBe(4)
      expect(result.meta.pagination.page).toBe(1)
      expect(result.meta.pagination.pageSize).toBe(25)
    })

    it('should filter by mime type (exact match)', async () => {
      const result = await mediaEngine.findMany({
        filters: {
          mime: { $eq: 'image/jpeg' },
        },
      })

      expect(result.data).toHaveLength(1)
      expect(result.data[0].mime).toBe('image/jpeg')
    })

    it('should filter by mime type (contains)', async () => {
      const result = await mediaEngine.findMany({
        filters: {
          mime: { $contains: 'image' },
        },
      })

      expect(result.data).toHaveLength(2)
      expect(result.data.every((f) => f.mime.includes('image'))).toBe(true)
    })

    it('should filter by size (greater than)', async () => {
      const result = await mediaEngine.findMany({
        filters: {
          size: { $gt: 2000 },
        },
      })

      expect(result.data).toHaveLength(3)
      expect(result.data.every((f) => f.size > 2000)).toBe(true)
    })

    it('should filter by size (less than or equal)', async () => {
      const result = await mediaEngine.findMany({
        filters: {
          size: { $lte: 2048 },
        },
      })

      expect(result.data).toHaveLength(2)
      expect(result.data.every((f) => f.size <= 2048)).toBe(true)
    })

    it('should filter by size range', async () => {
      const result = await mediaEngine.findMany({
        filters: {
          size: { $gte: 2000, $lte: 5000 },
        },
      })

      expect(result.data).toHaveLength(2)
      expect(result.data.every((f) => f.size >= 2000 && f.size <= 5000)).toBe(true)
    })

    it('should filter by name (contains)', async () => {
      const result = await mediaEngine.findMany({
        filters: {
          name: { $contains: 'image' },
        },
      })

      expect(result.data).toHaveLength(2)
      expect(result.data.every((f) => f.name.includes('image'))).toBe(true)
    })

    it('should filter by extension', async () => {
      const result = await mediaEngine.findMany({
        filters: {
          ext: { $eq: '.jpg' },
        },
      })

      expect(result.data).toHaveLength(1)
      expect(result.data[0].ext).toBe('.jpg')
    })

    it('should support $in operator', async () => {
      const result = await mediaEngine.findMany({
        filters: {
          mime: { $in: ['image/jpeg', 'image/png'] },
        },
      })

      expect(result.data).toHaveLength(2)
      expect(result.data.every((f) => ['image/jpeg', 'image/png'].includes(f.mime))).toBe(
        true
      )
    })

    it('should support $and logical operator', async () => {
      const result = await mediaEngine.findMany({
        filters: {
          $and: [{ mime: { $contains: 'image' } }, { size: { $gt: 1500 } }],
        },
      })

      expect(result.data).toHaveLength(1)
      expect(result.data[0].mime).toContain('image')
      expect(result.data[0].size).toBeGreaterThan(1500)
    })

    it('should support $or logical operator', async () => {
      const result = await mediaEngine.findMany({
        filters: {
          $or: [{ mime: { $eq: 'application/pdf' } }, { mime: { $eq: 'video/mp4' } }],
        },
      })

      expect(result.data).toHaveLength(2)
      expect(result.data.some((f) => f.mime === 'application/pdf')).toBe(true)
      expect(result.data.some((f) => f.mime === 'video/mp4')).toBe(true)
    })

    it('should sort by size ascending', async () => {
      const result = await mediaEngine.findMany({
        sort: [{ field: 'size', order: 'asc' }],
      })

      expect(result.data).toHaveLength(4)
      expect(result.data[0].size).toBe(1024)
      expect(result.data[1].size).toBe(2048)
      expect(result.data[2].size).toBe(4096)
      expect(result.data[3].size).toBe(8192)
    })

    it('should sort by size descending', async () => {
      const result = await mediaEngine.findMany({
        sort: [{ field: 'size', order: 'desc' }],
      })

      expect(result.data).toHaveLength(4)
      expect(result.data[0].size).toBe(8192)
      expect(result.data[1].size).toBe(4096)
      expect(result.data[2].size).toBe(2048)
      expect(result.data[3].size).toBe(1024)
    })

    it('should sort by name', async () => {
      const result = await mediaEngine.findMany({
        sort: [{ field: 'name', order: 'asc' }],
      })

      expect(result.data).toHaveLength(4)
      const names = result.data.map((f) => f.name)
      expect(names).toEqual([...names].sort())
    })

    it('should paginate results (page/pageSize)', async () => {
      const result = await mediaEngine.findMany({
        pagination: { page: 1, pageSize: 2 },
      })

      expect(result.data).toHaveLength(2)
      expect(result.meta.pagination.page).toBe(1)
      expect(result.meta.pagination.pageSize).toBe(2)
      expect(result.meta.pagination.total).toBe(4)
      expect(result.meta.pagination.pageCount).toBe(2)
    })

    it('should paginate results (start/limit)', async () => {
      const result = await mediaEngine.findMany({
        pagination: { start: 1, limit: 2 },
      })

      expect(result.data).toHaveLength(2)
      expect(result.meta.pagination.total).toBe(4)
    })

    it('should return second page', async () => {
      const result = await mediaEngine.findMany({
        pagination: { page: 2, pageSize: 2 },
      })

      expect(result.data).toHaveLength(2)
      expect(result.meta.pagination.page).toBe(2)
      expect(result.meta.pagination.pageSize).toBe(2)
      expect(result.meta.pagination.total).toBe(4)
    })

    it('should combine filters, sorting, and pagination', async () => {
      const result = await mediaEngine.findMany({
        filters: {
          mime: { $contains: 'image' },
        },
        sort: [{ field: 'size', order: 'desc' }],
        pagination: { page: 1, pageSize: 1 },
      })

      expect(result.data).toHaveLength(1)
      expect(result.data[0].mime).toContain('image')
      expect(result.data[0].size).toBe(2048) // Largest image
      expect(result.meta.pagination.total).toBe(2)
    })

    it('should return empty result when no files match filter', async () => {
      const result = await mediaEngine.findMany({
        filters: {
          mime: { $eq: 'image/gif' },
        },
      })

      expect(result.data).toHaveLength(0)
      expect(result.meta.pagination.total).toBe(0)
    })

    it('should return empty result when metadata file does not exist', async () => {
      // Create a new engine with empty directory
      const emptyTestDir = join(
        process.cwd(),
        'test-data',
        `media-empty-${Date.now()}-${Math.random().toString(36).substring(2)}`
      )
      await fs.mkdir(emptyTestDir, { recursive: true })
      await fs.mkdir(join(emptyTestDir, '.cms'), { recursive: true })

      const emptyEngine = new MediaEngine(fileEngine, emptyTestDir)
      const result = await emptyEngine.findMany()

      expect(result.data).toHaveLength(0)
      expect(result.meta.pagination.total).toBe(0)

      // Cleanup
      await fs.rm(emptyTestDir, { recursive: true, force: true })
    })
  })

  describe('update', () => {
    it('should update media file metadata', async () => {
      const file: UploadFile = {
        name: 'test-image.jpg',
        buffer: Buffer.from('fake-image-data'),
        mimetype: 'image/jpeg',
        size: 1024,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      const uploaded = await mediaEngine.upload(file, context)

      // Update metadata
      const updated = await mediaEngine.update(uploaded.id, {
        alternativeText: 'A test image',
        caption: 'This is a caption',
        name: 'updated-name.jpg',
      })

      expect(updated.id).toBe(uploaded.id)
      expect(updated.alternativeText).toBe('A test image')
      expect(updated.caption).toBe('This is a caption')
      expect(updated.name).toBe('updated-name.jpg')
      expect(updated.updatedAt).not.toBe(uploaded.updatedAt)

      // Verify metadata was persisted
      const found = await mediaEngine.findOne(uploaded.id)
      expect(found?.alternativeText).toBe('A test image')
      expect(found?.caption).toBe('This is a caption')
      expect(found?.name).toBe('updated-name.jpg')
    })

    it('should update only specified fields', async () => {
      const file: UploadFile = {
        name: 'test-image.jpg',
        buffer: Buffer.from('fake-image-data'),
        mimetype: 'image/jpeg',
        size: 1024,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      const uploaded = await mediaEngine.upload(file, context)

      // Update only alternativeText
      const updated = await mediaEngine.update(uploaded.id, {
        alternativeText: 'Alt text only',
      })

      expect(updated.alternativeText).toBe('Alt text only')
      expect(updated.caption).toBeUndefined()
      expect(updated.name).toBe('test-image.jpg') // Original name preserved
    })

    it('should update folder field', async () => {
      const file: UploadFile = {
        name: 'test-image.jpg',
        buffer: Buffer.from('fake-image-data'),
        mimetype: 'image/jpeg',
        size: 1024,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      const uploaded = await mediaEngine.upload(file, context)

      // Update folder
      const updated = await mediaEngine.update(uploaded.id, {
        folder: 'images/products',
      })

      expect(updated.folder).toBe('images/products')

      // Verify metadata was persisted
      const found = await mediaEngine.findOne(uploaded.id)
      expect(found?.folder).toBe('images/products')
    })

    it('should throw error for non-existent media file', async () => {
      // First upload a file to create the metadata file
      const file: UploadFile = {
        name: 'test-image.jpg',
        buffer: Buffer.from('fake-image-data'),
        mimetype: 'image/jpeg',
        size: 1024,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      await mediaEngine.upload(file, context)

      // Now try to update a non-existent ID
      await expect(
        mediaEngine.update('non-existent-id', {
          alternativeText: 'Test',
        })
      ).rejects.toThrow('Media file with ID non-existent-id not found')
    })

    it('should throw error when metadata file does not exist', async () => {
      await expect(
        mediaEngine.update('some-id', {
          alternativeText: 'Test',
        })
      ).rejects.toThrow('Media metadata file not found')
    })
  })

  describe('delete', () => {
    it('should delete media file and its metadata', async () => {
      const file: UploadFile = {
        name: 'test-image.jpg',
        buffer: Buffer.from('fake-image-data'),
        mimetype: 'image/jpeg',
        size: 1024,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      const uploaded = await mediaEngine.upload(file, context)
      const filePath = join(uploadsDir, `${uploaded.hash}${uploaded.ext}`)

      // Verify file exists
      expect(await fs.access(filePath).then(() => true).catch(() => false)).toBe(true)

      // Delete the media file
      await mediaEngine.delete(uploaded.id)

      // Verify file was deleted
      expect(await fs.access(filePath).then(() => true).catch(() => false)).toBe(false)

      // Verify metadata was removed
      const found = await mediaEngine.findOne(uploaded.id)
      expect(found).toBeNull()
    })

    it('should delete all format files for images', async () => {
      // Create a simple 1200x800 PNG image using sharp
      const sharp = (await import('sharp')).default
      const imageBuffer = await sharp({
        create: {
          width: 1200,
          height: 800,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .png()
        .toBuffer()

      const file: UploadFile = {
        name: 'test-image.png',
        buffer: imageBuffer,
        mimetype: 'image/png',
        size: imageBuffer.length,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      const uploaded = await mediaEngine.upload(file, context)

      // Verify main file and formats exist
      const mainFilePath = join(uploadsDir, `${uploaded.hash}${uploaded.ext}`)
      expect(await fs.access(mainFilePath).then(() => true).catch(() => false)).toBe(true)

      const thumbnailPath = join(
        uploadsDir,
        `${uploaded.formats?.thumbnail?.hash}${uploaded.formats?.thumbnail?.ext}`
      )
      const smallPath = join(
        uploadsDir,
        `${uploaded.formats?.small?.hash}${uploaded.formats?.small?.ext}`
      )
      const mediumPath = join(
        uploadsDir,
        `${uploaded.formats?.medium?.hash}${uploaded.formats?.medium?.ext}`
      )
      const largePath = join(
        uploadsDir,
        `${uploaded.formats?.large?.hash}${uploaded.formats?.large?.ext}`
      )

      expect(await fs.access(thumbnailPath).then(() => true).catch(() => false)).toBe(true)
      expect(await fs.access(smallPath).then(() => true).catch(() => false)).toBe(true)
      expect(await fs.access(mediumPath).then(() => true).catch(() => false)).toBe(true)
      expect(await fs.access(largePath).then(() => true).catch(() => false)).toBe(true)

      // Delete the media file
      await mediaEngine.delete(uploaded.id)

      // Verify all files were deleted
      expect(await fs.access(mainFilePath).then(() => true).catch(() => false)).toBe(false)
      expect(await fs.access(thumbnailPath).then(() => true).catch(() => false)).toBe(false)
      expect(await fs.access(smallPath).then(() => true).catch(() => false)).toBe(false)
      expect(await fs.access(mediumPath).then(() => true).catch(() => false)).toBe(false)
      expect(await fs.access(largePath).then(() => true).catch(() => false)).toBe(false)

      // Verify metadata was removed
      const found = await mediaEngine.findOne(uploaded.id)
      expect(found).toBeNull()
    })

    it('should handle deletion when main file does not exist', async () => {
      const file: UploadFile = {
        name: 'test-image.jpg',
        buffer: Buffer.from('fake-image-data'),
        mimetype: 'image/jpeg',
        size: 1024,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      const uploaded = await mediaEngine.upload(file, context)
      const filePath = join(uploadsDir, `${uploaded.hash}${uploaded.ext}`)

      // Manually delete the file
      await fs.unlink(filePath)

      // Delete should still succeed and remove metadata
      await expect(mediaEngine.delete(uploaded.id)).resolves.not.toThrow()

      // Verify metadata was removed
      const found = await mediaEngine.findOne(uploaded.id)
      expect(found).toBeNull()
    })

    it('should throw error for non-existent media file', async () => {
      // First upload a file to create the metadata file
      const file: UploadFile = {
        name: 'test-image.jpg',
        buffer: Buffer.from('fake-image-data'),
        mimetype: 'image/jpeg',
        size: 1024,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      await mediaEngine.upload(file, context)

      // Now try to delete a non-existent ID
      await expect(mediaEngine.delete('non-existent-id')).rejects.toThrow(
        'Media file with ID non-existent-id not found'
      )
    })

    it('should throw error when metadata file does not exist', async () => {
      await expect(mediaEngine.delete('some-id')).rejects.toThrow(
        'Media metadata file not found'
      )
    })

    it('should delete only the specified file, not others', async () => {
      const files: UploadFile[] = [
        {
          name: 'file1.jpg',
          buffer: Buffer.from('content-1'),
          mimetype: 'image/jpeg',
          size: 1024,
        },
        {
          name: 'file2.jpg',
          buffer: Buffer.from('content-2'),
          mimetype: 'image/jpeg',
          size: 1024,
        },
      ]

      const context: RequestContext = {
        role: 'admin',
      }

      const uploaded = await mediaEngine.uploadMany(files, context)

      // Delete first file
      await mediaEngine.delete(uploaded[0].id)

      // Verify first file is deleted
      const found1 = await mediaEngine.findOne(uploaded[0].id)
      expect(found1).toBeNull()

      // Verify second file still exists
      const found2 = await mediaEngine.findOne(uploaded[1].id)
      expect(found2).not.toBeNull()
      expect(found2?.id).toBe(uploaded[1].id)
    })
  })

  describe('folder operations', () => {
    it('should create a folder without parent', async () => {
      const folder = await mediaEngine.createFolder('My Folder')

      expect(folder.id).toBeDefined()
      expect(folder.name).toBe('My Folder')
      expect(folder.parent).toBeUndefined()
      expect(folder.createdAt).toBeDefined()
      expect(folder.updatedAt).toBeDefined()

      // Verify folder was written to folders.json
      const foldersPath = join(testDir, '.cms', 'folders.json')
      const foldersContent = await fs.readFile(foldersPath, 'utf8')
      const folders = JSON.parse(foldersContent)
      expect(folders[folder.id]).toEqual(folder)
    })

    it('should create a folder with parent', async () => {
      const parentFolder = await mediaEngine.createFolder('Parent Folder')
      const childFolder = await mediaEngine.createFolder('Child Folder', parentFolder.id)

      expect(childFolder.id).toBeDefined()
      expect(childFolder.name).toBe('Child Folder')
      expect(childFolder.parent).toBe(parentFolder.id)
      expect(childFolder.createdAt).toBeDefined()
      expect(childFolder.updatedAt).toBeDefined()

      // Verify both folders exist in folders.json
      const foldersPath = join(testDir, '.cms', 'folders.json')
      const foldersContent = await fs.readFile(foldersPath, 'utf8')
      const folders = JSON.parse(foldersContent)
      expect(folders[parentFolder.id]).toEqual(parentFolder)
      expect(folders[childFolder.id]).toEqual(childFolder)
    })

    it('should throw error when parent folder does not exist', async () => {
      await expect(
        mediaEngine.createFolder('Child Folder', 'non-existent-parent-id')
      ).rejects.toThrow('Parent folder with ID non-existent-parent-id not found')
    })

    it('should create multiple folders', async () => {
      const folder1 = await mediaEngine.createFolder('Folder 1')
      const folder2 = await mediaEngine.createFolder('Folder 2')
      const folder3 = await mediaEngine.createFolder('Folder 3')

      // Verify all folders exist in folders.json
      const foldersPath = join(testDir, '.cms', 'folders.json')
      const foldersContent = await fs.readFile(foldersPath, 'utf8')
      const folders = JSON.parse(foldersContent)
      expect(Object.keys(folders)).toHaveLength(3)
      expect(folders[folder1.id]).toEqual(folder1)
      expect(folders[folder2.id]).toEqual(folder2)
      expect(folders[folder3.id]).toEqual(folder3)
    })

    it('should move a file to a folder', async () => {
      // Create a folder
      const folder = await mediaEngine.createFolder('Images')

      // Upload a file
      const file: UploadFile = {
        name: 'test-image.jpg',
        buffer: Buffer.from('fake-image-data'),
        mimetype: 'image/jpeg',
        size: 1024,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      const uploaded = await mediaEngine.upload(file, context)

      // Move file to folder
      const updated = await mediaEngine.moveToFolder(uploaded.id, folder.id)

      expect(updated.id).toBe(uploaded.id)
      expect(updated.folder).toBe(folder.id)
      expect(updated.updatedAt).not.toBe(uploaded.updatedAt)

      // Verify file metadata was updated
      const found = await mediaEngine.findOne(uploaded.id)
      expect(found?.folder).toBe(folder.id)
    })

    it('should throw error when moving file to non-existent folder', async () => {
      // Create a folder first to ensure folders.json exists
      await mediaEngine.createFolder('Dummy Folder')

      // Upload a file
      const file: UploadFile = {
        name: 'test-image.jpg',
        buffer: Buffer.from('fake-image-data'),
        mimetype: 'image/jpeg',
        size: 1024,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      const uploaded = await mediaEngine.upload(file, context)

      // Try to move to non-existent folder
      await expect(
        mediaEngine.moveToFolder(uploaded.id, 'non-existent-folder-id')
      ).rejects.toThrow('Folder with ID non-existent-folder-id not found')
    })

    it('should throw error when moving non-existent file', async () => {
      // Create a folder
      const folder = await mediaEngine.createFolder('Images')

      // Upload a file first to ensure media.json exists
      const file: UploadFile = {
        name: 'dummy.jpg',
        buffer: Buffer.from('dummy-data'),
        mimetype: 'image/jpeg',
        size: 1024,
      }

      const context: RequestContext = {
        role: 'admin',
      }

      await mediaEngine.upload(file, context)

      // Try to move non-existent file
      await expect(
        mediaEngine.moveToFolder('non-existent-file-id', folder.id)
      ).rejects.toThrow('Media file with ID non-existent-file-id not found')
    })

    it('should filter files by folder', async () => {
      // Create folders
      const folder1 = await mediaEngine.createFolder('Folder 1')
      const folder2 = await mediaEngine.createFolder('Folder 2')

      // Upload files
      const files: UploadFile[] = [
        {
          name: 'file1.jpg',
          buffer: Buffer.from('content-1'),
          mimetype: 'image/jpeg',
          size: 1024,
        },
        {
          name: 'file2.jpg',
          buffer: Buffer.from('content-2'),
          mimetype: 'image/jpeg',
          size: 2048,
        },
        {
          name: 'file3.jpg',
          buffer: Buffer.from('content-3'),
          mimetype: 'image/jpeg',
          size: 3072,
        },
      ]

      const context: RequestContext = {
        role: 'admin',
      }

      const uploaded = await mediaEngine.uploadMany(files, context)

      // Move files to folders
      await mediaEngine.moveToFolder(uploaded[0].id, folder1.id)
      await mediaEngine.moveToFolder(uploaded[1].id, folder1.id)
      await mediaEngine.moveToFolder(uploaded[2].id, folder2.id)

      // Query files in folder1
      const result1 = await mediaEngine.findMany({
        filters: {
          folder: folder1.id,
        },
      })

      expect(result1.data).toHaveLength(2)
      expect(result1.data.map((f) => f.id).sort()).toEqual(
        [uploaded[0].id, uploaded[1].id].sort()
      )

      // Query files in folder2
      const result2 = await mediaEngine.findMany({
        filters: {
          folder: folder2.id,
        },
      })

      expect(result2.data).toHaveLength(1)
      expect(result2.data[0].id).toBe(uploaded[2].id)
    })
  })
})
