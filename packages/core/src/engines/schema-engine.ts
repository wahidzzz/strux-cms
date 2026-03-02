import { promises as fs } from 'fs'
import { join } from 'path'
import Ajv, { type ValidateFunction } from 'ajv'
import addFormats from 'ajv-formats'
import type { ContentTypeSchema, ValidationResult, FieldDefinition, FieldType, RelationField } from '../types/index.js'

/**
 * SchemaEngine manages content type schemas with loading, caching, and CRUD operations.
 *
 * Key features:
 * - Load schemas from /schema/{type}.schema.json
 * - In-memory schema cache for fast access
 * - Parallel schema loading for performance
 * - Schema validation before save
 * - AJV-based validation with compiled validators
 * - Cleanup on delete
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 9.2, 11.1, 11.2
 */
export class SchemaEngine {
  private schemaCache: Map<string, ContentTypeSchema> = new Map()
  private validatorCache: Map<string, ValidateFunction> = new Map()
  private readonly schemaDir: string
  private readonly ajv: Ajv

  /**
   * Create a new SchemaEngine instance.
   *
   * @param schemaDir - Base directory for schema files (default: 'schema')
   */
  constructor(schemaDir = 'schema') {
    this.schemaDir = schemaDir
    
    // Initialize AJV with strict mode and all errors
    this.ajv = new Ajv({
      strict: true,
      allErrors: true,
      coerceTypes: false,
      useDefaults: false,
      removeAdditional: false,
      validateFormats: true,
      allowUnionTypes: true, // Allow union types for json, media, relation fields
    })
    
    // Add format validation support (email, date, date-time, etc.)
    addFormats(this.ajv)
  }

