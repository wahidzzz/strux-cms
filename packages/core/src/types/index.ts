/**
 * Core type definitions for Git-Native JSON CMS
 * 
 * This module provides all TypeScript interfaces and types for the CMS system,
 * including content entries, schemas, queries, RBAC, media, and Git operations.
 * 
 * @module types
 */

// ============================================================================
// Content Entry Models
// ============================================================================

/**
 * Represents a single content entry with metadata.
 *
 * Content entries are the core data model of the CMS. Each entry has a unique ID,
 * timestamps for creation and updates, optional publication state, and audit fields
 * for tracking who created and updated the entry.
 *
 * @example
 * ```typescript
 * const article: ContentEntry = {
 *   id: 1,
 *   documentId: "abc123",
 *   title: "My Article",
 *   content: "Article content...",
 *   createdAt: "2024-01-15T10:00:00.000Z",
 *   updatedAt: "2024-01-15T10:00:00.000Z",
 *   publishedAt: "2024-01-15T10:00:00.000Z",
 *   createdBy: "user-123",
 *   updatedBy: "user-123"
 * }
 * ```
 *
 * @property {number} id - Incremental identifier unique per collection
 * @property {string} documentId - Unique string identifier (nanoid)
 * @property {string} createdAt - ISO 8601 datetime string when entry was created
 * @property {string} updatedAt - ISO 8601 datetime string when entry was last updated
 * @property {string | null} [publishedAt] - ISO 8601 datetime string when entry was published, null if draft
 * @property {string} [createdBy] - User ID who created the entry
 * @property {string} [updatedBy] - User ID who last updated the entry
 */
export interface ContentEntry {
  id: number
  documentId: string
  [key: string]: unknown
  createdAt: string
  updatedAt: string
  publishedAt?: string | null
  createdBy?: string
  updatedBy?: string
}

// ============================================================================
// Schema Models
// ============================================================================

/**
 * Defines the structure and configuration of a content type.
 * 
 * Content type schemas define how content entries are structured, validated,
 * and managed. Each schema includes field definitions, validation rules, and
 * options for features like draft/publish workflow.
 * 
 * @example
 * ```typescript
 * const articleSchema: ContentTypeSchema = {
 *   apiId: "articles",
 *   displayName: "Article",
 *   singularName: "article",
 *   pluralName: "articles",
 *   attributes: {
 *     title: {
 *       type: "string",
 *       required: true,
 *       maxLength: 255
 *     },
 *     content: {
 *       type: "richtext",
 *       required: true
 *     }
 *   },
 *   options: {
 *     draftAndPublish: true,
 *     timestamps: true
 *   }
 * }
 * ```
 * 
 * @property {string} apiId - Unique identifier for the content type (kebab-case)
 * @property {string} displayName - Human-readable name for display in UI
 * @property {string} singularName - Singular form of the content type name
 * @property {string} pluralName - Plural form of the content type name
 * @property {Record<string, FieldDefinition>} attributes - Field definitions for the content type
 * @property {SchemaOptions} [options] - Optional configuration for the content type
 */
export interface ContentTypeSchema {
  apiId: string
  kind: 'collectionType' | 'singleType' | 'component'
  displayName: string
  singularName: string
  pluralName: string
  attributes: Record<string, FieldDefinition>
  options?: SchemaOptions
}

/**
 * Defines a single field in a content type schema.
 * 
 * Field definitions specify the type, validation rules, and constraints for
 * individual fields in a content entry.
 * 
 * @property {FieldType} type - The data type of the field
 * @property {boolean} [required] - Whether the field is required
 * @property {boolean} [unique] - Whether the field value must be unique across all entries
 * @property {unknown} [default] - Default value for the field
 * @property {RelationConfig} [relation] - Relation configuration (only for relation fields)
 * @property {string[]} [enum] - Allowed values for enumeration fields
 * @property {number} [min] - Minimum value for number fields
 * @property {number} [max] - Maximum value for number fields
 * @property {number} [maxLength] - Maximum length for string fields
 * @property {number} [minLength] - Minimum length for string fields
 * @property {string} [targetField] - Target field for uid generation (only for uid fields)
 */
