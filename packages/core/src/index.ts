/**
 * Git-Native JSON CMS - Core Package
 * 
 * Framework-agnostic core engines for content management with JSON file storage
 * and Git versioning.
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { FileEngine } from './engines/file-engine.js'
import { SchemaEngine } from './engines/schema-engine.js'
import { GitEngine } from './engines/git-engine.js'
import { QueryEngine } from './engines/query-engine.js'
import { ContentEngine } from './engines/content-engine.js'
import { RBACEngine } from './engines/rbac-engine.js'
import { MediaEngine } from './engines/media-engine.js'
import type { CMSConfig } from './types/index.js'

// Export all types
export * from './types/index.js'

// Engine exports
export { FileEngine } from './engines/file-engine.js'
export { SchemaEngine } from './engines/schema-engine.js'
export { GitEngine } from './engines/git-engine.js'
export { MediaEngine } from './engines/media-engine.js'
export { ContentEngine } from './engines/content-engine.js'
export { QueryEngine } from './engines/query-engine.js'
export { RBACEngine } from './engines/rbac-engine.js'

/**
 * CMS - Main class for Git-Native JSON CMS
 * 
 * Orchestrates all engines and provides system initialization.
 * 
 * Key features:
 * - Initialize Git repository if not exists
 * - Create directory structure (content/, schema/, uploads/, .cms/)
 * - Load all schemas and compile validators
 * - Rebuild in-memory indexes from file system
 * - Measure and log boot time
 * 
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4
 */
export class CMS {
    private readonly basePath: string
    private readonly fileEngine: FileEngine
    private readonly schemaEngine: SchemaEngine
    private readonly gitEngine: GitEngine
    private readonly queryEngine: QueryEngine
    private readonly rbacEngine: RBACEngine
    private readonly mediaEngine: MediaEngine
    private readonly contentEngine: ContentEngine
    private initialized = false
    private config: CMSConfig | null = null

    /**
     * Create a new CMS instance
     * 
     * @param basePath - Base directory for CMS data (default: process.cwd())
     */
    constructor(basePath: string = process.cwd()) {
        this.basePath = basePath

        // Initialize all engines
        this.fileEngine = new FileEngine()
        this.schemaEngine = new SchemaEngine(join(basePath, 'schema'))
        this.gitEngine = new GitEngine(basePath)
        this.queryEngine = new QueryEngine(
            join(basePath, 'content', 'api'),
            this.fileEngine,
            this.schemaEngine
        )
        this.rbacEngine = new RBACEngine(basePath)
        this.mediaEngine = new MediaEngine(this.fileEngine, basePath)
        this.contentEngine = new ContentEngine(
            basePath,
            this.fileEngine,
            this.schemaEngine,
            this.queryEngine,
            this.gitEngine,
            this.rbacEngine
        )
    }

