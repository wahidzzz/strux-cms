/**
 * Core type definitions for Git-Native JSON CMS
 */

// Content Entry Model
export interface ContentEntry {
  id: string
  [key: string]: unknown
  createdAt: string
  updatedAt: string
  publishedAt?: string | null
  createdBy?: string
  updatedBy?: string
}

// Schema Models
export interface ContentTypeSchema {
  apiId: string
  displayName: string
  singularName: string
  pluralName: string
  attributes: Record<string, FieldDefinition>
  options?: SchemaOptions
}

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
}

export type FieldType =
  | 'string'
  | 'text'
  | 'richtext'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'email'
  | 'password'
  | 'enumeration'
  | 'media'
  | 'relation'
  | 'component'
  | 'dynamiczone'
  | 'json'
  | 'uid'

export interface RelationConfig {
  relation: 'oneToOne' | 'oneToMany' | 'manyToOne' | 'manyToMany'
  target: string
}

export interface SchemaOptions {
  draftAndPublish?: boolean
  timestamps?: boolean
  populateCreatorFields?: boolean
}

// Validation Models
export interface ValidationResult {
  valid: boolean
  errors?: ValidationError[]
}

export interface ValidationError {
  path: string[]
  message: string
  type: string
}

export type ValidatorFunction = (data: unknown) => boolean

// Query Models
export interface QueryParams {
  filters?: FilterGroup
  sort?: SortParam[]
  pagination?: PaginationParam
  fields?: string[]
  populate?: PopulateParam
  publicationState?: 'live' | 'preview'
}

export interface FilterGroup {
  $and?: Filter[]
  $or?: Filter[]
  $not?: Filter
  [field: string]: FilterOperator | FilterGroup | unknown
}

export type Filter = FilterGroup

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

export interface SortParam {
  field: string
  order: 'asc' | 'desc'
}

export interface PaginationParam {
  page?: number
  pageSize?: number
  start?: number
  limit?: number
}

export interface PopulateParam {
  [relation: string]: boolean | PopulateConfig
}

export interface PopulateConfig {
  fields?: string[]
  populate?: PopulateParam
}

// Index Models
export interface ContentIndex {
  entries: Map<string, ContentEntry>
  fieldIndexes: Map<string, Map<unknown, Set<string>>>
  lastUpdated: number
}

// Request Context
export interface RequestContext {
  user?: User
  role: string
  branch?: string
}

export interface User {
  id: string
  username: string
  email: string
  role: string
}

// Paginated Result
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

// Git Models
export interface GitAuthor {
  name: string
  email: string
}

export interface GitCommit {
  hash: string
  author: GitAuthor
  date: Date
  message: string
  files: string[]
}

export interface MergeResult {
  success: boolean
  conflicts?: string[]
  hash?: string
}

export interface GitDiff {
  files: FileDiff[]
}

export interface FileDiff {
  path: string
  status: 'added' | 'modified' | 'deleted'
  additions: number
  deletions: number
}

export interface GitStatus {
  branch: string
  staged: string[]
  unstaged: string[]
  untracked: string[]
}

// RBAC Models
export interface Role {
  id: string
  name: string
  description: string
  type: 'admin' | 'editor' | 'authenticated' | 'public' | 'custom'
  permissions: Permission[]
}

export interface Permission {
  action: Action
  subject: string
  fields?: string[]
  conditions?: PermissionCondition
}

export type Action = 'create' | 'read' | 'update' | 'delete' | 'publish' | 'unpublish' | '*'

export interface Resource {
  type: string
  id?: string
  data?: unknown
}

export interface PermissionCondition {
  [field: string]: unknown
}

// Media Models
export interface UploadFile {
  name: string
  buffer: Buffer
  mimetype: string
  size: number
}

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

export interface MediaFormats {
  thumbnail?: MediaFormat
  small?: MediaFormat
  medium?: MediaFormat
  large?: MediaFormat
}

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

export interface MediaFolder {
  id: string
  name: string
  parent?: string
  createdAt: string
  updatedAt: string
}

// Write Operation
export interface WriteOperation {
  path: string
  data: unknown
  contentType: string
}

// Create/Update Data
export interface CreateData {
  [key: string]: unknown
}

export interface UpdateData {
  [key: string]: unknown
}
