
import { CMS } from '../../index'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execSync } from 'child_process'

describe('Git Worktree Integration', () => {
    let cmsPath: string
    let cms: CMS

    beforeEach(async () => {
        cmsPath = join(tmpdir(), `cms-test-${randomBytes(8).toString('hex')}`)
        await fs.mkdir(cmsPath, { recursive: true })
        cms = new CMS(cmsPath)
    })

    afterEach(async () => {
        try {
            // Clean up worktrees first to allow directory removal
            execSync('git worktree prune', { cwd: cmsPath })
        } catch (e) {}
        await fs.rm(cmsPath, { recursive: true, force: true })
    })

    it('should initialize content/ as a separate worktree on cms-data branch', async () => {
        await cms.initialize()

        // Verify .git exists in root
        await expect(fs.access(join(cmsPath, '.git'))).resolves.toBeUndefined()

        // Verify content/ is a worktree
        const worktreeList = execSync('git worktree list', { cwd: cmsPath }).toString()
        expect(worktreeList).toContain(join(cmsPath, 'content'))
        expect(worktreeList).toContain('cms-data')

        // Verify branches
        const branches = execSync('git branch', { cwd: cmsPath }).toString()
        expect(branches).toContain('main')
        expect(branches).toContain('cms-data')
    })

    it('should isolate content commits from main code commits', async () => {
        await cms.initialize()

        // 1. Create content entry
        const context = {
            user: { id: 'test-user', username: 'testuser', email: 'test@example.com', role: 'admin' },
            role: 'admin'
        }
        
        // Create a schema first to allow entry creation
        const schema = {
            apiId: 'article',
            displayName: 'Article',
            singularName: 'article',
            pluralName: 'articles',
            kind: 'collectionType',
            attributes: {
                title: { type: 'string', required: true }
            }
        }
        await cms.getSchemaEngine().saveSchema('article', schema as any)
        // Manual commit for schema as it's not automated in SchemaEngine yet (orchestrated bits are in CMS)
        await cms.getGitEngine().commit(['schema/article.schema.json'], 'Add article schema')

        // Create entry
        await cms.getContentEngine().create('article', { title: 'Hello World' }, context as any)

        // Verify content commit on cms-data branch
        const dataLog = execSync('git log cms-data --format=%s', { cwd: cmsPath }).toString()
        expect(dataLog).toContain('Create article entry')

        // Verify content commit NOT on main branch
        const mainLog = execSync('git log main --format=%s', { cwd: cmsPath }).toString()
        expect(mainLog).not.toContain('Create article entry')
        expect(mainLog).toContain('Add article schema')
    })

    it('should split deleteContentType commits between root and content worktree', async () => {
        await cms.initialize()
        const context = {
            user: { id: 'test-user', username: 'testuser', email: 'test@example.com', role: 'admin' },
            role: 'admin'
        }

        // 1. Setup: Create schema and entry
        const schema = {
            apiId: 'article',
            displayName: 'Article',
            singularName: 'article',
            pluralName: 'articles',
            kind: 'collectionType',
            attributes: { title: { type: 'string', required: true } }
        }
        await cms.getSchemaEngine().saveSchema('article', schema as any)
        await cms.getGitEngine().commit(['schema/article.schema.json'], 'Add article schema')
        await cms.getContentEngine().create('article', { title: 'To be deleted' }, context as any)

        // 2. Execute deletion
        await cms.deleteContentType('article', context as any)

        // 3. Verify content deletion on cms-data
        const dataLog = execSync('git log cms-data --format=%s', { cwd: cmsPath }).toString()
        expect(dataLog).toContain('delete(content): remove all entries for article')

        // 4. Verify schema deletion on main
        const mainLog = execSync('git log main --format=%s', { cwd: cmsPath }).toString()
        expect(mainLog).toContain('delete(schema): remove article and all its entries')
        
        // Verify files are gone
        await expect(fs.access(join(cmsPath, 'schema/article.schema.json'))).rejects.toThrow()
        await expect(fs.access(join(cmsPath, 'content/api/article'))).rejects.toThrow()
    })
})
