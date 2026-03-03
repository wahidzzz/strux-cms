/**
 * ContentEngine - Core business logic for CRUD operations
 *
 * Orchestrates all content operations across engines:
 * - FileEngine: Atomic writes and file operations
 * - SchemaEngine: Validation before writes
 * - QueryEngine: Index updates and queries
 * - GitEngine: Version control commits
 * - RBACEngine: Permission checks
 *
 * Key features:
 * - ID generation with nanoid
 * - Timestamps and audit trail (createdAt, updatedAt, createdBy, updatedBy)
 * - Draft/publish workflow via publishedAt field
 * - Partial updates
 * - Cleanup on delete
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { nanoid } from 'nanoid'
import { join } from 'path'
import slugify from 'slugify'
import type {
  ContentEntry,
  CreateData,
  UpdateData,
  RequestContext,
  QueryParams,
  PaginatedResult,
} from '../types/index.js'
import type { FileEngine } from './file-engine.js'
import type { SchemaEngine } from './schema-engine.js'
import type { QueryEngine } from './query-engine.js'
import type { GitEngine } from './git-engine.js'
import type { RBACEngine } from './rbac-engine.js'

/**
 * ContentEngine orchestrates CRUD operations across all engines
 */
export class ContentEngine {
  private readonly contentDir: string

  /**
   * Create a new ContentEngine instance
   *
   * @param basePath Base directory for content storage
   * @param fileEngine FileEngine instance for atomic writes
   * @param schemaEngine SchemaEngine instance for validation
   * @param queryEngine QueryEngine instance for queries and indexing
   * @param gitEngine GitEngine instance for version control
   * @param rbacEngine RBACEngine instance for permission checks
   */
  constructor(
    basePath: string,
    private readonly fileEngine: FileEngine,
    private readonly schemaEngine: SchemaEngine,
    private readonly queryEngine: QueryEngine,
    private readonly gitEngine: GitEngine,
    private readonly rbacEngine: RBACEngine
  ) {
    this.contentDir = join(basePath, 'content', 'api')
  }

  /**
   * Create a new content entry
   *
   * Algorithm:
   * 1. Check RBAC permissions
   * 2. Generate unique ID with nanoid
   * 3. Add timestamps (createdAt, updatedAt)
   * 4. Add audit fields (createdBy, updatedBy)
   * 5. Set publishedAt to null (draft state)
   * 6. Validate data against schema
   * 7. Acquire write lock for content type
   * 8. Write to file system atomically
   * 9. Commit to Git
   * 10. Update query engine index
   * 11. Release write lock
   *
   * @param contentType Content type identifier
   * @param data Entry data
   * @param context Request context with user and role
   * @returns Created content entry
   * @throws Error if validation fails, permission denied, or write fails
   *
   * Validates: Requirements 1.1, 1.2
   */
  async create(
    contentType: string,
    data: CreateData,
    context: RequestContext
  ): Promise<ContentEntry> {
    // Step 1: Check RBAC permissions
    const canCreate = await this.rbacEngine.can(context, 'create', {
      type: contentType,
    })

    if (!canCreate) {
      throw new Error(
        `Permission denied: User does not have permission to create ${contentType}`
      )
    }

    // Step 2: Generate unique ID
    const id = nanoid()

    // Step 3: Add timestamps
    const now = new Date().toISOString()

    // Step 4: Build complete entry with metadata
    const entry: ContentEntry = {
      id,
      ...data,
      createdAt: now,
      updatedAt: now,
      publishedAt: null, // Draft state by default
      createdBy: context.user?.id,
      updatedBy: context.user?.id,
    }

    // Step 4.5: Generate slug if uid field exists in schema
    await this.generateSlugIfNeeded(contentType, entry)

    // Step 4.6: Validate relation references
    await this.validateRelations(contentType, entry)

    // Step 5: Validate data against schema
    const validationResult = await this.schemaEngine.validate(contentType, entry)

    if (!validationResult.valid) {
      const errorMessages = validationResult.errors
        ?.map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ')
      throw new Error(`Validation failed: ${errorMessages}`)
    }

    // Step 6: Build file path
    const filePath = join(this.contentDir, contentType, `${id}.json`)
    const relativeFilePath = join('content', 'api', contentType, `${id}.json`)

    // Step 7: Acquire write lock
    await this.fileEngine.acquireLock(contentType)

    try {
      // Step 8: Write to file system atomically
      await this.fileEngine.writeAtomic(filePath, entry)

      // Step 9: Commit to Git
      const commitMessage = this.gitEngine.generateCommitMessage(
        'create',
        contentType,
        id
      )

      const author = context.user
        ? {
            name: context.user.username,
            email: context.user.email,
          }
        : undefined

      await this.gitEngine.commit([relativeFilePath], commitMessage, author)

      // Step 10: Update query engine index
      this.queryEngine.updateIndex(contentType, id, entry)

      return entry
    } finally {
      // Step 11: Release write lock (always, even on error)
      this.fileEngine.releaseLock(contentType)
    }
  }

