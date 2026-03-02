/**
 * Git-Native JSON CMS - Core Package
 * 
 * Framework-agnostic core engines for content management with JSON file storage
 * and Git versioning.
 */

// Export all types
export * from './types/index.js'

// Engine exports will be added as they are implemented
export { FileEngine } from './engines/file-engine.js'
export { SchemaEngine } from './engines/schema-engine.js'
export { GitEngine } from './engines/git-engine.js'
// export { ContentEngine } from './engines/content-engine.js'
// export { QueryEngine } from './engines/query-engine.js'
// export { RBACEngine } from './engines/rbac-engine.js'
// export { MediaEngine } from './engines/media-engine.js'
