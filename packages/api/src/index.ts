/**
 * Git-Native JSON CMS - API Package
 * 
 * REST API layer providing Strapi-compatible endpoints for content management.
 */

// Export content routes
export * from './routes/content.js'

// Export schema routes
export * from './routes/schema.js'

// Export middleware
export * from './middleware/auth.js'

// API routes for other modules will be implemented in later tasks
// export * from './routes/media.js'
// export * from './routes/auth.js'

console.log('API package initialized')