export interface FieldDefinition {
  type: FieldType
  required?: boolean
  unique?: boolean
  default?: unknown
  relation?: RelationConfig
  enum?: string[]
  min?: number
  max?: number
  maxLength?: number
  minLength?: number
  targetField?: string
  component?: string
  repeatable?: boolean
}

/**
 * Supported field types in the CMS.
 * 
 * @typedef {string} FieldType
 */
export type FieldType =
  | 'string'      // Short text field
  | 'text'        // Long text field
  | 'richtext'    // Rich text with formatting
  | 'number'      // Numeric value
  | 'boolean'     // True/false value
  | 'date'        // Date without time
  | 'datetime'    // Date with time
  | 'email'       // Email address
  | 'password'    // Password (hashed)
  | 'enumeration' // One of predefined values
  | 'media'       // Media file reference
  | 'relation'    // Relation to another content type
  | 'component'   // Reusable component
  | 'dynamiczone' // Dynamic zone with multiple components
  | 'json'        // Raw JSON data
  | 'uid'         // Unique identifier (slug)

/**
 * Configuration for relation fields.
 * 
 * Defines how content types are related to each other (one-to-one, one-to-many, etc.).
 * 
 * @property {string} relation - Type of relation
 * @property {string} target - Target content type API ID
 */
export interface RelationConfig {
  relation: 'oneToOne' | 'oneToMany' | 'manyToOne' | 'manyToMany'
  target: string
}

/**
 * Represents a relation field with its configuration.
 * 
 * @property {string} fieldName - Name of the relation field
 * @property {RelationConfig} config - Relation configuration
 */
export interface RelationField {
  fieldName: string
  config: RelationConfig
}

/**
 * Optional configuration for content type schemas.
 * 
 * @property {boolean} [draftAndPublish] - Enable draft/publish workflow
 * @property {boolean} [timestamps] - Automatically manage createdAt/updatedAt
 * @property {boolean} [populateCreatorFields] - Automatically populate createdBy/updatedBy
 */
export interface SchemaOptions {
  draftAndPublish?: boolean
  timestamps?: boolean
  populateCreatorFields?: boolean
}

// ============================================================================
// Validation Models
// ============================================================================

/**
 * Result of a validation operation.
 * 
 * Contains the validation status and any errors that occurred during validation.
 * 
 * @property {boolean} valid - Whether the validation passed
 * @property {ValidationError[]} [errors] - Array of validation errors (if validation failed)
 */
export interface ValidationResult {
  valid: boolean
  errors?: ValidationError[]
}

/**
 * Represents a single validation error.
 * 
 * @property {string[]} path - Path to the field that failed validation
 * @property {string} message - Human-readable error message
 * @property {string} type - Type of validation error (e.g., 'required', 'type', 'min', 'max')
 */
export interface ValidationError {
  path: string[]
  message: string
  type: string
}

/**
 * Function type for compiled validators.
 * 
 * Validators are compiled from JSON Schema definitions using AJV and cached
 * for performance.
 * 
 * @param {unknown} data - Data to validate
 * @returns {boolean} True if validation passes, false otherwise
 */
export type ValidatorFunction = (data: unknown) => boolean

// ============================================================================
// Query Models
// ============================================================================

/**
 * Parameters for querying content entries.
 * 
 * Supports Strapi-compatible query syntax with filters, sorting, pagination,
 * field selection, and relation population.
 * 
 * @example
 * ```typescript
 * const params: QueryParams = {
 *   filters: {
 *     title: { $contains: "tutorial" },
 *     publishedAt: { $notNull: true }
 *   },
 *   sort: [{ field: "createdAt", order: "desc" }],
 *   pagination: { page: 1, pageSize: 25 },
 *   fields: ["id", "title", "publishedAt"],
 *   populate: { author: true },
 *   publicationState: "live"
 * }
 * ```
 * 
 * @property {FilterGroup} [filters] - Filter conditions
 * @property {SortParam[]} [sort] - Sort parameters
 * @property {PaginationParam} [pagination] - Pagination parameters
 * @property {string[]} [fields] - Fields to include in response
 * @property {PopulateParam} [populate] - Relations to populate
 * @property {'live' | 'preview'} [publicationState] - Filter by publication state
 */