    /**
     * Initialize the CMS system
     * 
     * Algorithm:
     * 1. Start boot time measurement
     * 2. Initialize Git repository if not exists
     * 3. Create directory structure (content/, schema/, uploads/, .cms/)
     * 4. Load configuration from .cms/config.json (create default if not exists)
     * 5. Load all schemas and compile validators
     * 6. Initialize RBAC configuration (create default if not exists)
     * 7. Rebuild in-memory indexes from file system
     * 8. Measure and log boot time
     * 9. Verify boot time <3s for 10k entries
     * 
     * @throws Error if initialization fails
     * 
     * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 6.1, 6.2, 8.3, 12.1, NFR-1
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            console.warn('CMS already initialized')
            return
        }

        const startTime = Date.now()
        console.log('Initializing Git-Native JSON CMS...')

        try {
            // Step 1: Initialize Git repository if not exists
            await this.initializeGitRepository()

            // Step 2: Create directory structure
            await this.createDirectoryStructure()

            // Step 3: Load configuration (create default if not exists)
            console.log('Loading configuration...')
            await this.loadConfiguration()
            console.log('Configuration loaded')

            // Step 4: Load all schemas and compile validators
            console.log('Loading schemas...')
            const schemas = await this.schemaEngine.loadAllSchemas()
            console.log(`Loaded ${schemas.size} content type schemas`)

            // Step 5: Initialize RBAC configuration (create default if not exists)
            console.log('Initializing RBAC configuration...')
            await this.initializeRBACConfiguration()
            console.log('RBAC configuration loaded')

            // Step 6: Rebuild in-memory indexes from file system
            console.log('Rebuilding indexes...')
            await this.queryEngine.rebuildAllIndexes()
            const totalEntries = this.getTotalEntryCount()
            console.log(`Indexes rebuilt with ${totalEntries} total entries`)

            // Step 7: Measure and log boot time
            const bootDuration = Date.now() - startTime
            console.log(`CMS initialization completed in ${bootDuration}ms`)

            // Step 8: Verify boot time target for 10k entries
            if (totalEntries <= 10000 && bootDuration > 3000) {
                console.warn(
                    `Boot time exceeded 3s target for ${totalEntries} entries: ${bootDuration}ms`
                )
            }

            this.initialized = true
        } catch (error) {
            const bootDuration = Date.now() - startTime
            console.error(`CMS initialization failed after ${bootDuration}ms:`, error)
            throw error
        }
    }

    /**
     * Initialize Git repository if it doesn't exist
     * 
     * Algorithm:
     * 1. Check if .git directory exists
     * 2. If not, run git init
     * 3. Configure Git user if not configured
     * 4. Create initial commit if repository is empty
     * 
     * @throws Error if Git initialization fails
     * 
     * Validates: Requirement 9.6
     */
    private async initializeGitRepository(): Promise<void> {
        const gitDir = join(this.basePath, '.git')

        try {
            // Check if .git directory exists
            await fs.access(gitDir)
            console.log('Git repository already initialized')
        } catch {
            // .git doesn't exist, initialize repository
            console.log('Initializing Git repository...')
            await this.gitEngine.execGit(['init'])

            // Configure Git user if not configured
            try {
                await this.gitEngine.execGit(['config', 'user.name'])
            } catch {
                // User not configured, set default
                await this.gitEngine.execGit(['config', 'user.name', 'CMS System'])
                await this.gitEngine.execGit(['config', 'user.email', 'cms@system.local'])
            }

            console.log('Git repository initialized')
        }

        // Check if repository has any commits
        try {
            await this.gitEngine.execGit(['rev-parse', 'HEAD'])
        } catch {
            // No commits yet, create initial commit
            console.log('Creating initial commit...')
            const readmePath = join(this.basePath, 'README.md')
            await fs.writeFile(
                readmePath,
                '# Git-Native JSON CMS\n\nContent management system with Git versioning.\n'
            )
            await this.gitEngine.commit(
                ['README.md'],
                'Initial commit: Initialize CMS repository'
            )
            console.log('Initial commit created')
        }
    }

    /**
     * Create directory structure for CMS
     * 
     * Creates:
     * - content/api/ - Content entries organized by type
     * - schema/ - Content type schemas
     * - uploads/ - Media files
     * - .cms/ - System files (index, rbac, users, media metadata)
     * 
     * @throws Error if directory creation fails
     * 
     * Validates: Requirement 9.1
     */
    private async createDirectoryStructure(): Promise<void> {
        console.log('Creating directory structure...')

        const directories = [
            join(this.basePath, 'content', 'api'),
            join(this.basePath, 'schema'),
            join(this.basePath, 'uploads'),
            join(this.basePath, '.cms'),
        ]

        for (const dir of directories) {
            try {
                await fs.mkdir(dir, { recursive: true })
            } catch (error) {
                // Ignore error if directory already exists
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
                    throw error
                }
            }
        }