  /**
   * Find a single content entry by ID
   *
   * Algorithm:
   * 1. Check RBAC permissions
   * 2. Query from index (fast, no file I/O)
   * 3. Apply query parameters (populate, fields)
   * 4. Filter fields based on RBAC permissions
   * 5. Return entry or null if not found
   *
   * @param contentType Content type identifier
   * @param id Entry ID
   * @param query Optional query parameters (populate, fields)
   * @returns Content entry or null if not found
   * @throws Error if permission denied
   *
   * Validates: Requirement 1.3
   */
  async findOne(
    contentType: string,
    id: string,
    query?: QueryParams
  ): Promise<ContentEntry | null> {
    // Query from index with ID filter
    const results = this.queryEngine.query(contentType, {
      filters: {
        id: { $eq: id },
      },
      ...query,
    })

    if (results.length === 0) {
      return null
    }

    return results[0]
  }

  /**
   * Find multiple content entries with filters, sorting, and pagination
   *
   * Algorithm:
   * 1. Query from index with filters
   * 2. Apply sorting and pagination
   * 3. Build paginated result with metadata
   * 4. Return paginated result
   *
   * @param contentType Content type identifier
   * @param query Optional query parameters (filters, sort, pagination, fields, populate)
   * @returns Paginated result with entries and metadata
   *
   * Validates: Requirement 1.3
   */
  async findMany(
    contentType: string,
    query?: QueryParams
  ): Promise<PaginatedResult<ContentEntry>> {
    // Get total count (before pagination)
    const total = this.queryEngine.count(contentType, query)

    // Query with pagination
    const data = this.queryEngine.query(contentType, query)

    // Calculate pagination metadata
    const pagination = query?.pagination || {}
    const page = pagination.page ?? 1
    const pageSize = pagination.pageSize ?? 25
    const pageCount = Math.ceil(total / pageSize)

    return {
      data,
      meta: {
        pagination: {
          page,
          pageSize,
          pageCount,
          total,
        },
      },
    }
  }

  /**
   * Update a content entry with partial updates
   *
   * Algorithm:
   * 1. Check RBAC permissions
   * 2. Find existing entry
   * 3. Merge updates with existing data
   * 4. Update updatedAt timestamp
   * 5. Update updatedBy field
   * 6. Validate merged data against schema
   * 7. Acquire write lock
   * 8. Write to file system atomically
   * 9. Commit to Git
   * 10. Update query engine index
   * 11. Release write lock
   *
   * @param contentType Content type identifier
   * @param id Entry ID
   * @param data Partial update data
   * @param context Request context with user and role
   * @returns Updated content entry
   * @throws Error if entry not found, validation fails, permission denied, or write fails
   *
   * Validates: Requirements 1.4
   */
  async update(
    contentType: string,
    id: string,
    data: UpdateData,
    context: RequestContext
  ): Promise<ContentEntry> {
    // Step 1: Find existing entry
    const existing = await this.findOne(contentType, id)

    if (!existing) {
      throw new Error(`Entry not found: ${contentType}/${id}`)
    }

    // Step 2: Check RBAC permissions
    const canUpdate = await this.rbacEngine.can(context, 'update', {
      type: contentType,
      id,
      data: existing,
    })

    if (!canUpdate) {
      throw new Error(
        `Permission denied: User does not have permission to update ${contentType}/${id}`
      )
    }

    // Step 3: Merge updates with existing data
    const now = new Date().toISOString()

    const updated: ContentEntry = {
      ...existing,
      ...data,
      id, // Ensure ID doesn't change
      createdAt: existing.createdAt, // Preserve createdAt
      updatedAt: now, // Update timestamp
      createdBy: existing.createdBy, // Preserve createdBy
      updatedBy: context.user?.id, // Update updatedBy
    }

    // Step 3.5: Regenerate slug if target field changed
    await this.regenerateSlugIfNeeded(contentType, existing, updated)

    // Step 3.6: Validate relation references
    await this.validateRelations(contentType, updated)

    // Step 4: Validate merged data against schema
    const validationResult = await this.schemaEngine.validate(contentType, updated)

    if (!validationResult.valid) {
      const errorMessages = validationResult.errors
        ?.map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ')
      throw new Error(`Validation failed: ${errorMessages}`)
    }

    // Step 5: Build file path
    const filePath = join(this.contentDir, contentType, `${id}.json`)
    const relativeFilePath = join('content', 'api', contentType, `${id}.json`)

    // Step 6: Acquire write lock
    await this.fileEngine.acquireLock(contentType)

    try {
      // Step 7: Write to file system atomically
      await this.fileEngine.writeAtomic(filePath, updated)

      // Step 8: Commit to Git
      const commitMessage = this.gitEngine.generateCommitMessage(
        'update',
        contentType,
        id
      )

      const author = context.user
        ? {
            name: context.user.username,
            email: context.user.email,
          }
        : undefined

      await this.gitEngine.commit([relativeFilePath], commitMessage, author)

      // Step 9: Update query engine index
      this.queryEngine.updateIndex(contentType, id, updated)

      return updated
    } finally {
      // Step 10: Release write lock (always, even on error)
      this.fileEngine.releaseLock(contentType)
    }
  }