export interface QueryParams {
  filters?: FilterGroup
  sort?: SortParam[]
  pagination?: PaginationParam
  fields?: string[]
  populate?: PopulateParam
  publicationState?: 'live' | 'preview'
}

/**
 * Group of filter conditions with logical operators.
 * 
 * Supports $and, $or, $not logical operators and field-level filter operators.
 * 
 * @property {Filter[]} [$and] - All conditions must match
 * @property {Filter[]} [$or] - At least one condition must match
 * @property {Filter} [$not] - Condition must not match
 * @property {FilterOperator | FilterGroup | unknown} [field] - Field-level filters
 */
export interface FilterGroup {
  $and?: Filter[]
  $or?: Filter[]
  $not?: Filter
  [field: string]: FilterOperator | FilterGroup | unknown
}

/**
 * Type alias for filter conditions.
 */
export type Filter = FilterGroup

/**
 * Filter operators for field-level filtering.
 * 
 * Supports comparison, containment, and null checking operators compatible
 * with Strapi's filter syntax.
 * 
 * @property {unknown} [$eq] - Equal to
 * @property {unknown} [$ne] - Not equal to
 * @property {number | string} [$gt] - Greater than
 * @property {number | string} [$gte] - Greater than or equal to
 * @property {number | string} [$lt] - Less than
 * @property {number | string} [$lte] - Less than or equal to
 * @property {unknown[]} [$in] - Value is in array
 * @property {unknown[]} [$notIn] - Value is not in array
 * @property {string} [$contains] - String contains (case-sensitive)
 * @property {string} [$notContains] - String does not contain (case-sensitive)
 * @property {string} [$containsi] - String contains (case-insensitive)
 * @property {string} [$notContainsi] - String does not contain (case-insensitive)
 * @property {string} [$startsWith] - String starts with
 * @property {string} [$endsWith] - String ends with
 * @property {boolean} [$null] - Value is null (true) or not null (false)
 * @property {boolean} [$notNull] - Value is not null (true) or is null (false)
 */
export interface FilterOperator {
  $eq?: unknown
  $ne?: unknown
  $gt?: number | string
  $gte?: number | string
  $lt?: number | string
  $lte?: number | string
  $in?: unknown[]
  $notIn?: unknown[]
  $contains?: string
  $notContains?: string
  $containsi?: string
  $notContainsi?: string
  $startsWith?: string
  $endsWith?: string
  $null?: boolean
  $notNull?: boolean
}

/**
 * Sort parameter for ordering query results.
 * 
 * @property {string} field - Field name to sort by
 * @property {'asc' | 'desc'} order - Sort order (ascending or descending)
 */
export interface SortParam {
  field: string
  order: 'asc' | 'desc'
}

/**
 * Pagination parameters for query results.
 * 
 * Supports both page-based and offset-based pagination.
 * 
 * @property {number} [page] - Page number (1-indexed, used with pageSize)
 * @property {number} [pageSize] - Number of items per page
 * @property {number} [start] - Offset to start from (0-indexed, used with limit)
 * @property {number} [limit] - Maximum number of items to return
 */
export interface PaginationParam {
  page?: number
  pageSize?: number
  start?: number
  limit?: number
}

/**
 * Parameters for populating relations in query results.
 * 
 * Can be a simple boolean to populate all fields, or a configuration object
 * to specify which fields to populate and nested population.
 * 
 * @example
 * ```typescript
 * // Simple population
 * const populate1: PopulateParam = { author: true }
 * 
 * // Selective field population
 * const populate2: PopulateParam = {
 *   author: {
 *     fields: ["id", "username"],
 *     populate: { avatar: true }
 *   }
 * }
 * ```
 */
