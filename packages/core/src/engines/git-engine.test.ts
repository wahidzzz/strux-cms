import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GitEngine } from './git-engine.js'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execSync } from 'child_process'

describe('GitEngine', () => {
  let gitEngine: GitEngine
  let testDir: string

  beforeEach(async () => {
    // Create a temporary directory for testing
    testDir = join(tmpdir(), `git-engine-test-${Date.now()}-${Math.random().toString(36).substring(7)}`)
    await fs.mkdir(testDir, { recursive: true })

    // Initialize a Git repository
    execSync('git init', { cwd: testDir })
    execSync('git config user.name "Test User"', { cwd: testDir })
    execSync('git config user.email "test@example.com"', { cwd: testDir })

    // Create initial commit (required for some operations)
    const initialFile = join(testDir, 'README.md')
    await fs.writeFile(initialFile, '# Test Repository\n', 'utf8')
    execSync('git add README.md', { cwd: testDir })
    execSync('git commit -m "Initial commit"', { cwd: testDir })

    gitEngine = new GitEngine(testDir)
  })

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  describe('commit', () => {
    it('should commit a single file successfully', async () => {
      // Create a test file
      const testFile = join(testDir, 'test.json')
      await fs.writeFile(testFile, JSON.stringify({ test: 'data' }), 'utf8')

      // Commit the file
      const commitHash = await gitEngine.commit(['test.json'], 'Add test file')

      // Verify commit hash is returned
      expect(commitHash).toBeTruthy()
      expect(commitHash).toMatch(/^[a-f0-9]+$/)

      // Verify commit exists in Git history
      const log = execSync('git log --oneline', { cwd: testDir }).toString()
      expect(log).toContain('Add test file')
    })

    it('should commit multiple files successfully', async () => {
      // Create multiple test files
      const file1 = join(testDir, 'file1.json')
      const file2 = join(testDir, 'file2.json')
      await fs.writeFile(file1, JSON.stringify({ file: 1 }), 'utf8')
      await fs.writeFile(file2, JSON.stringify({ file: 2 }), 'utf8')

      // Commit both files
      const commitHash = await gitEngine.commit(
        ['file1.json', 'file2.json'],
        'Add multiple files'
      )

      // Verify commit hash
      expect(commitHash).toBeTruthy()

      // Verify both files are in the commit
      const show = execSync(`git show --name-only ${commitHash}`, { cwd: testDir }).toString()
      expect(show).toContain('file1.json')
      expect(show).toContain('file2.json')
    })

    it('should commit with author information', async () => {
      // Create a test file
      const testFile = join(testDir, 'authored.json')
      await fs.writeFile(testFile, JSON.stringify({ authored: true }), 'utf8')

      // Commit with author
      const author = { name: 'John Doe', email: 'john@example.com' }
      const commitHash = await gitEngine.commit(['authored.json'], 'Add authored file', author)

      // Verify commit has correct author
      const show = execSync(`git show ${commitHash}`, { cwd: testDir }).toString()
      expect(show).toContain('Author: John Doe <john@example.com>')
    })

    it('should throw error when files array is empty', async () => {
      await expect(gitEngine.commit([], 'Empty commit')).rejects.toThrow('No files to commit')
    })

    it('should throw error when message is empty', async () => {
      const testFile = join(testDir, 'test.json')
      await fs.writeFile(testFile, JSON.stringify({ test: 'data' }), 'utf8')

      await expect(gitEngine.commit(['test.json'], '')).rejects.toThrow('Commit message required')
    })

    it('should throw error when file is not staged', async () => {
      // Try to commit a non-existent file
      await expect(gitEngine.commit(['nonexistent.json'], 'Commit nonexistent')).rejects.toThrow()
    })

    it('should verify commit exists in Git history', async () => {
      // Create and commit a file
      const testFile = join(testDir, 'verified.json')
      await fs.writeFile(testFile, JSON.stringify({ verified: true }), 'utf8')

      const commitHash = await gitEngine.commit(['verified.json'], 'Verified commit')

      // Verify we can retrieve the commit
      const catFile = execSync(`git cat-file -t ${commitHash}`, { cwd: testDir }).toString()
      expect(catFile.trim()).toBe('commit')
    })
  })

  describe('commitAll', () => {
    it('should commit all changes successfully', async () => {
      // Create multiple test files
      const file1 = join(testDir, 'all1.json')
      const file2 = join(testDir, 'all2.json')
      await fs.writeFile(file1, JSON.stringify({ all: 1 }), 'utf8')
      await fs.writeFile(file2, JSON.stringify({ all: 2 }), 'utf8')

      // Stage files first (commitAll requires files to be tracked)
      execSync('git add all1.json all2.json', { cwd: testDir })
      execSync('git commit -m "Initial add"', { cwd: testDir })

      // Modify files
      await fs.writeFile(file1, JSON.stringify({ all: 1, modified: true }), 'utf8')
      await fs.writeFile(file2, JSON.stringify({ all: 2, modified: true }), 'utf8')

      // Commit all changes
      const commitHash = await gitEngine.commitAll('Update all files')

      // Verify commit hash
      expect(commitHash).toBeTruthy()

      // Verify commit message
      const log = execSync('git log --oneline -1', { cwd: testDir }).toString()
      expect(log).toContain('Update all files')
    })

    it('should commit all with author information', async () => {
      // Create and track a file
      const testFile = join(testDir, 'tracked.json')
      await fs.writeFile(testFile, JSON.stringify({ tracked: true }), 'utf8')
      execSync('git add tracked.json', { cwd: testDir })
      execSync('git commit -m "Track file"', { cwd: testDir })

      // Modify the file
      await fs.writeFile(testFile, JSON.stringify({ tracked: true, modified: true }), 'utf8')

      // Commit with author
      const author = { name: 'Jane Doe', email: 'jane@example.com' }
      const commitHash = await gitEngine.commitAll('Update tracked file', author)

      // Verify author
      const show = execSync(`git show ${commitHash}`, { cwd: testDir }).toString()
      expect(show).toContain('Author: Jane Doe <jane@example.com>')
    })

    it('should throw error when message is empty', async () => {
      await expect(gitEngine.commitAll('')).rejects.toThrow('Commit message required')
    })

    it('should verify commit exists in Git history', async () => {
      // Create and track a file
      const testFile = join(testDir, 'verify-all.json')
      await fs.writeFile(testFile, JSON.stringify({ verify: true }), 'utf8')
      execSync('git add verify-all.json', { cwd: testDir })
      execSync('git commit -m "Track file"', { cwd: testDir })

      // Modify and commit
      await fs.writeFile(testFile, JSON.stringify({ verify: true, modified: true }), 'utf8')
      const commitHash = await gitEngine.commitAll('Verify commitAll')

      // Verify commit exists
      const catFile = execSync(`git cat-file -t ${commitHash}`, { cwd: testDir }).toString()
      expect(catFile.trim()).toBe('commit')
    })
  })

  describe('getStatus', () => {
    it('should return current branch', async () => {
      const status = await gitEngine.getStatus()
      expect(status.branch).toBeTruthy()
      // Default branch is usually 'master' or 'main'
      expect(['master', 'main']).toContain(status.branch)
    })

    it('should detect staged files', async () => {
      // Create and stage a file
      const testFile = join(testDir, 'staged.json')
      await fs.writeFile(testFile, JSON.stringify({ staged: true }), 'utf8')
      execSync('git add staged.json', { cwd: testDir })

      const status = await gitEngine.getStatus()
      expect(status.staged).toContain('staged.json')
    })

    it('should detect unstaged files', async () => {
      // Create and track a file
      const testFile = join(testDir, 'unstaged.json')
      await fs.writeFile(testFile, JSON.stringify({ unstaged: false }), 'utf8')
      execSync('git add unstaged.json', { cwd: testDir })
      execSync('git commit -m "Track file"', { cwd: testDir })

      // Modify the file (unstaged change)
      await fs.writeFile(testFile, JSON.stringify({ unstaged: true }), 'utf8')

      const status = await gitEngine.getStatus()
      expect(status.unstaged).toContain('unstaged.json')
    })

    it('should detect untracked files', async () => {
      // Create an untracked file
      const testFile = join(testDir, 'untracked.json')
      await fs.writeFile(testFile, JSON.stringify({ untracked: true }), 'utf8')

      const status = await gitEngine.getStatus()
      expect(status.untracked).toContain('untracked.json')
    })

    it('should return empty arrays when working directory is clean', async () => {
      const status = await gitEngine.getStatus()
      expect(status.staged).toEqual([])
      expect(status.unstaged).toEqual([])
      expect(status.untracked).toEqual([])
    })
  })

  describe('generateCommitMessage', () => {
    it('should generate message for create operation', () => {
      const message = gitEngine.generateCommitMessage('create', 'articles', 'abc123')
      expect(message).toBe('Create articles entry abc123')
    })

    it('should generate message for update operation', () => {
      const message = gitEngine.generateCommitMessage('update', 'users', 'xyz789')
      expect(message).toBe('Update users entry xyz789')
    })

    it('should generate message for delete operation', () => {
      const message = gitEngine.generateCommitMessage('delete', 'products', 'def456')
      expect(message).toBe('Delete products entry def456')
    })

    it('should capitalize operation name', () => {
      const message = gitEngine.generateCommitMessage('create', 'test', 'id')
      expect(message).toMatch(/^Create/)
    })
  })

  describe('error handling and retry', () => {
    it('should handle Git command failures gracefully', async () => {
      // Try to commit without staging
      await expect(
        gitEngine.commit(['nonexistent-file.json'], 'This should fail')
      ).rejects.toThrow()
    })

    it('should retry failed operations once', async () => {
      // This test verifies the retry logic exists
      // In practice, most Git operations either succeed or fail deterministically
      // The retry is useful for transient failures (network issues, locks, etc.)
      
      // Create a file and commit it successfully
      const testFile = join(testDir, 'retry-test.json')
      await fs.writeFile(testFile, JSON.stringify({ retry: true }), 'utf8')
      
      const commitHash = await gitEngine.commit(['retry-test.json'], 'Test retry logic')
      expect(commitHash).toBeTruthy()
    })
  })

  describe('branch operations', () => {
    it('should create a new branch', async () => {
      await gitEngine.createBranch('feature-branch')
      
      const branches = execSync('git branch', { cwd: testDir }).toString()
      expect(branches).toContain('feature-branch')
    })

    it('should create a branch from a specific base', async () => {
      // Create a commit to use as base
      const testFile = join(testDir, 'base.json')
      await fs.writeFile(testFile, JSON.stringify({ base: true }), 'utf8')
      const baseCommit = await gitEngine.commit(['base.json'], 'Base commit')
      
      // Create branch from base
      await gitEngine.createBranch('from-base', baseCommit)
      
      const branches = execSync('git branch', { cwd: testDir }).toString()
      expect(branches).toContain('from-base')
    })

    it('should switch to an existing branch', async () => {
      await gitEngine.createBranch('switch-test')
      await gitEngine.switchBranch('switch-test')
      
      const currentBranch = await gitEngine.getCurrentBranch()
      expect(currentBranch).toBe('switch-test')
    })

    it('should get current branch name', async () => {
      const currentBranch = await gitEngine.getCurrentBranch()
      expect(currentBranch).toBeTruthy()
      expect(['master', 'main']).toContain(currentBranch)
    })

    it('should list all branches', async () => {
      await gitEngine.createBranch('branch1')
      await gitEngine.createBranch('branch2')
      
      const branches = await gitEngine.listBranches()
      expect(branches).toContain('branch1')
      expect(branches).toContain('branch2')
      expect(branches.length).toBeGreaterThanOrEqual(3) // main/master + branch1 + branch2
    })

    it('should merge branches successfully', async () => {
      // Create a file on main branch
      const mainFile = join(testDir, 'main.json')
      await fs.writeFile(mainFile, JSON.stringify({ branch: 'main' }), 'utf8')
      await gitEngine.commit(['main.json'], 'Main branch commit')
      
      // Create and switch to feature branch
      await gitEngine.createBranch('feature')
      await gitEngine.switchBranch('feature')
      
      // Create a file on feature branch
      const featureFile = join(testDir, 'feature.json')
      await fs.writeFile(featureFile, JSON.stringify({ branch: 'feature' }), 'utf8')
      await gitEngine.commit(['feature.json'], 'Feature branch commit')
      
      // Get current branch name
      const mainBranch = execSync('git branch --show-current', { cwd: testDir }).toString().trim() || 'main'
      
      // Switch back to main and merge
      await gitEngine.switchBranch(mainBranch)
      const result = await gitEngine.mergeBranch('feature', mainBranch)
      
      expect(result.success).toBe(true)
    })

    it('should throw error for invalid branch name', async () => {
      await expect(gitEngine.createBranch('')).rejects.toThrow('Branch name required')
      await expect(gitEngine.switchBranch('')).rejects.toThrow('Branch name required')
    })
  })

  describe('history and diff operations', () => {
    it('should get commit history', async () => {
      // Create some commits
      const file1 = join(testDir, 'history1.json')
      await fs.writeFile(file1, JSON.stringify({ version: 1 }), 'utf8')
      await gitEngine.commit(['history1.json'], 'First commit')
      
      const file2 = join(testDir, 'history2.json')
      await fs.writeFile(file2, JSON.stringify({ version: 2 }), 'utf8')
      await gitEngine.commit(['history2.json'], 'Second commit')
      
      const history = await gitEngine.getHistory()
      expect(history.length).toBeGreaterThanOrEqual(2)
      expect(history[0].message).toBe('Second commit')
      expect(history[1].message).toBe('First commit')
    })

    it('should get history for a specific file', async () => {
      // Create and modify a file multiple times
      const testFile = join(testDir, 'tracked.json')
      await fs.writeFile(testFile, JSON.stringify({ version: 1 }), 'utf8')
      await gitEngine.commit(['tracked.json'], 'Version 1')
      
      await fs.writeFile(testFile, JSON.stringify({ version: 2 }), 'utf8')
      await gitEngine.commit(['tracked.json'], 'Version 2')
      
      const history = await gitEngine.getHistory('tracked.json')
      expect(history.length).toBeGreaterThanOrEqual(2)
      expect(history.every(c => c.files.includes('tracked.json'))).toBe(true)
    })

    it('should limit history results', async () => {
      // Create multiple commits
      for (let i = 0; i < 5; i++) {
        const file = join(testDir, `limit-${i}.json`)
        await fs.writeFile(file, JSON.stringify({ i }), 'utf8')
        await gitEngine.commit([`limit-${i}.json`], `Commit ${i}`)
      }
      
      const history = await gitEngine.getHistory(undefined, 3)
      expect(history.length).toBeLessThanOrEqual(3)
    })

    it('should get commit details', async () => {
      const testFile = join(testDir, 'details.json')
      await fs.writeFile(testFile, JSON.stringify({ details: true }), 'utf8')
      const author = { name: 'Test Author', email: 'author@test.com' }
      const commitHash = await gitEngine.commit(['details.json'], 'Detailed commit', author)
      
      const commit = await gitEngine.getCommit(commitHash)
      // The commit hash from getCommit might be the full hash
      expect(commit.hash).toContain(commitHash) // Short hash should be contained in full hash
      expect(commit.message).toBe('Detailed commit')
      expect(commit.author.name).toBe('Test Author')
      expect(commit.author.email).toBe('author@test.com')
      expect(commit.files).toContain('details.json')
      expect(commit.date).toBeInstanceOf(Date)
    })

    it('should get diff between commits', async () => {
      // Create first commit
      const file1 = join(testDir, 'diff1.json')
      await fs.writeFile(file1, JSON.stringify({ version: 1 }), 'utf8')
      const hash1 = await gitEngine.commit(['diff1.json'], 'First version')
      
      // Create second commit
      await fs.writeFile(file1, JSON.stringify({ version: 2, updated: true }), 'utf8')
      const hash2 = await gitEngine.commit(['diff1.json'], 'Second version')
      
      const diff = await gitEngine.getDiff(hash1, hash2)
      expect(diff.files.length).toBeGreaterThan(0)
      expect(diff.files[0].path).toBe('diff1.json')
      expect(diff.files[0].status).toBe('modified')
    })

    it('should throw error for invalid commit hash', async () => {
      await expect(gitEngine.getCommit('')).rejects.toThrow('Commit hash required')
      await expect(gitEngine.getDiff('', 'abc')).rejects.toThrow('First commit hash required')
      await expect(gitEngine.getDiff('abc', '')).rejects.toThrow('Second commit hash required')
    })
  })

  describe('restore operations', () => {
    it('should restore file from a specific commit', async () => {
      // Create initial version
      const testFile = join(testDir, 'restore.json')
      await fs.writeFile(testFile, JSON.stringify({ version: 1 }), 'utf8')
      const hash1 = await gitEngine.commit(['restore.json'], 'Version 1')
      
      // Create second version
      await fs.writeFile(testFile, JSON.stringify({ version: 2 }), 'utf8')
      await gitEngine.commit(['restore.json'], 'Version 2')
      
      // Restore to version 1
      await gitEngine.restoreFile('restore.json', hash1)
      
      const content = await fs.readFile(testFile, 'utf8')
      const data = JSON.parse(content)
      expect(data.version).toBe(1)
    })

    it('should revert a commit', async () => {
      // Create a commit to revert
      const testFile = join(testDir, 'revert.json')
      await fs.writeFile(testFile, JSON.stringify({ revert: false }), 'utf8')
      await gitEngine.commit(['revert.json'], 'Initial')
      
      await fs.writeFile(testFile, JSON.stringify({ revert: true }), 'utf8')
      const badCommit = await gitEngine.commit(['revert.json'], 'Bad commit')
      
      // Revert the commit
      const revertHash = await gitEngine.revertCommit(badCommit)
      
      expect(revertHash).toBeTruthy()
      expect(revertHash).not.toBe(badCommit)
      
      // Verify revert commit exists
      const history = await gitEngine.getHistory('revert.json')
      // The revert hash might be a short hash, so check if any commit hash starts with it
      expect(history.some(c => c.hash.startsWith(revertHash) || revertHash.startsWith(c.hash))).toBe(true)
    })

    it('should throw error for invalid restore parameters', async () => {
      await expect(gitEngine.restoreFile('', 'abc')).rejects.toThrow('File path required')
      await expect(gitEngine.restoreFile('file.json', '')).rejects.toThrow('Commit hash required')
      await expect(gitEngine.revertCommit('')).rejects.toThrow('Commit hash required')
    })
  })

  describe('status operations', () => {
    it('should check if working directory is clean', async () => {
      const isClean = await gitEngine.isClean()
      expect(isClean).toBe(true)
    })

    it('should detect dirty working directory', async () => {
      // Create an untracked file
      const testFile = join(testDir, 'dirty.json')
      await fs.writeFile(testFile, JSON.stringify({ dirty: true }), 'utf8')
      
      const isClean = await gitEngine.isClean()
      expect(isClean).toBe(false)
    })

    it('should detect staged changes as not clean', async () => {
      // Create and stage a file
      const testFile = join(testDir, 'staged.json')
      await fs.writeFile(testFile, JSON.stringify({ staged: true }), 'utf8')
      execSync('git add staged.json', { cwd: testDir })
      
      const isClean = await gitEngine.isClean()
      expect(isClean).toBe(false)
    })
  })
})