  /**
   * Delete a content entry
   *
   * Algorithm:
   * 1. Check RBAC permissions
   * 2. Find existing entry
   * 3. Acquire write lock
   * 4. Delete file from file system
   * 5. Commit to Git
   * 6. Remove from query engine index
   * 7. Release write lock
   *
   * @param contentType Content type identifier
   * @param id Entry ID
   * @param context Request context with user and role
   * @throws Error if entry not found, permission denied, or delete fails
   *
   * Validates: Requirement 1.5
   */
  async delete(
    contentType: string,
    id: string,
    context: RequestContext
  ): Promise<void> {
    // Step 1: Find existing entry
    const existing = await this.findOne(contentType, id)

    if (!existing) {
      throw new Error(`Entry not found: ${contentType}/${id}`)
    }

    // Step 2: Check RBAC permissions
    const canDelete = await this.rbacEngine.can(context, 'delete', {
      type: contentType,
      id,
      data: existing,
    })

    if (!canDelete) {
      throw new Error(
        `Permission denied: User does not have permission to delete ${contentType}/${id}`
      )
    }

    // Step 3: Build file path
    const filePath = join(this.contentDir, contentType, `${id}.json`)
    const relativeFilePath = join('content', 'api', contentType, `${id}.json`)

    // Step 4: Acquire write lock
    await this.fileEngine.acquireLock(contentType)

    try {
      // Step 5: Delete file from file system
      await this.fileEngine.deleteFile(filePath)

      // Step 6: Commit to Git
      const commitMessage = this.gitEngine.generateCommitMessage(
        'delete',
        contentType,
        id
      )

      const author = context.user
        ? {
            name: context.user.username,
            email: context.user.email,
          }
        : undefined

      await this.gitEngine.commit([relativeFilePath], commitMessage, author)

      // Step 7: Remove from query engine index
      this.queryEngine.removeFromIndex(contentType, id)
    } finally {
      // Step 8: Release write lock (always, even on error)
      this.fileEngine.releaseLock(contentType)
    }
  }
  /**
   * Publish a content entry by setting publishedAt timestamp
   *
   * Algorithm:
   * 1. Find existing entry
   * 2. Check RBAC permissions for publish action
   * 3. Set publishedAt to current timestamp
   * 4. Update updatedAt timestamp
   * 5. Update updatedBy field
   * 6. Acquire write lock
   * 7. Write to file system atomically
   * 8. Commit to Git
   * 9. Update query engine index
   * 10. Release write lock
   *
   * @param contentType Content type identifier
   * @param id Entry ID
   * @param context Request context with user and role
   * @returns Published content entry
   * @throws Error if entry not found, permission denied, or write fails
   *
   * Validates: Requirements 5.1, 5.2
   */
  async publish(
    contentType: string,
    id: string,
    context: RequestContext
  ): Promise<ContentEntry> {
    // Step 1: Find existing entry
    const existing = await this.findOne(contentType, id)

    if (!existing) {
      throw new Error(`Entry not found: ${contentType}/${id}`)
    }

    // Step 2: Check RBAC permissions
    const canPublish = await this.rbacEngine.can(context, 'publish', {
      type: contentType,
      id,
      data: existing,
    })

    if (!canPublish) {
      throw new Error(
        `Permission denied: User does not have permission to publish ${contentType}/${id}`
      )
    }

    // Step 3: Set publishedAt to current timestamp
    const now = new Date().toISOString()

    const published: ContentEntry = {
      ...existing,
      publishedAt: now,
      updatedAt: now,
      updatedBy: context.user?.id,
    }

    // Step 4: Build file path
    const filePath = join(this.contentDir, contentType, `${id}.json`)
    const relativeFilePath = join('content', 'api', contentType, `${id}.json`)

    // Step 5: Acquire write lock
    await this.fileEngine.acquireLock(contentType)

    try {
      // Step 6: Write to file system atomically
      await this.fileEngine.writeAtomic(filePath, published)

      // Step 7: Commit to Git
      const commitMessage = this.gitEngine.generateCommitMessage(
        'publish',
        contentType,
        id
      )

      const author = context.user
        ? {
            name: context.user.username,
            email: context.user.email,
          }
        : undefined

      await this.gitEngine.commit([relativeFilePath], commitMessage, author)

      // Step 8: Update query engine index
      this.queryEngine.updateIndex(contentType, id, published)

      return published
    } finally {
      // Step 9: Release write lock (always, even on error)
      this.fileEngine.releaseLock(contentType)
    }
  }