export interface PopulateParam {
  [relation: string]: boolean | PopulateConfig
}

/**
 * Configuration for selective relation population.
 * 
 * @property {string[]} [fields] - Fields to include from the related entry
 * @property {PopulateParam} [populate] - Nested relations to populate
 */
export interface PopulateConfig {
  fields?: string[]
  populate?: PopulateParam
}

/**
 * In-memory index for fast content queries.
 * 
 * Maintains a map of all entries, field indexes for common query patterns,
 * and a timestamp of the last update.
 * 
 * @property {Map<string, ContentEntry>} entries - Map of entry ID to entry data
 * @property {Map<string, Map<unknown, Set<string>>>} fieldIndexes - Reverse indexes for common fields
 * @property {number} lastUpdated - Timestamp of last index update
 */
export interface ContentIndex {
  entries: Map<number | string, ContentEntry>
  fieldIndexes: Map<string, Map<unknown, Set<number | string>>>
  lastUpdated: number
}

// ============================================================================
// Request Context and User Models
// ============================================================================

/**
 * Context information for a request.
 * 
 * Contains user information, role, and optional branch for Git operations.
 * Used for RBAC permission checks and audit trail.
 * 
 * @property {User} [user] - Authenticated user (undefined for public requests)
 * @property {string} role - User role (admin, editor, authenticated, public)
 * @property {string} [branch] - Git branch for the operation
 */
export interface RequestContext {
  user?: User
  role: string
  branch?: string
}

/**
 * Represents a user in the system.
 * 
 * @property {string} id - Unique user identifier
 * @property {string} username - Username for login
 * @property {string} email - User email address
 * @property {string} role - User role ID
 */
export interface User {
  id: string
  username: string
  email: string
  role: string
}

/**
 * Paginated result wrapper for query responses.
 * 
 * Follows Strapi's response format with data and metadata.
 * 
 * @template T - Type of items in the result
 * @property {T[]} data - Array of result items
 * @property {object} meta - Metadata about the result
 * @property {object} meta.pagination - Pagination information
 */
export interface PaginatedResult<T> {
  data: T[]
  meta: {
    pagination: {
      page: number
      pageSize: number
      pageCount: number
      total: number
    }
  }
}

// ============================================================================
// Git Models
// ============================================================================

/**
 * Git author information.
 * 
 * @property {string} name - Author name
 * @property {string} email - Author email address
 */
export interface GitAuthor {
  name: string
  email: string
}

/**
 * Represents a Git commit.
 * 
 * @property {string} hash - Commit hash (SHA-1)
 * @property {GitAuthor} author - Commit author
 * @property {Date} date - Commit date
 * @property {string} message - Commit message
 * @property {string[]} files - Files affected by the commit
 */
export interface GitCommit {
  hash: string
  author: GitAuthor
  date: Date
  message: string
  files: string[]
}

/**
 * Result of a Git merge operation.
 * 
 * @property {boolean} success - Whether the merge succeeded
 * @property {string[]} [conflicts] - Files with merge conflicts (if merge failed)
 * @property {string} [hash] - Merge commit hash (if merge succeeded)
 */
export interface MergeResult {
  success: boolean
  conflicts?: string[]
  hash?: string
}

/**
 * Git diff information.
 * 
 * @property {FileDiff[]} files - Array of file diffs
 */
export interface GitDiff {
  files: FileDiff[]
}

/**
 * Diff information for a single file.
 * 
 * @property {string} path - File path
 * @property {'added' | 'modified' | 'deleted'} status - Change status
 * @property {number} additions - Number of lines added
 * @property {number} deletions - Number of lines deleted
 */
export interface FileDiff {
  path: string
  status: 'added' | 'modified' | 'deleted'
  additions: number
  deletions: number
}

/**
 * Git repository status.
 * 
 * @property {string} branch - Current branch name
 * @property {string[]} staged - Staged files
 * @property {string[]} unstaged - Unstaged modified files
 * @property {string[]} untracked - Untracked files
 * @property {string[]} ignored - Ignored files (but in working tree)
 */