  /**
   * Load a single schema from disk and cache it.
   *
   * Algorithm:
   * 1. Check if schema is already in cache
   * 2. If cached, return from cache
   * 3. If not cached, read from /schema/{contentType}.schema.json
   * 4. Parse and validate schema structure
   * 5. Store in cache
   * 6. Return schema
   *
   * @param contentType - The content type identifier (e.g., "article", "user")
   * @returns Promise resolving to the content type schema
   * @throws Error if schema file doesn't exist or is invalid
   */
  async loadSchema(contentType: string): Promise<ContentTypeSchema> {
    // Validate input
    if (!contentType || typeof contentType !== 'string') {
      throw new Error('Invalid contentType: must be a non-empty string')
    }

    // Check cache first
    if (this.schemaCache.has(contentType)) {
      return this.schemaCache.get(contentType)!
    }

    // Build file path
    const schemaPath = join(this.schemaDir, `${contentType}.schema.json`)

    try {
      // Read schema file
      const content = await fs.readFile(schemaPath, 'utf8')

      // Parse JSON
      let schema: unknown
      try {
        schema = JSON.parse(content)
      } catch (error) {
        throw new Error(
          `Failed to parse schema JSON: ${error instanceof Error ? error.message : String(error)}`
        )
      }

      // Validate schema structure
      const validationResult = this.validateSchemaStructure(schema)
      if (!validationResult.valid) {
        const errors = validationResult.errors?.map((e) => e.message).join(', ')
        throw new Error(`Invalid schema structure: ${errors}`)
      }

      const typedSchema = schema as ContentTypeSchema

      // Store in cache
      this.schemaCache.set(contentType, typedSchema)

      return typedSchema
    } catch (error) {
      // Check if file doesn't exist
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Schema not found for content type: ${contentType}`)
      }
      throw error
    }
  }

  /**
   * Load all schemas from the schema directory in parallel.
   *
   * Algorithm:
   * 1. Read all files in schema directory
   * 2. Filter for .schema.json files
   * 3. Extract content type names from filenames
   * 4. Load all schemas in parallel using Promise.all
   * 5. Return Map of contentType -> schema
   *
   * @returns Promise resolving to Map of content type to schema
   * @throws Error if schema directory doesn't exist or schemas are invalid
   */
  async loadAllSchemas(): Promise<Map<string, ContentTypeSchema>> {
    try {
      // Ensure schema directory exists
      await fs.mkdir(this.schemaDir, { recursive: true })

      // Read all files in schema directory
      const files = await fs.readdir(this.schemaDir)

      // Filter for .schema.json files
      const schemaFiles = files.filter((file) => file.endsWith('.schema.json'))

      // Extract content type names (remove .schema.json suffix)
      const contentTypes = schemaFiles.map((file) =>
        file.replace('.schema.json', '')
      )

      // Load all schemas in parallel
      const loadPromises = contentTypes.map((contentType) =>
        this.loadSchema(contentType)
      )

      const schemas = await Promise.all(loadPromises)

      // Build result map
      const schemaMap = new Map<string, ContentTypeSchema>()
      for (let i = 0; i < contentTypes.length; i++) {
        schemaMap.set(contentTypes[i], schemas[i])
      }

      return schemaMap
    } catch (error) {
      throw new Error(
        `Failed to load all schemas: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Save a schema to disk and update cache.
   *
   * Algorithm:
   * 1. Validate schema structure
   * 2. Ensure schema directory exists
   * 3. Write schema to /schema/{contentType}.schema.json
   * 4. Update cache
   *
   * @param contentType - The content type identifier
   * @param schema - The schema to save
   * @throws Error if schema is invalid or write fails
   */
  async saveSchema(
    contentType: string,
    schema: ContentTypeSchema
  ): Promise<void> {
    // Validate inputs
    if (!contentType || typeof contentType !== 'string') {
      throw new Error('Invalid contentType: must be a non-empty string')
    }

    // Validate schema structure
    const validationResult = this.validateSchemaStructure(schema)
    if (!validationResult.valid) {
      const errors = validationResult.errors?.map((e) => e.message).join(', ')
      throw new Error(`Invalid schema structure: ${errors}`)
    }

    // Ensure apiId matches contentType
    if (schema.apiId !== contentType) {
      throw new Error(
        `Schema apiId (${schema.apiId}) must match contentType (${contentType})`
      )
    }

    try {
      // Ensure schema directory exists
      await fs.mkdir(this.schemaDir, { recursive: true })

      // Build file path
      const schemaPath = join(this.schemaDir, `${contentType}.schema.json`)

      // Serialize schema to JSON
      const json = JSON.stringify(schema, null, 2)

      // Write to file
      await fs.writeFile(schemaPath, json, 'utf8')

      // Update cache
      this.schemaCache.set(contentType, schema)
    } catch (error) {
      throw new Error(
        `Failed to save schema: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Delete a schema from disk and remove from cache.
   *
   * Algorithm:
   * 1. Remove schema file from /schema/{contentType}.schema.json
   * 2. Remove from cache
   * 3. Cleanup (ignore errors if file doesn't exist)
   *
   * @param contentType - The content type identifier
   * @throws Error if delete fails (except if file doesn't exist)
   */
  async deleteSchema(contentType: string): Promise<void> {
    // Validate input
    if (!contentType || typeof contentType !== 'string') {
      throw new Error('Invalid contentType: must be a non-empty string')
    }

    try {
      // Build file path
      const schemaPath = join(this.schemaDir, `${contentType}.schema.json`)

      // Delete file
      await fs.unlink(schemaPath)

      // Remove from cache
      this.schemaCache.delete(contentType)
      
      // Remove compiled validator from cache
      this.validatorCache.delete(contentType)
    } catch (error) {
      // Ignore if file doesn't exist
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Still remove from cache if it was there
        this.schemaCache.delete(contentType)
        this.validatorCache.delete(contentType)
        return
      }
      throw new Error(
        `Failed to delete schema: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Compile a validator for a content type schema.
   *
   * Algorithm:
   * 1. Convert ContentTypeSchema to JSON Schema format
   * 2. Compile validator with AJV
   * 3. Cache compiled validator
   * 4. Return validator function
   *
   * @param schema - The content type schema to compile
   * @returns Compiled validator function
   */
  compileValidator(schema: ContentTypeSchema): ValidateFunction {
    // Convert ContentTypeSchema to JSON Schema
    const jsonSchema = this.schemaToJsonSchema(schema)
    
    // Compile validator with AJV
    const validator = this.ajv.compile(jsonSchema)
    
    return validator
  }

  /**
   * Validate data against a content type schema.
   *
   * Algorithm:
   * 1. Load schema if not cached
   * 2. Get or compile validator
   * 3. Run validation
   * 4. Return ValidationResult with detailed errors
   *
   * @param contentType - The content type identifier
   * @param data - The data to validate
   * @returns ValidationResult with valid flag and errors
   */
  async validate(contentType: string, data: unknown): Promise<ValidationResult> {
    // Load schema (from cache or disk)
    const schema = await this.loadSchema(contentType)
    
    // Get or compile validator
    let validator = this.validatorCache.get(contentType)
    if (!validator) {
      validator = this.compileValidator(schema)
      this.validatorCache.set(contentType, validator)
    }
    
    // Run validation
    const valid = validator(data)
    
    if (valid) {
      return { valid: true }
    }
    
    // Convert AJV errors to ValidationError format
    const errors = (validator.errors || []).map((error) => ({
      path: error.instancePath
        .split('/')
        .filter((p) => p.length > 0),
      message: error.message || 'Validation failed',
      type: error.keyword,
    }))
    
    return {
      valid: false,
      errors,
    }
  }

  /**
   * Convert ContentTypeSchema to JSON Schema format.
   *
   * Supports all field types:
   * - string, text, richtext, email, password, uid
   * - number (with min/max)
   * - boolean
   * - date, datetime
   * - enumeration (with enum values)
   * - json
   * - media, relation (as string or array of strings)
   *
   * @param schema - The content type schema
   * @returns JSON Schema object
   */
  private schemaToJsonSchema(schema: ContentTypeSchema): object {
    const properties: Record<string, object> = {}
    const required: string[] = []
    
    // Process each attribute
    for (const [fieldName, fieldDef] of Object.entries(schema.attributes)) {
      properties[fieldName] = this.fieldToJsonSchema(fieldDef)
      
      if (fieldDef.required) {
        required.push(fieldName)
      }
    }
    
    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
      additionalProperties: true, // Allow additional properties like id, createdAt, etc.
    }
  }

  /**
   * Convert a field definition to JSON Schema format.
   *
   * @param fieldDef - The field definition
   * @returns JSON Schema for the field
   */
  private fieldToJsonSchema(fieldDef: FieldDefinition): object {
    const { type, min, max, minLength, maxLength, enum: enumValues } = fieldDef
    
    switch (type) {
      case 'string':
      case 'text':
      case 'richtext':
      case 'email':
      case 'password':
      case 'uid':
        return {
          type: 'string',
          minLength,
          maxLength,
          ...(type === 'email' && { format: 'email' }),
        }
      
      case 'number':
        return {
          type: 'number',
          minimum: min,
          maximum: max,
        }
      
      case 'boolean':
        return {
          type: 'boolean',
        }
      
      case 'date':
      case 'datetime':
        return {
          type: 'string',
          format: type === 'date' ? 'date' : 'date-time',
        }
      
      case 'enumeration':
        return {
          type: 'string',
          enum: enumValues || [],
        }
      
      case 'json':
        return {
          type: ['object', 'array', 'string', 'number', 'boolean', 'null'],
        }
      
      case 'media':
        // Media can be a single ID (string) or array of IDs
        return {
          oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
          ],
        }
      
      case 'relation':
        // Relations can be a single ID (string) or array of IDs
        return {
          oneOf: [
            { type: 'string' },
            { type: 'array', items: { type: 'string' } },
          ],
        }
      
      case 'component':
      case 'dynamiczone':
        // Components and dynamic zones are objects or arrays
        return {
          oneOf: [
            { type: 'object' },
            { type: 'array', items: { type: 'object' } },
          ],
        }
      
      default:
        // Default to any type
        return {
          type: ['string', 'number', 'boolean', 'object', 'array', 'null'],
        }
    }
  }

  /**
   * Validate the structure of a schema object.
   *
   * Checks:
   * - Required fields: apiId, displayName, singularName, pluralName, attributes
   * - apiId is kebab-case
   * - singularName and pluralName are different
   * - attributes is an object with at least one field
   * - No reserved field names (id, createdAt, updatedAt, publishedAt)
   *
   * @param schema - The schema object to validate
   * @returns ValidationResult with valid flag and errors
   */
  private validateSchemaStructure(schema: unknown): ValidationResult {
    const errors: Array<{ path: string[]; message: string; type: string }> = []

    // Check if schema is an object
    if (!schema || typeof schema !== 'object') {
      return {
        valid: false,
        errors: [
          {
            path: [],
            message: 'Schema must be an object',
            type: 'type',
          },
        ],
      }
    }

    const s = schema as Record<string, unknown>

    // Check required fields
    const requiredFields = [
      'apiId',
      'displayName',
      'singularName',
      'pluralName',
      'attributes',
    ]
    for (const field of requiredFields) {
      if (!(field in s) || !s[field]) {
        errors.push({
          path: [field],
          message: `Missing required field: ${field}`,
          type: 'required',
        })
      }
    }

    // If required fields are missing, return early
    if (errors.length > 0) {
      return { valid: false, errors }
    }

    // Validate apiId is kebab-case
    const apiId = s.apiId as string
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(apiId)) {
      errors.push({
        path: ['apiId'],
        message: 'apiId must be kebab-case (lowercase with hyphens)',
        type: 'format',
      })
    }

    // Validate singularName and pluralName are different
    if (s.singularName === s.pluralName) {
      errors.push({
        path: ['singularName', 'pluralName'],
        message: 'singularName and pluralName must be different',
        type: 'constraint',
      })
    }

    // Validate attributes is an object
    if (typeof s.attributes !== 'object' || s.attributes === null) {
      errors.push({
        path: ['attributes'],
        message: 'attributes must be an object',
        type: 'type',
      })
      return { valid: false, errors }
    }

    const attributes = s.attributes as Record<string, unknown>

    // Check attributes has at least one field
    if (Object.keys(attributes).length === 0) {
      errors.push({
        path: ['attributes'],
        message: 'attributes must contain at least one field',
        type: 'constraint',
      })
    }

    // Check for reserved field names
    const reservedFields = ['id', 'createdAt', 'updatedAt', 'publishedAt']
    for (const field of Object.keys(attributes)) {
      if (reservedFields.includes(field)) {
        errors.push({
          path: ['attributes', field],
          message: `Field name '${field}' is reserved and cannot be used`,
          type: 'constraint',
        })
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  /**
   * Get the field type for a given field path (supports dot notation for nested fields).
   *
   * Algorithm:
   * 1. Load schema if not cached
   * 2. Split field path by dots
   * 3. Navigate through nested fields
   * 4. Return the field type
   *
   * Examples:
   * - getFieldType('article', 'title') -> 'string'
   * - getFieldType('article', 'author.name') -> 'string' (nested field)
   *
   * @param contentType - The content type identifier
   * @param fieldPath - The field path (supports dot notation for nested fields)
   * @returns The field type
   * @throws Error if schema or field doesn't exist
   */
  async getFieldType(contentType: string, fieldPath: string): Promise<FieldType> {
    // Load schema (from cache or disk)
    const schema = await this.loadSchema(contentType)
    
    // Split field path by dots
    const pathParts = fieldPath.split('.')
    
    // Navigate through nested fields
    let currentAttributes = schema.attributes
    let currentContentType = contentType
    let fieldDef: FieldDefinition | undefined
    
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i]
      fieldDef = currentAttributes[part]
      
      if (!fieldDef) {
        throw new Error(
          `Field '${pathParts.slice(0, i + 1).join('.')}' not found in content type '${currentContentType}'`
        )
      }
      
      // If this is not the last part, we need to navigate deeper
      if (i < pathParts.length - 1) {
        // For nested fields, we would need to load the related schema
        // For now, we'll handle component and relation types
        if (fieldDef.type === 'relation' && fieldDef.relation) {
          // Load the related schema and continue navigation
          currentContentType = fieldDef.relation.target
          const relatedSchema = await this.loadSchema(currentContentType)
          currentAttributes = relatedSchema.attributes
        } else if (fieldDef.type === 'component') {
          // Components would need their own schema handling
          // For now, throw an error as this is not yet implemented
          throw new Error(
            `Nested field navigation for component type is not yet implemented`
          )
        } else {
          throw new Error(
            `Cannot navigate into field '${part}' of type '${fieldDef.type}'`
          )
        }
      }
    }
    
    if (!fieldDef) {
      throw new Error(`Field '${fieldPath}' not found in content type '${contentType}'`)
    }
    
    return fieldDef.type
  }

  /**
   * Get all relation fields from a content type schema.
   *
   * Algorithm:
   * 1. Load schema if not cached
   * 2. Iterate through all attributes
   * 3. Filter for fields with type 'relation'
   * 4. Return array of RelationField objects
   *
   * @param contentType - The content type identifier
   * @returns Array of relation fields with their configurations
   * @throws Error if schema doesn't exist
   */
  async getRelations(contentType: string): Promise<RelationField[]> {
    // Load schema (from cache or disk)
    const schema = await this.loadSchema(contentType)
    
    // Extract relation fields
    const relations: RelationField[] = []
    
    for (const [fieldName, fieldDef] of Object.entries(schema.attributes)) {
      if (fieldDef.type === 'relation' && fieldDef.relation) {
        relations.push({
          fieldName,
          config: fieldDef.relation,
        })
      }
    }
    
    return relations
  }
  /**
   * Get relation fields from a cached schema (synchronous).
   *
   * This method only works if the schema is already loaded in cache.
   * Use getRelations() for async loading if schema is not cached.
   *
   * @param contentType - The content type
   * @returns Array of relation fields, or empty array if schema not cached
   */
  getRelationsCached(contentType: string): RelationField[] {
    // Check cache
    const schema = this.schemaCache.get(contentType)
    if (!schema) {
      return []
    }

    // Extract relation fields
    const relations: RelationField[] = []

    for (const [fieldName, fieldDef] of Object.entries(schema.attributes)) {
      if (fieldDef.type === 'relation' && fieldDef.relation) {
        relations.push({
          fieldName,
          config: fieldDef.relation,
        })
      }
    }

    return relations
  }

  /**
   * Get relation fields from a content type schema.
   *
   * Loads the schema if not already cached.
   *
   * @param contentType - The content type
   * @returns Array of relation fields
   */

  /**
   * Clear the schema cache.
   * Useful for testing or when schemas need to be reloaded.
   */
  clearCache(): void {
    this.schemaCache.clear()
    this.validatorCache.clear()
  }

  /**
   * Get the number of schemas currently in cache.
   * Useful for monitoring and testing.
   *
   * @returns Number of cached schemas
   */
  getCacheSize(): number {
    return this.schemaCache.size
  }

  /**
   * Get the number of compiled validators currently in cache.
   * Useful for monitoring and testing.
   *
   * @returns Number of cached validators
   */
  getValidatorCacheSize(): number {
    return this.validatorCache.size
  }

  /**
   * Check if a schema is cached.
   *
   * @param contentType - The content type to check
   * @returns true if schema is in cache, false otherwise
   */
  isCached(contentType: string): boolean {
    return this.schemaCache.has(contentType)
  }
}