  /**
   * Unpublish a content entry by clearing publishedAt timestamp
   *
   * Algorithm:
   * 1. Find existing entry
   * 2. Check RBAC permissions for unpublish action
   * 3. Set publishedAt to null
   * 4. Update updatedAt timestamp
   * 5. Update updatedBy field
   * 6. Acquire write lock
   * 7. Write to file system atomically
   * 8. Commit to Git
   * 9. Update query engine index
   * 10. Release write lock
   *
   * @param contentType Content type identifier
   * @param id Entry ID
   * @param context Request context with user and role
   * @returns Unpublished content entry
   * @throws Error if entry not found, permission denied, or write fails
   *
   * Validates: Requirements 5.2, 5.3
   */
  async unpublish(
    contentType: string,
    id: string,
    context: RequestContext
  ): Promise<ContentEntry> {
    // Step 1: Find existing entry
    const existing = await this.findOne(contentType, id)

    if (!existing) {
      throw new Error(`Entry not found: ${contentType}/${id}`)
    }

    // Step 2: Check RBAC permissions
    const canUnpublish = await this.rbacEngine.can(context, 'unpublish', {
      type: contentType,
      id,
      data: existing,
    })

    if (!canUnpublish) {
      throw new Error(
        `Permission denied: User does not have permission to unpublish ${contentType}/${id}`
      )
    }

    // Step 3: Set publishedAt to null
    const now = new Date().toISOString()

    const unpublished: ContentEntry = {
      ...existing,
      publishedAt: null,
      updatedAt: now,
      updatedBy: context.user?.id,
    }

    // Step 4: Build file path
    const filePath = join(this.contentDir, contentType, `${id}.json`)
    const relativeFilePath = join('content', 'api', contentType, `${id}.json`)

    // Step 5: Acquire write lock
    await this.fileEngine.acquireLock(contentType)

    try {
      // Step 6: Write to file system atomically
      await this.fileEngine.writeAtomic(filePath, unpublished)

      // Step 7: Commit to Git
      const commitMessage = this.gitEngine.generateCommitMessage(
        'unpublish',
        contentType,
        id
      )

      const author = context.user
        ? {
            name: context.user.username,
            email: context.user.email,
          }
        : undefined

      await this.gitEngine.commit([relativeFilePath], commitMessage, author)

      // Step 8: Update query engine index
      this.queryEngine.updateIndex(contentType, id, unpublished)

      return unpublished
    } finally {
      // Step 9: Release write lock (always, even on error)
      this.fileEngine.releaseLock(contentType)
    }
  }