export interface GitStatus {
  branch: string
  staged: string[]
  unstaged: string[]
  untracked: string[]
  ignored: string[]
}

// ============================================================================
// RBAC (Role-Based Access Control) Models
// ============================================================================

/**
 * Represents a role in the RBAC system.
 * 
 * Roles define sets of permissions that can be assigned to users. The system
 * provides four default roles (admin, editor, authenticated, public) and
 * supports custom roles.
 * 
 * @example
 * ```typescript
 * const editorRole: Role = {
 *   id: "editor",
 *   name: "Editor",
 *   description: "Can manage content",
 *   type: "editor",
 *   permissions: [
 *     { action: "create", subject: "all" },
 *     { action: "read", subject: "all" },
 *     { action: "update", subject: "all" },
 *     { action: "publish", subject: "all" }
 *   ]
 * }
 * ```
 * 
 * @property {string} id - Unique role identifier
 * @property {string} name - Human-readable role name
 * @property {string} description - Role description
 * @property {'admin' | 'editor' | 'authenticated' | 'public' | 'custom'} type - Role type
 * @property {Permission[]} permissions - Array of permissions granted to this role
 */
export interface Role {
  id: string
  name: string
  description: string
  type: 'admin' | 'editor' | 'authenticated' | 'public' | 'custom'
  permissions: Permission[]
}

/**
 * Represents a single permission.
 * 
 * Permissions define what actions a role can perform on which resources,
 * with optional field-level restrictions and conditional logic.
 * 
 * @property {Action} action - Action that can be performed
 * @property {string} subject - Resource type or 'all' for all resources
 * @property {string[]} [fields] - Specific fields that can be accessed (field-level permissions)
 * @property {PermissionCondition} [conditions] - Conditional logic for permission (e.g., ownership)
 */
export interface Permission {
  action: Action
  subject: string
  fields?: string[]
  conditions?: PermissionCondition
}

/**
 * Actions that can be performed on resources.
 * 
 * @typedef {string} Action
 */
export type Action = 'create' | 'read' | 'update' | 'delete' | 'publish' | 'unpublish' | '*'

/**
 * Represents a resource for permission checking.
 * 
 * @property {string} type - Resource type (content type API ID)
 * @property {string} [id] - Resource ID (for specific entry checks)
 * @property {unknown} [data] - Resource data (for condition evaluation)
 */
export interface Resource {
  type: string
  id?: number | string
  data?: unknown
}

/**
 * Conditional logic for permissions.
 * 
 * Conditions allow dynamic permission checks based on resource properties.
 * For example, allowing users to only edit their own content.
 * 
 * @example
 * ```typescript
 * const condition: PermissionCondition = {
 *   createdBy: "${user.id}" // User can only access entries they created
 * }
 * ```
 */
export interface PermissionCondition {
  [field: string]: unknown
}

// ============================================================================
// Media Library Models
// ============================================================================

/**
 * Represents a file being uploaded.
 * 
 * @property {string} name - Original filename
 * @property {Buffer} buffer - File content as buffer
 * @property {string} mimetype - MIME type of the file
 * @property {number} size - File size in bytes
 */
export interface UploadFile {
  name: string
  buffer: Buffer
  mimetype: string
  size: number
}

