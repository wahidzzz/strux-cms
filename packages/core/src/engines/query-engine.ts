import { promises as fs } from 'fs'
import { join } from 'path'
import type {
  ContentEntry,
  ContentIndex,
  QueryParams,
  FilterGroup,
  FilterOperator,
  SortParam,
  PaginationParam,
  PopulateParam,
} from '../types/index.js'
import type { FileEngine } from './file-engine.js'
import type { SchemaEngine } from './schema-engine.js'

/**
 * QueryEngine executes queries with Strapi-compatible filter syntax.
 *
 * Key features:
 * - In-memory index for fast queries (no file I/O during queries)
 * - Field indexes for common query patterns (slug, publishedAt, createdAt)
 * - Searchable text for full-text search
 * - Support for all Strapi filter operators
 * - Parallel index building on boot
 * - Index consistency with file system
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 9.3, 10.7
 */
export class QueryEngine {
  private indexes: Map<string, ContentIndex> = new Map()
  private contentDir: string

  /**
   * Create a new QueryEngine instance.
   *
   * @param contentDir - Base directory for content files (e.g., "/path/to/content/api")
   * @param fileEngine - FileEngine instance for reading files
   * @param schemaEngine - SchemaEngine instance for relation resolution
   */
  constructor(
    contentDir: string,
    private fileEngine: FileEngine,
    private schemaEngine?: SchemaEngine
  ) {
    this.contentDir = contentDir
  }

  /**
   * Build index for a single content type.
   *
   * Algorithm:
   * 1. Check if content directory exists
   * 2. Read all JSON files in directory
   * 3. Read all files in parallel (non-blocking reads)
   * 4. Build main index (Map of id -> entry)
   * 5. Build field indexes for common query fields
   * 6. Build searchable text for full-text search
   *
   * @param contentType - The content type to index (e.g., "articles")
   * @throws Error if content type directory doesn't exist
   */
  async buildIndex(contentType: string): Promise<void> {
    const typeDir = join(this.contentDir, contentType)

    // Step 1: Initialize index structure
    const index: ContentIndex = {
      entries: new Map(),
      fieldIndexes: new Map(),
      lastUpdated: Date.now(),
    }

    this.indexes.set(contentType, index)

    // Step 2: Check if directory exists
    try {
      await fs.access(typeDir)
    } catch {
      // Directory doesn't exist yet, return empty index
      return
    }

    // Step 3: Read all JSON files in directory
    const files = await fs.readdir(typeDir)
    const jsonFiles = files.filter((f) => f.endsWith('.json'))

    if (jsonFiles.length === 0) {
      return
    }

    // Step 4: Read all files in parallel (non-blocking reads)
    const filePaths = jsonFiles.map((file) => join(typeDir, file))
    const entries = await Promise.all(
      filePaths.map(async (path) => {
        try {
          return await this.fileEngine.readFile(path)
        } catch (error) {
          console.warn(`Failed to read file ${path}:`, error)
          return null
        }
      })
    )

    // Step 5: Build index
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue

      const contentEntry = entry as ContentEntry

      // Add to main index
      index.entries.set(contentEntry.id, contentEntry)

      // Build field indexes for common query fields
      this.indexCommonFields(index, contentEntry)

      // Build searchable text
      this.buildSearchableText(index, contentEntry)
    }