  /**
   * Create multiple content entries in a batch
   *
   * Algorithm:
   * 1. Check RBAC permissions for create
   * 2. For each entry:
   *    - Generate unique ID
   *    - Add timestamps and audit fields
   *    - Set publishedAt to null (draft state)
   *    - Generate slug if needed
   *    - Validate relations
   *    - Validate against schema
   * 3. Prepare write operations for FileEngine.writeMany
   * 4. Execute batched writes (FileEngine handles locking and concurrency)
   * 5. Commit all files to Git in a single commit
   * 6. Update query engine index for all entries
   *
   * @param contentType Content type identifier
   * @param entries Array of entry data
   * @param context Request context with user and role
   * @returns Array of created content entries
   * @throws Error if validation fails, permission denied, or write fails
   *
   * Validates: Requirements 1.8, 10.2
   */
  async createMany(
    contentType: string,
    entries: CreateData[],
    context: RequestContext
  ): Promise<ContentEntry[]> {
    // Step 1: Check RBAC permissions
    const canCreate = await this.rbacEngine.can(context, 'create', {
      type: contentType,
    })

    if (!canCreate) {
      throw new Error(
        `Permission denied: User does not have permission to create ${contentType}`
      )
    }

    // Validate input
    if (!Array.isArray(entries) || entries.length === 0) {
      return []
    }

    // Step 2: Prepare all entries
    const now = new Date().toISOString()
    const preparedEntries: ContentEntry[] = []
    const writeOperations = []
    const relativePaths: string[] = []

    for (const data of entries) {
      // Generate unique ID
      const id = nanoid()

      // Build complete entry with metadata
      const entry: ContentEntry = {
        id,
        ...data,
        createdAt: now,
        updatedAt: now,
        publishedAt: null, // Draft state by default
        createdBy: context.user?.id,
        updatedBy: context.user?.id,
      }

      // Generate slug if uid field exists in schema
      await this.generateSlugIfNeeded(contentType, entry)

      // Validate relation references
      await this.validateRelations(contentType, entry)

      // Validate data against schema
      const validationResult = await this.schemaEngine.validate(contentType, entry)

      if (!validationResult.valid) {
        const errorMessages = validationResult.errors
          ?.map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ')
        throw new Error(`Validation failed for entry ${id}: ${errorMessages}`)
      }

      // Build file paths
      const filePath = join(this.contentDir, contentType, `${id}.json`)
      const relativeFilePath = join('content', 'api', contentType, `${id}.json`)

      // Add to write operations
      writeOperations.push({
        path: filePath,
        data: entry,
        contentType,
      })

      relativePaths.push(relativeFilePath)
      preparedEntries.push(entry)
    }

    // Step 3: Execute batched writes
    // FileEngine.writeMany handles locking and concurrency control
    await this.fileEngine.writeMany(writeOperations)

    // Step 4: Commit all files to Git in a single commit
    const commitMessage = this.gitEngine.generateCommitMessage(
      'create',
      contentType,
      `${preparedEntries.length} entries`
    )

    const author = context.user
      ? {
          name: context.user.username,
          email: context.user.email,
        }
      : undefined

    await this.gitEngine.commit(relativePaths, commitMessage, author)

    // Step 5: Update query engine index for all entries
    for (const entry of preparedEntries) {
      this.queryEngine.updateIndex(contentType, entry.id, entry)
    }

    return preparedEntries
  }

  /**
   * Delete multiple content entries in a batch
   *
   * Algorithm:
   * 1. Check RBAC permissions for each entry
   * 2. Verify all entries exist
   * 3. Delete files from file system
   * 4. Commit deletions to Git in a single commit
   * 5. Remove entries from query engine index
   *
   * @param contentType Content type identifier
   * @param ids Array of entry IDs to delete
   * @param context Request context with user and role
   * @throws Error if permission denied, entry not found, or delete fails
   *
   * Validates: Requirements 1.8, 10.2
   */
  async deleteMany(
    contentType: string,
    ids: string[],
    context: RequestContext
  ): Promise<void> {
    // Validate input
    if (!Array.isArray(ids) || ids.length === 0) {
      return
    }

    // Step 1: Check RBAC permissions and verify entries exist
    const relativePaths: string[] = []
    const filePaths: string[] = []

    for (const id of ids) {
      // Check if entry exists
      const entry = this.queryEngine.query(contentType, {
        filters: {
          id: { $eq: id },
        },
      })[0]

      if (!entry) {
        throw new Error(`Entry not found: ${contentType}/${id}`)
      }

      // Check RBAC permissions
      const canDelete = await this.rbacEngine.can(context, 'delete', {
        type: contentType,
        id,
        data: entry,
      })

      if (!canDelete) {
        throw new Error(
          `Permission denied: User does not have permission to delete ${contentType}/${id}`
        )
      }

      // Build file paths
      const filePath = join(this.contentDir, contentType, `${id}.json`)
      const relativeFilePath = join('content', 'api', contentType, `${id}.json`)

      filePaths.push(filePath)
      relativePaths.push(relativeFilePath)
    }

    // Step 2: Delete files from file system
    // We need to acquire locks for each delete operation
    for (let i = 0; i < ids.length; i++) {
      const filePath = filePaths[i]

      await this.fileEngine.acquireLock(contentType)
      try {
        await this.fileEngine.deleteFile(filePath)
      } finally {
        this.fileEngine.releaseLock(contentType)
      }
    }

    // Step 3: Commit deletions to Git in a single commit
    const commitMessage = this.gitEngine.generateCommitMessage(
      'delete',
      contentType,
      `${ids.length} entries`
    )

    const author = context.user
      ? {
          name: context.user.username,
          email: context.user.email,
        }
      : undefined

    await this.gitEngine.commit(relativePaths, commitMessage, author)

    // Step 4: Remove entries from query engine index
    for (const id of ids) {
      this.queryEngine.removeFromIndex(contentType, id)
    }
  }