/**
 * Represents a media file in the media library.
 * 
 * Media files include images, videos, documents, and other assets uploaded
 * to the CMS. Images automatically generate responsive formats.
 * 
 * @example
 * ```typescript
 * const image: MediaFile = {
 *   id: "abc123",
 *   name: "hero-image.jpg",
 *   alternativeText: "Hero image for homepage",
 *   width: 1920,
 *   height: 1080,
 *   hash: "abc123def456",
 *   ext: ".jpg",
 *   mime: "image/jpeg",
 *   size: 245678,
 *   url: "/uploads/abc123def456.jpg",
 *   provider: "local",
 *   createdAt: "2024-01-15T10:00:00.000Z",
 *   updatedAt: "2024-01-15T10:00:00.000Z"
 * }
 * ```
 * 
 * @property {string} id - Unique media file identifier
 * @property {string} name - Original filename
 * @property {string} [alternativeText] - Alt text for accessibility
 * @property {string} [caption] - Caption for the media
 * @property {number} [width] - Image width in pixels (images only)
 * @property {number} [height] - Image height in pixels (images only)
 * @property {MediaFormats} [formats] - Generated image formats (images only)
 * @property {string} hash - Unique hash for the file
 * @property {string} ext - File extension (e.g., '.jpg')
 * @property {string} mime - MIME type
 * @property {number} size - File size in bytes
 * @property {string} url - URL to access the file
 * @property {string} [previewUrl] - URL for preview/thumbnail
 * @property {string} provider - Storage provider (e.g., 'local')
 * @property {string} [folder] - Folder ID containing this file
 * @property {string} createdAt - ISO 8601 datetime when file was uploaded
 * @property {string} updatedAt - ISO 8601 datetime when metadata was last updated
 */
export interface MediaFile {
  id: string
  name: string
  alternativeText?: string
  caption?: string
  width?: number
  height?: number
  formats?: MediaFormats
  hash: string
  ext: string
  mime: string
  size: number
  url: string
  previewUrl?: string
  provider: string
  folder?: string
  createdAt: string
  updatedAt: string
}

/**
 * Generated image formats for responsive images.
 * 
 * @property {MediaFormat} [thumbnail] - Thumbnail format (small preview)
 * @property {MediaFormat} [small] - Small format
 * @property {MediaFormat} [medium] - Medium format
 * @property {MediaFormat} [large] - Large format
 */
export interface MediaFormats {
  thumbnail?: MediaFormat
  small?: MediaFormat
  medium?: MediaFormat
  large?: MediaFormat
}

/**
 * Represents a single image format variant.
 * 
 * @property {string} name - Format name
 * @property {string} hash - Unique hash for this format
 * @property {string} ext - File extension
 * @property {string} mime - MIME type
 * @property {number} width - Image width in pixels
 * @property {number} height - Image height in pixels
 * @property {number} size - File size in bytes
 * @property {string} url - URL to access this format
 */
export interface MediaFormat {
  name: string
  hash: string
  ext: string
  mime: string
  width: number
  height: number
  size: number
  url: string
}

/**
 * Represents a folder in the media library.
 * 
 * @property {string} id - Unique folder identifier
 * @property {string} name - Folder name
 * @property {string} [parent] - Parent folder ID (for nested folders)
 * @property {string} createdAt - ISO 8601 datetime when folder was created
 * @property {string} updatedAt - ISO 8601 datetime when folder was last updated
 */
export interface MediaFolder {
  id: string
  name: string
  parent?: string
  createdAt: string
  updatedAt: string
}

/**
 * Data for updating media file metadata.
 * 
 * @property {string} [alternativeText] - Updated alt text
 * @property {string} [caption] - Updated caption
 * @property {string} [folder] - Updated folder ID
 * @property {string} [name] - Updated filename
 */
export interface UpdateMediaData {
  alternativeText?: string
  caption?: string
  folder?: string
  name?: string
}

// ============================================================================
// File Engine Models
// ============================================================================

/**
 * Represents a write operation for batch processing.
 * 
 * @property {string} path - File path to write to
 * @property {unknown} data - Data to write (will be JSON serialized)
 * @property {string} contentType - Content type for mutex management
 */
export interface WriteOperation {
  path: string
  data: unknown
  contentType: string
}

// ============================================================================
// Content Engine Models
// ============================================================================

/**
 * Data for creating a new content entry.
 * 
 * Contains the field values for the new entry. System fields (id, timestamps,
 * audit fields) are automatically generated.
 */
export interface CreateData {
  [key: string]: unknown
}

/**
 * Data for updating an existing content entry.
 * 
 * Contains the field values to update. Only specified fields are updated;
 * unspecified fields remain unchanged.
 */
