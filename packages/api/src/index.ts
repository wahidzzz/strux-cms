/**
 * Jayson CMS - API Package
 * 
 * REST API layer providing Strapi-compatible endpoints for content management.
 */

// Export content routes
export * from './routes/content.js'

// Export schema routes
export * from './routes/schema.js'

// Export settings routes
export * from './routes/settings.js'

// Export middleware
export * from './middleware/auth.js'
export * from './middleware/api-key.js'
export * from './middleware/security.js'

// Export auth routes
export * from './routes/auth.js'

// Export RBAC routes
export * from './routes/users.js'
export * from './routes/roles.js'

// Export API key routes
export * from './routes/api-keys.js'