    index.lastUpdated = Date.now()
  }

  /**
   * Rebuild all indexes from file system.
   *
   * This is called on system boot to load all content into memory.
   * Uses parallel loading for performance.
   *
   * Algorithm:
   * 1. Discover all content type directories
   * 2. Build indexes for all types in parallel
   * 3. Measure and log boot time
   *
   * Performance target: <3s for 10k entries
   */
  async rebuildAllIndexes(): Promise<void> {
    const startTime = Date.now()

    // Step 1: Discover all content type directories
    let contentTypes: string[] = []
    try {
      const entries = await fs.readdir(this.contentDir, { withFileTypes: true })
      contentTypes = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    } catch (error) {
      // Content directory doesn't exist yet
      console.warn('Content directory not found, starting with empty indexes')
      return
    }

    // Step 2: Build indexes for all types in parallel
    await Promise.all(contentTypes.map((type) => this.buildIndex(type)))

    // Step 3: Measure and log boot time
    const duration = Date.now() - startTime
    const totalEntries = this.getTotalEntryCount()
    console.log(
      `Index rebuild completed in ${duration}ms (${totalEntries} entries across ${contentTypes.length} content types)`
    )

    // Warn if boot time exceeds target for datasets <= 10k entries
    if (totalEntries <= 10000 && duration > 3000) {
      console.warn(`Boot time exceeded 3s target: ${duration}ms`)
    }
  }

  /**
   * Get the index for a specific content type.
   *
   * @param contentType - The content type
   * @returns The content index, or undefined if not found
   */
  getIndex(contentType: string): ContentIndex | undefined {
    return this.indexes.get(contentType)
  }

  /**
   * Update a single entry in the index.
   *
   * This is called after write operations to keep the index in sync.
   *
   * @param contentType - The content type
   * @param id - The entry ID
   * @param entry - The updated entry data
   */
  updateIndex(contentType: string, id: string, entry: ContentEntry): void {
    let index = this.indexes.get(contentType)

    // Create index if it doesn't exist
    if (!index) {
      index = {
        entries: new Map(),
        fieldIndexes: new Map(),
        lastUpdated: Date.now(),
      }
      this.indexes.set(contentType, index)
    }

    // Remove old field indexes if entry exists
    const oldEntry = index.entries.get(id)
    if (oldEntry) {
      this.removeFromFieldIndexes(index, oldEntry)
    }

    // Update main index
    index.entries.set(id, entry)

    // Rebuild field indexes for this entry
    this.indexCommonFields(index, entry)
    this.buildSearchableText(index, entry)

    index.lastUpdated = Date.now()
  }

  /**
   * Remove an entry from the index.
   *
   * This is called after delete operations.
   *
   * @param contentType - The content type
   * @param id - The entry ID to remove
   */
  removeFromIndex(contentType: string, id: string): void {
    const index = this.indexes.get(contentType)
    if (!index) return

    const entry = index.entries.get(id)
    if (!entry) return

    // Remove from field indexes
    this.removeFromFieldIndexes(index, entry)

    // Remove from main index
    index.entries.delete(id)

    index.lastUpdated = Date.now()
  }

  /**
   * Get total entry count across all content types.
   *
   * @returns Total number of entries
   */
  private getTotalEntryCount(): number {
    let total = 0
    for (const index of this.indexes.values()) {
      total += index.entries.size
    }
    return total
  }

  /**
   * Index common fields for fast queries.
   *
   * Creates reverse indexes: field value -> Set of entry IDs
   * This enables O(1) lookup for equality queries on indexed fields.
   *
   * Indexed fields:
   * - slug: For URL-based lookups
   * - publishedAt: For publication state filtering
   * - createdAt: For date-based queries
   * - status: For status filtering
   *
   * @param index - The content index
   * @param entry - The content entry to index
   */
  private indexCommonFields(index: ContentIndex, entry: ContentEntry): void {
    const fieldsToIndex = ['slug', 'publishedAt', 'createdAt', 'status']

    for (const field of fieldsToIndex) {
      if (!(field in entry)) continue

      const value = entry[field]

      // Get or create field index
      if (!index.fieldIndexes.has(field)) {
        index.fieldIndexes.set(field, new Map())
      }

      const fieldIndex = index.fieldIndexes.get(field)!

      // Get or create value set
      if (!fieldIndex.has(value)) {
        fieldIndex.set(value, new Set())
      }

      // Add entry ID to value set
      fieldIndex.get(value)!.add(entry.id)
    }
  }

  /**
   * Remove an entry from all field indexes.
   *
   * @param index - The content index
   * @param entry - The content entry to remove
   */
  private removeFromFieldIndexes(index: ContentIndex, entry: ContentEntry): void {
    const fieldsToIndex = ['slug', 'publishedAt', 'createdAt', 'status']

    for (const field of fieldsToIndex) {
      if (!(field in entry)) continue

      const value = entry[field]
      const fieldIndex = index.fieldIndexes.get(field)

      if (!fieldIndex) continue

      const valueSet = fieldIndex.get(value)
      if (valueSet) {
        valueSet.delete(entry.id)

        // Clean up empty sets
        if (valueSet.size === 0) {
          fieldIndex.delete(value)
        }
      }
    }
  }

  /**
   * Build searchable text for full-text search.
   *
   * Concatenates all string fields into a single searchable text field.
   * This enables fast full-text search without scanning all fields.
   *
   * @param index - The content index
   * @param entry - The content entry
   */
  private buildSearchableText(index: ContentIndex, entry: ContentEntry): void {
    const searchableFields: string[] = []

    for (const [key, value] of Object.entries(entry)) {
      // Skip internal fields and non-string values
      if (key.startsWith('_') || typeof value !== 'string') {
        continue
      }

      searchableFields.push(value)
    }

    // Store searchable text in the entry (as a non-enumerable property would be better,
    // but for simplicity we'll add it as a regular property with underscore prefix)
    const indexEntry = index.entries.get(entry.id)!
    ;(indexEntry as any)._searchableText = searchableFields.join(' ').toLowerCase()
  }

  /**
   * Execute a query with filters, sorting, pagination, and field selection.
   *
   * Algorithm:
   * 1. Get in-memory index for content type
   * 2. Start with all entries
   * 3. Apply publication state filter
   * 4. Apply filters
   * 5. Apply sorting
   * 6. Apply pagination
   * 7. Apply field selection
   * 8. Populate relations (if requested)
   *
   * @param contentType - The content type to query
   * @param params - Query parameters (filters, sort, pagination, fields, populate)
   * @returns Array of matching entries
   * @throws Error if content type index not found
   */
  query(contentType: string, params: QueryParams = {}): ContentEntry[] {
    // Step 1: Get in-memory index
    const index = this.indexes.get(contentType)
    if (!index) {
      throw new Error(`Index not found for content type: ${contentType}`)
    }

    // Step 2: Start with all entries
    let results = Array.from(index.entries.values())

    // Step 3: Apply publication state filter
    if (params.publicationState === 'live') {
      results = results.filter((entry) => entry.publishedAt !== null && entry.publishedAt !== undefined)
    }

    // Step 4: Apply filters
    if (params.filters) {
      results = results.filter((entry) => this.matchesFilter(entry, params.filters!))
    }

    // Step 5: Apply sorting
    if (params.sort && params.sort.length > 0) {
      results = this.applySorting(results, params.sort)
    }

    // Step 6: Apply pagination
    if (params.pagination) {
      const { start, limit } = this.normalizePagination(params.pagination)
      results = results.slice(start, start + limit)
    }

    // Step 7: Apply field selection
    if (params.fields && params.fields.length > 0) {
      results = results.map((entry) => this.selectFields(entry, params.fields!))
    }

    // Step 8: Populate relations
    if (params.populate && this.schemaEngine) {
      results = this.populateRelations(results, params.populate, contentType)
    }

    return results
  }

  /**
   * Count entries matching query filters.
   *
   * @param contentType - The content type to query
   * @param params - Query parameters (filters, publicationState)
   * @returns Count of matching entries
   */
  count(contentType: string, params: QueryParams = {}): number {
    const index = this.indexes.get(contentType)
    if (!index) {
      return 0
    }

    let results = Array.from(index.entries.values())

    // Apply publication state filter
    if (params.publicationState === 'live') {
      results = results.filter((entry) => entry.publishedAt !== null && entry.publishedAt !== undefined)
    }

    // Apply filters
    if (params.filters) {
      results = results.filter((entry) => this.matchesFilter(entry, params.filters!))
    }

    return results.length
  }

  /**
   * Check if an entry matches a filter group.
   *
   * Handles logical operators ($and, $or, $not) and field filters.
   * Recursively evaluates nested filter groups.
   *
   * @param entry - The content entry to test
   * @param filter - The filter group to match against
   * @returns True if entry matches filter, false otherwise
   */
  private matchesFilter(entry: ContentEntry, filter: FilterGroup): boolean {
    // Handle logical operators
    if (filter.$and) {
      return filter.$and.every((f) => this.matchesFilter(entry, f))
    }

    if (filter.$or) {
      return filter.$or.some((f) => this.matchesFilter(entry, f))
    }

    if (filter.$not) {
      return !this.matchesFilter(entry, filter.$not)
    }

    // Handle field filters
    for (const [field, condition] of Object.entries(filter)) {
      // Skip logical operators (already handled above)
      if (field.startsWith('$')) {
        continue
      }

      const value = this.getFieldValue(entry, field)

      if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
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
   * Check if a value matches a filter operator.
   *
   * Supports all Strapi filter operators:
   * - Equality: $eq, $ne
   * - Comparison: $gt, $gte, $lt, $lte
   * - Array membership: $in, $notIn
   * - String matching: $contains, $notContains, $containsi, $notContainsi
   * - String prefix/suffix: $startsWith, $endsWith
   * - Null checks: $null, $notNull
   *
   * @param value - The field value to test
   * @param operator - The filter operator to apply
   * @returns True if value matches operator, false otherwise
   */
  private matchesOperator(value: unknown, operator: FilterOperator): boolean {
    // Equality operators
    if (operator.$eq !== undefined) {
      return value === operator.$eq
    }

    if (operator.$ne !== undefined) {
      return value !== operator.$ne
    }

    // Comparison operators (for numbers and strings)
    if (operator.$gt !== undefined) {
      if (typeof value === 'number' || typeof value === 'string') {
        return value > operator.$gt
      }
      return false
    }

    if (operator.$gte !== undefined) {
      if (typeof value === 'number' || typeof value === 'string') {
        return value >= operator.$gte
      }
      return false
    }

    if (operator.$lt !== undefined) {
      if (typeof value === 'number' || typeof value === 'string') {
        return value < operator.$lt
      }
      return false
    }

    if (operator.$lte !== undefined) {
      if (typeof value === 'number' || typeof value === 'string') {
        return value <= operator.$lte
      }
      return false
    }

    // Array membership operators
    if (operator.$in !== undefined) {
      return operator.$in.includes(value)
    }

    if (operator.$notIn !== undefined) {
      return !operator.$notIn.includes(value)
    }

    // String matching operators
    if (operator.$contains !== undefined) {
      if (typeof value === 'string') {
        return value.includes(operator.$contains)
      }
      return false
    }

    if (operator.$notContains !== undefined) {
      if (typeof value === 'string') {
        return !value.includes(operator.$notContains)
      }
      return false
    }

    if (operator.$containsi !== undefined) {
      if (typeof value === 'string') {
        return value.toLowerCase().includes(operator.$containsi.toLowerCase())
      }
      return false
    }

    if (operator.$notContainsi !== undefined) {
      if (typeof value === 'string') {
        return !value.toLowerCase().includes(operator.$notContainsi.toLowerCase())
      }
      return false
    }

    if (operator.$startsWith !== undefined) {
      if (typeof value === 'string') {
        return value.startsWith(operator.$startsWith)
      }
      return false
    }

    if (operator.$endsWith !== undefined) {
      if (typeof value === 'string') {
        return value.endsWith(operator.$endsWith)
      }
      return false
    }

    // Null check operators
    if (operator.$null !== undefined) {
      return operator.$null ? value === null || value === undefined : value !== null && value !== undefined
    }

    if (operator.$notNull !== undefined) {
      return operator.$notNull ? value !== null && value !== undefined : value === null || value === undefined
    }

    return true
  }

  /**
   * Get field value from entry, supporting dot notation for nested fields.
   *
   * @param entry - The content entry
   * @param fieldPath - The field path (e.g., "title" or "author.name")
   * @returns The field value, or undefined if not found
   */
  private getFieldValue(entry: ContentEntry, fieldPath: string): unknown {
    const parts = fieldPath.split('.')
    let value: any = entry

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined
      }
      value = value[part]
    }

    return value
  }

  /**
   * Apply sorting to results.
   *
   * Supports multi-field sorting with ascending/descending order.
   *
   * @param entries - The entries to sort
   * @param sortParams - The sort parameters
   * @returns Sorted entries
   */
  private applySorting(entries: ContentEntry[], sortParams: SortParam[]): ContentEntry[] {
    return entries.slice().sort((a, b) => {
      for (const { field, order } of sortParams) {
        const aValue = this.getFieldValue(a, field)
        const bValue = this.getFieldValue(b, field)

        // Handle null/undefined values (sort them to the end)
        if (aValue === null || aValue === undefined) {
          return 1
        }
        if (bValue === null || bValue === undefined) {
          return -1
        }

        // Compare values
        let comparison = 0
        if (aValue < bValue) {
          comparison = -1
        } else if (aValue > bValue) {
          comparison = 1
        }

        // Apply order direction
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
   * @param pagination - The pagination parameters
   * @returns Normalized start and limit values
   */
  private normalizePagination(pagination: PaginationParam): { start: number; limit: number } {
    if (pagination.start !== undefined && pagination.limit !== undefined) {
      return {
        start: pagination.start,
        limit: pagination.limit,
      }
    }

    const page = pagination.page ?? 1
    const pageSize = pagination.pageSize ?? 25

    return {
      start: (page - 1) * pageSize,
      limit: pageSize,
    }
  }

  /**
   * Select specific fields from an entry.
   *
   * @param entry - The content entry
   * @param fields - The fields to select
   * @returns Entry with only selected fields
   */
  private selectFields(entry: ContentEntry, fields: string[]): ContentEntry {
    const result: ContentEntry = {
      id: entry.id,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }

    for (const field of fields) {
      const value = this.getFieldValue(entry, field)
      if (value !== undefined) {
        result[field] = value
      }
    }

    return result
  }

  /**
   * Populate relations in entries.
   *
   * Resolves relation fields by fetching related entries from their indexes.
   * Supports nested population and handles circular references.
   *
   * Algorithm:
   * 1. Get relation fields from schema (cached)
   * 2. For each entry, populate requested relations
   * 3. Handle different relation types (oneToOne, oneToMany, manyToOne, manyToMany)
   * 4. Support nested population recursively
   * 5. Track visited entries to prevent circular references
   *
   * @param entries - The entries to populate
   * @param populate - The populate configuration
   * @param contentType - The content type of the entries
   * @param visited - Set of visited entry IDs to prevent circular references
   * @returns Entries with populated relations
   */
  private populateRelations(
    entries: ContentEntry[],
    populate: PopulateParam,
    contentType: string,
    visited: Set<string> = new Set()
  ): ContentEntry[] {
    if (!this.schemaEngine) {
      return entries
    }

    // Clone entries to avoid mutating originals
    const results = entries.map((entry) => ({ ...entry }))

    // Get relation fields from cached schema (synchronous)
    const relations = this.schemaEngine.getRelationsCached(contentType)
    if (relations.length === 0) {
      return results
    }

    // Populate each entry
    for (const entry of results) {
      // Track this entry to prevent circular references
      const entryKey = `${contentType}:${entry.id}`
      if (visited.has(entryKey)) {
        continue
      }

      // Add to visited set for this branch
      const branchVisited = new Set(visited)
      branchVisited.add(entryKey)

      // Populate each requested relation
      for (const [relationName, populateConfig] of Object.entries(populate)) {
        const relationValue = entry[relationName]
        if (relationValue === null || relationValue === undefined) {
          continue
        }

        // Find relation configuration
        const relationField = relations.find((r) => r.fieldName === relationName)
        if (!relationField) {
          // Relation not found in schema, skip
          continue
        }

        const { relation, target } = relationField.config

        // Get target content type index
        const targetIndex = this.indexes.get(target)
        if (!targetIndex) {
          continue
        }

        // Populate based on relation type
        if (relation === 'manyToOne' || relation === 'oneToOne') {
          // Single relation - relationValue should be an ID
          if (typeof relationValue === 'string') {
            const relatedEntry = targetIndex.entries.get(relationValue)
            if (relatedEntry) {
              let populated = { ...relatedEntry }

              // Apply field selection if specified
              if (typeof populateConfig === 'object' && populateConfig.fields) {
                populated = this.selectFields(populated, populateConfig.fields)
              }

              // Handle nested population
              if (typeof populateConfig === 'object' && populateConfig.populate) {
                const nestedResults = this.populateRelations(
                  [populated],
                  populateConfig.populate,
                  target,
                  branchVisited
                )
                populated = nestedResults[0]
              }

              entry[relationName] = populated
            }
          }
        } else if (relation === 'oneToMany' || relation === 'manyToMany') {
          // Multiple relations - relationValue should be an array of IDs
          if (Array.isArray(relationValue)) {
            const relatedEntries: ContentEntry[] = []

            for (const relatedId of relationValue) {
              if (typeof relatedId === 'string') {
                const relatedEntry = targetIndex.entries.get(relatedId)
                if (relatedEntry) {
                  let populated = { ...relatedEntry }

                  // Apply field selection if specified
                  if (typeof populateConfig === 'object' && populateConfig.fields) {
                    populated = this.selectFields(populated, populateConfig.fields)
                  }

                  relatedEntries.push(populated)
                }
              }
            }

            // Handle nested population for all related entries
            if (typeof populateConfig === 'object' && populateConfig.populate && relatedEntries.length > 0) {
              const nestedResults = this.populateRelations(
                relatedEntries,
                populateConfig.populate,
                target,
                branchVisited
              )
              entry[relationName] = nestedResults
            } else {
              entry[relationName] = relatedEntries
            }
          }
        }
      }
    }

    return results
  }
}