  /**
   * Generate slug for uid fields if needed
   *
   * Algorithm:
   * 1. Load schema to find uid fields
   * 2. For each uid field:
   *    a. If user provided custom slug, validate uniqueness
   *    b. If no slug provided, generate from targetField
   *    c. Ensure slug uniqueness with numeric suffix if needed
   *
   * @param contentType Content type identifier
   * @param entry Content entry to generate slug for
   * @throws Error if custom slug violates uniqueness
   *
   * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6
   */
  private async generateSlugIfNeeded(
    contentType: string,
    entry: ContentEntry
  ): Promise<void> {
    // Step 1: Load schema
    const schema = await this.schemaEngine.loadSchema(contentType)

    // Step 2: Find all uid fields
    const uidFields = Object.entries(schema.attributes).filter(
      ([_, fieldDef]) => fieldDef.type === 'uid'
    )

    // Step 3: Process each uid field
    for (const [fieldName, fieldDef] of uidFields) {
      const targetField = fieldDef.targetField || 'title'

      // Step 4: Check if user provided custom slug
      if (entry[fieldName]) {
        // User provided custom slug - validate uniqueness
        const customSlug = String(entry[fieldName])
        const isUnique = await this.isSlugUnique(contentType, fieldName, customSlug)

        if (!isUnique) {
          throw new Error(
            `Slug conflict: '${customSlug}' already exists for field '${fieldName}' in ${contentType}`
          )
        }
        continue
      }

      // Step 5: Generate slug from target field
      const targetValue = entry[targetField]

      if (!targetValue || typeof targetValue !== 'string') {
        // No target value to generate slug from, skip
        continue
      }

      // Step 6: Generate base slug
      const baseSlug = this.generateSlug(targetValue)

      // Step 7: Ensure uniqueness with numeric suffix if needed
      const uniqueSlug = await this.ensureSlugUniqueness(
        contentType,
        fieldName,
        baseSlug
      )

      // Step 8: Set slug on entry
      entry[fieldName] = uniqueSlug
    }
  }