        console.log('Directory structure created')
    }

    /**
     * Initialize RBAC configuration
     *
     * Algorithm:
     * 1. Check if .cms/rbac.json exists
     * 2. If not, create default RBAC configuration with four roles:
     *    - Admin: Full system access
     *    - Editor: Can create, read, update, publish, unpublish content
     *    - Authenticated: Limited permissions, can only update own content
     *    - Public: Read-only access
     * 3. Load RBAC configuration into memory
     *
     * @throws Error if RBAC initialization fails
     *
     * Validates: Requirements 6.1, 6.2, 9.5
     */
    private async initializeRBACConfiguration(): Promise<void> {
        const rbacConfigPath = join(this.basePath, '.cms', 'rbac.json')

        try {
            // Check if RBAC config exists
            await fs.access(rbacConfigPath)
            console.log('RBAC configuration file found')
        } catch {
            // Config doesn't exist, create default
            console.log('Creating default RBAC configuration...')
            await this.rbacEngine.createDefaultConfig()
            console.log('Default RBAC configuration created')
            return // Config already loaded by createDefaultConfig
        }

        // Load existing config
        await this.rbacEngine.loadRBACConfig()
    }

    /**
     * Load configuration from .cms/config.json
     * 
     * Algorithm:
     * 1. Check if .cms/config.json exists
     * 2. If not, create default configuration with:
     *    - JWT secret (randomly generated)
     *    - JWT expiration (7 days)
     *    - Upload limits (10MB max file size)
     *    - Allowed mime types for uploads
     * 3. Load configuration into memory
     * 4. Validate configuration structure
     * 
     * @throws Error if configuration loading fails
     * 
     * Validates: Requirements 8.3, 12.1
     */
    private async loadConfiguration(): Promise<void> {
        const configPath = join(this.basePath, '.cms', 'config.json')

        try {
            // Check if config exists
            await fs.access(configPath)

            // Load existing config
            const configData = await fs.readFile(configPath, 'utf-8')
            this.config = JSON.parse(configData) as CMSConfig

            // Validate required fields
            if (!this.config.jwt?.secret) {
                throw new Error('Configuration missing JWT secret')
            }

            console.log('Configuration loaded from .cms/config.json')
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                // Config doesn't exist, create default
                console.log('Creating default configuration...')
                await this.createDefaultConfiguration()
                console.log('Default configuration created')
            } else {
                // Other error (e.g., invalid JSON, validation error)
                throw error
            }
        }
    }

    /**
     * Create default configuration
     * 
     * Creates a default configuration with:
     * - JWT secret: Randomly generated 64-character hex string
     * - JWT expiration: 7 days (as per requirement 8.4)
     * - Max file size: 10MB (10 * 1024 * 1024 bytes)
     * - Allowed mime types: Common image, video, document types
     * - Max files per upload: 10
     * 
     * @throws Error if configuration creation fails
     * 
     * Validates: Requirements 8.3, 8.4
     */
    private async createDefaultConfiguration(): Promise<void> {
        // Generate a secure random JWT secret
        const jwtSecret = randomBytes(32).toString('hex')

        const defaultConfig: CMSConfig = {
            jwt: {
                secret: jwtSecret,
                expiresIn: '7d' // 7 days as per requirement 8.4
            },
            upload: {
                maxFileSize: 10 * 1024 * 1024, // 10MB
                allowedMimeTypes: [
                    // Images
                    'image/jpeg',
                    'image/jpg',
                    'image/png',
                    'image/gif',
                    'image/webp',
                    'image/svg+xml',
                    // Videos
                    'video/mp4',
                    'video/mpeg',
                    'video/webm',
                    // Documents
                    'application/pdf',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.ms-excel',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    // Archives
                    'application/zip',
                    'application/x-zip-compressed',
                    // Text
                    'text/plain',
                    'text/csv',
                    'application/json'
                ],
                maxFiles: 10
            },
            server: {
                port: 3000,
                host: 'localhost',
                cors: {
                    enabled: true,
                    origin: '*',
                    credentials: true
                }
            }
        }

        const configPath = join(this.basePath, '.cms', 'config.json')
        await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8')

        this.config = defaultConfig
    }


    /**
     * Get total number of entries across all content types
     * 
     * @returns Total entry count
     */
    private getTotalEntryCount(): number {
        let total = 0
        const indexes = this.queryEngine.getAllIndexes()

        for (const index of indexes.values()) {
            total += index.entries.size
        }

        return total
    }

    /**
     * Get the FileEngine instance
     */
    getFileEngine(): FileEngine {
        return this.fileEngine
    }

    /**
     * Get the SchemaEngine instance
     */
    getSchemaEngine(): SchemaEngine {
        return this.schemaEngine
    }

    /**
     * Get the GitEngine instance
     */
    getGitEngine(): GitEngine {
        return this.gitEngine
    }

    /**
     * Get the QueryEngine instance
     */
    getQueryEngine(): QueryEngine {
        return this.queryEngine
    }

    /**
     * Get the RBACEngine instance
     */
    getRBACEngine(): RBACEngine {
        return this.rbacEngine
    }

    /**
     * Get the MediaEngine instance
     */
    getMediaEngine(): MediaEngine {
        return this.mediaEngine
    }

    /**
     * Get the ContentEngine instance
     */
    getContentEngine(): ContentEngine {
        return this.contentEngine
    }

    /**
     * Check if CMS is initialized
     */
    isInitialized(): boolean {
        return this.initialized
    }

    /**
     * Get the current configuration
     * 
     * @returns The CMS configuration
     * @throws Error if CMS is not initialized
     */
    getConfig(): CMSConfig {
        if (!this.config) {
            throw new Error('CMS not initialized - configuration not loaded')
        }
        return this.config
    }
}