export interface UpdateData {
  [key: string]: unknown
}

// ============================================================================
// Configuration Models
// ============================================================================

/**
 * Main CMS configuration.
 * 
 * @property {JWTConfig} jwt - JWT authentication configuration
 * @property {UploadConfig} upload - File upload configuration
 * @property {ServerConfig} [server] - Server configuration (optional)
 */
export interface CMSConfig {
  jwt: JWTConfig
  upload: UploadConfig
  server?: ServerConfig
}

/**
 * JWT authentication configuration.
 * 
 * @property {string} secret - Secret key for signing JWT tokens
 * @property {string} expiresIn - Token expiration time (e.g., '7d', '24h')
 */
export interface JWTConfig {
  secret: string
  expiresIn: string
}

/**
 * File upload configuration.
 * 
 * @property {number} maxFileSize - Maximum file size in bytes
 * @property {string[]} allowedMimeTypes - Allowed MIME types for uploads
 * @property {number} [maxFiles] - Maximum number of files per upload
 */
export interface UploadConfig {
  maxFileSize: number
  allowedMimeTypes: string[]
  maxFiles?: number
}

/**
 * Server configuration.
 * 
 * @property {number} [port] - Server port
 * @property {string} [host] - Server host
 * @property {CORSConfig} [cors] - CORS configuration
 */
export interface ServerConfig {
  port?: number
  host?: string
  cors?: CORSConfig
}

/**
 * CORS (Cross-Origin Resource Sharing) configuration.
 * 
 * @property {boolean} enabled - Whether CORS is enabled
 * @property {string | string[]} [origin] - Allowed origins
 * @property {boolean} [credentials] - Whether to allow credentials
 */
export interface CORSConfig {
  enabled: boolean
  origin?: string | string[]
  credentials?: boolean
}

// ============================================================================
// System Index Models
// ============================================================================

/**
 * System-wide index structure.
 * 
 * Persisted to .cms/index.json for fast boot times.
 * 
 * @property {string} version - Index format version
 * @property {string} lastUpdated - ISO 8601 datetime of last update
 * @property {Record<string, ContentTypeIndex>} contentTypes - Indexes by content type
 */
export interface SystemIndex {
  version: string
  lastUpdated: string
  contentTypes: Record<string, ContentTypeIndex>
}

/**
 * Index for a single content type.
 * 
 * @property {number} count - Number of entries
 * @property {string} lastModified - ISO 8601 datetime of last modification
 * @property {Record<string, IndexEntry>} entries - Entry metadata by ID
 */
export interface ContentTypeIndex {
  count: number
  lastModified: string
  entries: Record<string, IndexEntry>
}

/**
 * Metadata for a single entry in the index.
 * 
 * @property {string} id - Entry ID
 * @property {string} path - File path
 * @property {string} [slug] - Entry slug (if uid field exists)
 * @property {string | null} [publishedAt] - Publication timestamp
 * @property {string} createdAt - Creation timestamp
 * @property {string} updatedAt - Last update timestamp
 * @property {string} [searchableText] - Pre-computed searchable text for full-text search
 */
export interface IndexEntry {
  id: string
  path: string
  slug?: string
  publishedAt?: string | null
  createdAt: string
  updatedAt: string
  searchableText?: string
}

// ============================================================================
// RBAC Configuration Models
// ============================================================================

/**
 * RBAC system configuration.
 * 
 * Persisted to .cms/rbac.json.
 * 
 * @property {Record<string, Role>} roles - Roles by ID
 * @property {string} defaultRole - Default role for new users
 */
export interface RBACConfig {
  roles: Record<string, Role>
  defaultRole: string
}

// ============================================================================
// Custom Role Creation Models
// ============================================================================

/**
 * Data for creating a new custom role.
 * 
 * @property {string} name - Role name
 * @property {string} description - Role description
 * @property {Permission[]} permissions - Role permissions
 */
export interface CreateRole {
  name: string
  description: string
  permissions: Permission[]
}
