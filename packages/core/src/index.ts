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
import { MetadataEngine } from './engines/metadata-engine.js'
import type { CMSConfig, RequestContext } from './types/index.js'

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
export { MetadataEngine } from './engines/metadata-engine.js'

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
    private readonly contentGitEngine: GitEngine
    private readonly queryEngine: QueryEngine
    private readonly rbacEngine: RBACEngine
    private readonly mediaEngine: MediaEngine
    private readonly metadataEngine: MetadataEngine
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
        this.contentGitEngine = new GitEngine(join(basePath, 'content'))
        this.queryEngine = new QueryEngine(
            join(basePath, 'content', 'api'),
            this.fileEngine,
            this.schemaEngine
        )
        this.rbacEngine = new RBACEngine(basePath)
        this.mediaEngine = new MediaEngine(this.fileEngine, basePath)
        this.metadataEngine = new MetadataEngine(basePath, this.fileEngine)
        this.contentEngine = new ContentEngine(
            basePath,
            this.fileEngine,
            this.schemaEngine,
            this.queryEngine,
            this.contentGitEngine,
            this.rbacEngine,
            this.metadataEngine
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

            console.log('Loading configuration...')
            await this.loadConfiguration()
            console.log('Configuration loaded')

            // Step 3.5: Initialize metadata engine
            console.log('Initializing metadata...')
            await this.metadataEngine.init()
            console.log('Metadata initialized')

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

        // Initialize content worktree
        await this.initializeContentWorktree()
    }

    /**
     * Initialize Git worktree for content management.
     * 
     * Algorithm:
     * 1. Check if 'cms-data' branch exists, create if not (orphaned)
     * 2. Check if 'content/' is already a worktree
     * 3. If not, setup worktree:
     *    - Stash/Backup existing content
     *    - Run git worktree add
     *    - Restore content if needed
     * 4. IMPORTANT: Ensure root stays on original branch
     */
    private async initializeContentWorktree(): Promise<void> {
        const contentDir = join(this.basePath, 'content')
        const contentGitPath = join(contentDir, '.git')
        const branchName = 'cms-data'

        // Get current branch to return to it later
        let currentBranch = 'main'
        try {
            const status = await this.gitEngine.execGit(['rev-parse', '--abbrev-ref', 'HEAD'])
            currentBranch = status.trim()
        } catch {
            // Fallback to main
        }

        try {
            // 1. Ensure branch exists
            let branchExists = false
            try {
                await this.gitEngine.execGit(['rev-parse', '--verify', branchName])
                branchExists = true
            } catch {
                branchExists = false
            }

            if (!branchExists) {
                console.log(`Creating branch ${branchName}...`)
                // Create an orphan branch for data to keep it separate from code history
                await this.gitEngine.execGit(['checkout', '--orphan', branchName])
                await this.gitEngine.execGit(['rm', '-rf', '.'])
                await fs.writeFile(join(this.basePath, '.gitkeep'), '')
                await this.gitEngine.execGit(['add', '.gitkeep'])
                await this.gitEngine.execGit(['commit', '-m', 'Initial data branch commit'])

                // Return to original branch immediately
                await this.gitEngine.execGit(['checkout', currentBranch])
            }

            // 2. Check if content directory is a worktree
            let isWorktree = false
            try {
                const stat = await fs.stat(contentGitPath)
                isWorktree = stat.isFile() // Git worktree .git is a file
            } catch {
                isWorktree = false
            }

            if (!isWorktree) {
                console.log('Setting up Git worktree for content...')

                // If content directory exists, we might need to backup data
                const tempBackup = join(this.basePath, '.content_backup')
                let hadExistingContent = false
                try {
                    await fs.access(contentDir)
                    // Ensure backup dir is clear first to prevent rename crashing
                    await fs.rm(tempBackup, { recursive: true, force: true }).catch(() => { })
                    await fs.rename(contentDir, tempBackup)
                    hadExistingContent = true
                } catch (error) {
                    console.log('No existing content directory to backup or rename failed')
                }

                // Add the worktree
                await this.gitEngine.execGit(['worktree', 'add', 'content', branchName])

                // Restore backup if it existed
                if (hadExistingContent) {
                    // Copy files from backup to new worktree dir
                    try {
                        await fs.cp(tempBackup, contentDir, { recursive: true, force: true })
                        await fs.rm(tempBackup, { recursive: true, force: true })
                    } catch (err) {
                        console.error('Failed to restore content backup:', err)
                    }
                }

                console.log('Content worktree setup complete')
            }
        } catch (error) {
            console.error('Failed to initialize content worktree:', error)
            // Ensure we try to get back to main even on error
            try {
                await this.gitEngine.execGit(['checkout', currentBranch])
            } catch { }
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
     * Get the MetadataEngine instance
     */
    getMetadataEngine(): MetadataEngine {
        return this.metadataEngine
    }

    /**
     * Get the ContentEngine instance
     */
    getContentEngine(): ContentEngine {
        return this.contentEngine
    }

    /**
     * Delete a content type and all its associated data
     * 
     * @param contentType - The API ID of the content type to delete
     * @param context - Request context for Git author info
     */
    async deleteContentType(contentType: string, context?: RequestContext): Promise<void> {
        console.log(`Deleting content type: ${contentType}`)

        // 1. Delete all content entries
        await this.contentEngine.deleteAllEntries(contentType)

        // 2. Remove from QueryEngine (in-memory index)
        this.queryEngine.removeIndex(contentType)

        // 3. Delete metadata
        await this.metadataEngine.deleteMetadata(contentType)

        // 4. Delete schema file
        await this.schemaEngine.deleteSchema(contentType)

        // 5. Commit changes to Git
        const schemaPath = `schema/${contentType}.schema.json`
        const contentRelativePath = `api/${contentType}`
        const metadataPath = `.cms/metadata.json`

        const author = context?.user
            ? {
                name: context.user.username,
                email: context.user.email,
            }
            : undefined

        // Commit schema and metadata in root repository
        await this.gitEngine.commit(
            [schemaPath, metadataPath],
            `delete(schema): remove ${contentType} schema and metadata`,
            author
        )

        // Commit content deletion in content worktree
        try {
            await this.contentGitEngine.commit(
                [contentRelativePath],
                `delete(content): remove all entries for ${contentType}`,
                author
            )
        } catch (error) {
            // It's possible there were no entries to delete in Git if they weren't committed yet
            console.warn(`Note: Could not commit content deletion for ${contentType}:`, (error as Error).message)
        }

        console.log(`Content type ${contentType} deleted successfully`)
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