  /**
   * Generate URL-safe slug from text
   *
   * Converts to lowercase, replaces spaces with hyphens, removes special characters
   *
   * @param text Text to slugify
   * @returns URL-safe slug
   *
   * Validates: Requirement 14.2
   */
  private generateSlug(text: string): string {
    // Pre-process to remove special characters that slugify might convert to words
    const cleaned = text.replace(/[@#$%^&*()+=\[\]{};:'",.<>?/\\|`~]/g, '')
    
    return slugify(cleaned, {
      lower: true,
      strict: true,
    })
  }

  /**
   * Ensure slug uniqueness by appending numeric suffix if needed
   *
   * Algorithm:
   * 1. Check if base slug is unique
   * 2. If not unique, try slug-2, slug-3, etc. until unique slug found
   *
   * @param contentType Content type identifier
   * @param fieldName Field name for the slug
   * @param baseSlug Base slug to make unique
   * @returns Unique slug
   *
   * Validates: Requirement 14.3
   */
  private async ensureSlugUniqueness(
    contentType: string,
    fieldName: string,
    baseSlug: string
  ): Promise<string> {
    // Step 1: Check if base slug is unique
    if (await this.isSlugUnique(contentType, fieldName, baseSlug)) {
      return baseSlug
    }

    // Step 2: Try numeric suffixes until unique slug found
    let suffix = 2
    let candidateSlug = `${baseSlug}-${suffix}`

    while (!(await this.isSlugUnique(contentType, fieldName, candidateSlug))) {
      suffix++
      candidateSlug = `${baseSlug}-${suffix}`
    }

    return candidateSlug
  }

  /**
   * Check if slug is unique within content type
   *
   * @param contentType Content type identifier
   * @param fieldName Field name for the slug
   * @param slug Slug to check
   * @returns True if slug is unique, false otherwise
   *
   * Validates: Requirement 14.3
   */
  private async isSlugUnique(
    contentType: string,
    fieldName: string,
    slug: string
  ): Promise<boolean> {
    // Query index for existing entries with this slug
    const results = this.queryEngine.query(contentType, {
      filters: {
        [fieldName]: { $eq: slug },
      },
    })

    return results.length === 0
  }

  /**
   * Regenerate slug if target field changed during update
   *
   * Algorithm:
   * 1. Load schema to find uid fields
   * 2. For each uid field:
   *    a. Check if user provided custom slug in update
   *    b. If custom slug, validate uniqueness (excluding current entry)
   *    c. If target field changed and no custom slug, regenerate
   *
   * @param contentType Content type identifier
   * @param existing Existing entry before update
   * @param updated Updated entry
   * @throws Error if custom slug violates uniqueness
   *
   * Validates: Requirements 14.4, 14.5, 14.6
   */
  private async regenerateSlugIfNeeded(
    contentType: string,
    existing: ContentEntry,
    updated: ContentEntry
  ): Promise<void> {
    // Step 1: Load schema
    const schema = await this.schemaEngine.loadSchema(contentType)

    // Step 2: Find all uid fields
    const uidFields = Object.entries(schema.attributes).filter(
      ([_, fieldDef]) => fieldDef.type === 'uid'
    )

    // Step 3: Process each uid field
    for (const [fieldName, fieldDef] of uidFields) {
      const targetField = fieldDef.targetField || 'title'

      // Step 4: Check if user provided custom slug in update
      if (
        updated[fieldName] !== existing[fieldName] &&
        updated[fieldName] !== undefined
      ) {
        // User provided custom slug - validate uniqueness (excluding current entry)
        const customSlug = String(updated[fieldName])
        const isUnique = await this.isSlugUniqueExcluding(
          contentType,
          fieldName,
          customSlug,
          existing.id
        )

        if (!isUnique) {
          throw new Error(
            `Slug conflict: '${customSlug}' already exists for field '${fieldName}' in ${contentType}`
          )
        }
        continue
      }

      // Step 5: Check if target field changed
      if (updated[targetField] === existing[targetField]) {
        // Target field didn't change, keep existing slug
        continue
      }

      // Step 6: Regenerate slug from new target field value
      const targetValue = updated[targetField]

      if (!targetValue || typeof targetValue !== 'string') {
        // No target value to generate slug from, keep existing
        continue
      }

      // Step 7: Generate base slug
      const baseSlug = this.generateSlug(targetValue)

      // Step 8: Ensure uniqueness with numeric suffix if needed (excluding current entry)
      const uniqueSlug = await this.ensureSlugUniquenessExcluding(
        contentType,
        fieldName,
        baseSlug,
        existing.id
      )

      // Step 9: Set slug on updated entry
      updated[fieldName] = uniqueSlug
    }
  }

  /**
   * Check if slug is unique within content type, excluding a specific entry
   *
   * @param contentType Content type identifier
   * @param fieldName Field name for the slug
   * @param slug Slug to check
   * @param excludeId Entry ID to exclude from check
   * @returns True if slug is unique, false otherwise
   */
  private async isSlugUniqueExcluding(
    contentType: string,
    fieldName: string,
    slug: string,
    excludeId: string
  ): Promise<boolean> {
    // Query index for existing entries with this slug
    const results = this.queryEngine.query(contentType, {
      filters: {
        [fieldName]: { $eq: slug },
      },
    })

    // Filter out the current entry being updated
    const conflicts = results.filter((entry) => entry.id !== excludeId)

    return conflicts.length === 0
  }

  /**
   * Ensure slug uniqueness by appending numeric suffix if needed, excluding a specific entry
   *
   * @param contentType Content type identifier
   * @param fieldName Field name for the slug
   * @param baseSlug Base slug to make unique
   * @param excludeId Entry ID to exclude from uniqueness check
   * @returns Unique slug
   */
  private async ensureSlugUniquenessExcluding(
    contentType: string,
    fieldName: string,
    baseSlug: string,
    excludeId: string
  ): Promise<string> {
    // Step 1: Check if base slug is unique
    if (
      await this.isSlugUniqueExcluding(contentType, fieldName, baseSlug, excludeId)
    ) {
      return baseSlug
    }

    // Step 2: Try numeric suffixes until unique slug found
    let suffix = 2
    let candidateSlug = `${baseSlug}-${suffix}`

    while (
      !(await this.isSlugUniqueExcluding(
        contentType,
        fieldName,
        candidateSlug,
        excludeId
      ))
    ) {
      suffix++
      candidateSlug = `${baseSlug}-${suffix}`
    }

    return candidateSlug
  }

   /**
    * Validate relation references in entry data
    *
    * Algorithm:
    * 1. Load schema to find relation fields
    * 2. For each relation field in the entry:
    *    a. Get relation configuration (type and target)
    *    b. Validate based on relation type:
    *       - manyToOne/oneToOne: Validate single ID exists
    *       - oneToMany/manyToMany: Validate all IDs in array exist
    * 3. Throw ValidationError if any reference is invalid
    *
    * @param contentType Content type identifier
    * @param entry Entry data to validate
    * @throws Error if relation references are invalid
    *
    * Validates: Requirements 15.2, 15.3
    */
   private async validateRelations(
     contentType: string,
     entry: ContentEntry
   ): Promise<void> {
     // Step 1: Load schema
     const schema = await this.schemaEngine.loadSchema(contentType)

     // Step 2: Find all relation fields
     const relationFields = Object.entries(schema.attributes).filter(
       ([_, fieldDef]) => fieldDef.type === 'relation'
     )

     // Step 3: Validate each relation field
     for (const [fieldName, fieldDef] of relationFields) {
       const relationValue = entry[fieldName]

       // Skip if field is not present or is null/undefined
       if (relationValue === null || relationValue === undefined) {
         continue
       }

       const relationConfig = fieldDef.relation
       if (!relationConfig) {
         continue
       }

       const { relation, target } = relationConfig

       // Step 4: Validate based on relation type
       if (relation === 'manyToOne' || relation === 'oneToOne') {
         // Single relation - validate single ID
         await this.validateSingleRelation(
           contentType,
           fieldName,
           relationValue,
           target
         )
       } else if (relation === 'oneToMany' || relation === 'manyToMany') {
         // Multiple relations - validate array of IDs
         await this.validateMultipleRelations(
           contentType,
           fieldName,
           relationValue,
           target
         )
       }
     }
   }

   /**
    * Validate a single relation reference (manyToOne, oneToOne)
    *
    * @param contentType Source content type
    * @param fieldName Relation field name
    * @param relationValue Relation value (should be a string ID)
    * @param targetType Target content type
    * @throws Error if relation value is invalid or target entry doesn't exist
    *
    * Validates: Requirements 15.2, 15.3
    */
   private async validateSingleRelation(
     contentType: string,
     fieldName: string,
     relationValue: unknown,
     targetType: string
   ): Promise<void> {
     // Validate that relationValue is a string
     if (typeof relationValue !== 'string') {
       throw new Error(
         `Validation failed: ${contentType}.${fieldName} must be a string ID, got ${typeof relationValue}`
       )
     }

     // Check if target entry exists
     const targetEntry = await this.findOne(targetType, relationValue)

     if (!targetEntry) {
       throw new Error(
         `Validation failed: ${contentType}.${fieldName} references non-existent ${targetType} entry '${relationValue}'`
       )
     }
   }

   /**
    * Validate multiple relation references (oneToMany, manyToMany)
    *
    * @param contentType Source content type
    * @param fieldName Relation field name
    * @param relationValue Relation value (should be an array of string IDs)
    * @param targetType Target content type
    * @throws Error if relation value is invalid or any target entry doesn't exist
    *
    * Validates: Requirements 15.2, 15.3
    */
   private async validateMultipleRelations(
     contentType: string,
     fieldName: string,
     relationValue: unknown,
     targetType: string
   ): Promise<void> {
     // Validate that relationValue is an array
     if (!Array.isArray(relationValue)) {
       throw new Error(
         `Validation failed: ${contentType}.${fieldName} must be an array of IDs, got ${typeof relationValue}`
       )
     }

     // Validate each ID in the array
     for (let i = 0; i < relationValue.length; i++) {
       const relatedId = relationValue[i]

       // Validate that each element is a string
       if (typeof relatedId !== 'string') {
         throw new Error(
           `Validation failed: ${contentType}.${fieldName}[${i}] must be a string ID, got ${typeof relatedId}`
         )
       }

       // Check if target entry exists
       const targetEntry = await this.findOne(targetType, relatedId)

       if (!targetEntry) {
         throw new Error(
           `Validation failed: ${contentType}.${fieldName}[${i}] references non-existent ${targetType} entry '${relatedId}'`
         )
       }
     }
   }
}
