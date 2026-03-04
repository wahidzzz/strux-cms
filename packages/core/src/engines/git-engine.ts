import { spawn } from 'child_process'
import type { GitAuthor, GitStatus, MergeResult, GitCommit, GitDiff, FileDiff } from '../types/index.js'

/**
 * GitEngine manages all Git operations for versioning content mutations.
 *
 * Key features:
 * - Execute Git commands via child_process.spawn
 * - Commit every content mutation with descriptive messages
 * - Verify commits exist in Git history
 * - Support author information
 * - Handle errors gracefully with retry logic
 *
 * Validates: Requirements 4.1, 4.3, NFR-10
 */
export class GitEngine {
  private gitDir: string
  private readonly MAX_RETRIES = 1

  /**
   * Create a new GitEngine instance.
   *
   * @param gitDir - The directory containing the Git repository (default: process.cwd())
   */
  constructor(gitDir: string = process.cwd()) {
    this.gitDir = gitDir
  }

  /**
   * Execute a Git command using child_process.spawn.
   *
   * This is the core helper method that all Git operations use.
   * It handles:
   * - Process spawning with proper stdio configuration
   * - Output collection (stdout and stderr)
   * - Error handling with exit codes
   * - Timeout handling (optional)
   *
   * @param args - Git command arguments (e.g., ['add', 'file.json'])
   * @param retryCount - Current retry attempt (used internally for retry logic)
   * @returns Promise resolving to stdout output
   * @throws Error if Git command fails
   */
  async execGit(args: string[], retryCount = 0): Promise<string> {
    console.log(`[GitEngine][${this.gitDir}] Executing: git ${args.join(' ')}`)
    return new Promise((resolve, reject) => {
      const proc = spawn('git', args, {
        cwd: this.gitDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      proc.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('close', async (code) => {
        if (code !== 0) {
          const error = new Error(
            `Git command failed (exit code ${code}): ${stderr.trim() || stdout.trim()}`
          )

          // Retry logic: retry once on failure
          if (retryCount < this.MAX_RETRIES) {
            try {
              const result = await this.execGit(args, retryCount + 1)
              resolve(result)
              return
            } catch (retryError) {
              reject(retryError)
              return
            }
          }

          reject(error)
        } else {
          resolve(stdout)
        }
      })

      proc.on('error', (error) => {
        reject(new Error(`Failed to spawn git process: ${error.message}`))
      })
    })
  }

  /**
   * Commit specific files to Git with a descriptive message.
   *
   * This method:
   * 1. Validates inputs (files array, message)
   * 2. Stages the specified files
   * 3. Creates a commit with the message and optional author
   * 4. Verifies the commit exists in Git history
   * 5. Returns the commit hash
   *
   * Algorithm:
   * 1. Validate inputs
   * 2. Stage files using 'git add'
   * 3. Verify files are staged
   * 4. Create commit with message and author
   * 5. Extract commit hash from output
   * 6. Verify commit exists using 'git cat-file'
   *
   * @param files - Array of file paths to commit (relative to gitDir)
   * @param message - Commit message describing the change
   * @param author - Optional author information (name and email)
   * @returns Promise resolving to commit hash
   * @throws Error if files are empty, message is empty, or commit fails
   */
  async commit(
    files: string[],
    message: string,
    author?: GitAuthor
  ): Promise<string> {
    // Step 1: Validate inputs
    if (!files || files.length === 0) {
      throw new Error('No files to commit')
    }
    if (!message || message.trim().length === 0) {
      throw new Error('Commit message required')
    }

    // Step 2: Stage files
    // Use -f (force) because content worktree might be ignored in parent .gitignore
    const addArgs = ['add', '-f', ...files]
    await this.execGit(addArgs)

    // Step 3: Verify files are staged
    const status = await this.getStatus()
    const stagedFiles = new Set(status.staged)

    for (const file of files) {
      const isStaged = stagedFiles.has(file) || Array.from(stagedFiles).some(staged => staged.startsWith(`${file}/`))
      if (!isStaged) {
        // If not staged, check if it has any unstaged changes or is untracked
        // If it's completely clean (in sync with HEAD), we can safely skip it
        const hasUnstagedChanges = status.unstaged.includes(file) || Array.from(status.unstaged).some(unstaged => unstaged.startsWith(`${file}/`))
        const isUntracked = status.untracked.includes(file) || Array.from(status.untracked).some(untracked => untracked.startsWith(`${file}/`))
        const isIgnored = status.ignored.includes(file) || Array.from(status.ignored).some(ignored => ignored.startsWith(`${file}/`))

        if (hasUnstagedChanges || isUntracked || isIgnored) {
          throw new Error(`File not staged: ${file}`)
        }
      }
    }

    // Step 4: Create commit
    const commitArgs = ['commit', '-m', message]

    if (author) {
      commitArgs.push('--author', `${author.name} <${author.email}>`)
    }

    const commitOutput = await this.execGit(commitArgs)

    // Step 5: Extract commit hash
    // Git commit output format: "[branch hash] message"
    const hashMatch = commitOutput.match(/\[.+?\s+([a-f0-9]+)\]/)
    if (!hashMatch) {
      throw new Error('Failed to extract commit hash from git output')
    }

    const commitHash = hashMatch[1]

    // Step 6: Verify commit exists
    try {
      const verifyArgs = ['cat-file', '-t', commitHash]
      const objectType = await this.execGit(verifyArgs)

      if (objectType.trim() !== 'commit') {
        throw new Error(`Commit verification failed: ${commitHash} is not a commit object`)
      }
    } catch (error) {
      throw new Error(
        `Commit verification failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    return commitHash
  }

  /**
   * Commit all changes (staged and unstaged) with a descriptive message.
   *
   * This is a convenience method for committing all changes at once.
   * It uses 'git commit -a' to automatically stage all tracked files.
   *
   * Algorithm:
   * 1. Validate message
   * 2. Create commit with -a flag (auto-stage)
   * 3. Extract commit hash
   * 4. Verify commit exists
   *
   * @param message - Commit message describing the change
   * @param author - Optional author information (name and email)
   * @returns Promise resolving to commit hash
   * @throws Error if message is empty or commit fails
   */
  async commitAll(message: string, author?: GitAuthor): Promise<string> {
    // Step 1: Validate message
    if (!message || message.trim().length === 0) {
      throw new Error('Commit message required')
    }

    // Step 2: Create commit with -a flag
    const commitArgs = ['commit', '-a', '-m', message]

    if (author) {
      commitArgs.push('--author', `${author.name} <${author.email}>`)
    }

    const commitOutput = await this.execGit(commitArgs)

    // Step 3: Extract commit hash
    const hashMatch = commitOutput.match(/\[.+?\s+([a-f0-9]+)\]/)
    if (!hashMatch) {
      throw new Error('Failed to extract commit hash from git output')
    }

    const commitHash = hashMatch[1]

    // Step 4: Verify commit exists
    try {
      const verifyArgs = ['cat-file', '-t', commitHash]
      const objectType = await this.execGit(verifyArgs)

      if (objectType.trim() !== 'commit') {
        throw new Error(`Commit verification failed: ${commitHash} is not a commit object`)
      }
    } catch (error) {
      throw new Error(
        `Commit verification failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    return commitHash
  }

  /**
   * Get the current Git status.
   *
   * This method parses 'git status --porcelain' output to determine:
   * - Current branch
   * - Staged files
   * - Unstaged files
   * - Untracked files
   *
   * @returns Promise resolving to GitStatus object
   * @throws Error if status command fails
   */
  async getStatus(): Promise<GitStatus> {
    // Get current branch
    const branchOutput = await this.execGit(['branch', '--show-current'])
    const branch = branchOutput.trim()

    // Get status in porcelain format including ignored files
    const statusOutput = await this.execGit(['status', '--porcelain', '--ignored'])

    const staged: string[] = []
    const unstaged: string[] = []
    const untracked: string[] = []
    const ignored: string[] = []

    // Parse porcelain output
    // Format: XY filename
    // X = index status (position 0), Y = working tree status (position 1)
    // Position 2 is a space separator
    // Filename starts at position 3
    const lines = statusOutput.split('\n').filter(line => line.length > 3)

    for (const line of lines) {
      const indexStatus = line.charAt(0)
      const workTreeStatus = line.charAt(1)
      // Filename starts at position 3 (after XY and space)
      const filename = line.substring(3)

      // Staged files (index has changes)
      if (indexStatus !== ' ' && indexStatus !== '?') {
        staged.push(filename)
      }

      // Unstaged files (working tree has changes)
      // Note: workTreeStatus can be M, D, A, etc. for modifications
      if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
        unstaged.push(filename)
      }

      // Untracked files
      if (indexStatus === '?' && workTreeStatus === '?') {
        untracked.push(filename)
      }

      // Ignored files (!!)
      if (indexStatus === '!' && workTreeStatus === '!') {
        ignored.push(filename)
      }
    }

    return {
      branch,
      staged,
      unstaged,
      untracked,
      ignored,
    }
  }

  /**
   * Generate a descriptive commit message with context.
   *
   * This helper method creates standardized commit messages for content operations.
   * Format: "{operation} {contentType} entry {id}"
   *
   * Examples:
   * - "Create article entry abc123"
   * - "Update user entry xyz789"
   * - "Delete product entry def456"
   *
   * @param operation - The operation type (create, update, delete)
   * @param contentType - The content type being modified
   * @param id - The entry ID
   * @returns Formatted commit message
   */
  generateCommitMessage(
    operation: 'create' | 'update' | 'delete' | 'publish' | 'unpublish',
    contentType: string,
    id: number | string
  ): string {
    const operationLabel = operation.charAt(0).toUpperCase() + operation.slice(1)
    return `${operationLabel} ${contentType} entry ${id}`
  }

  /**
   * Create a new Git branch.
   *
   * @param name - Name of the new branch
   * @param from - Optional base branch (defaults to current branch)
   * @returns Promise that resolves when branch is created
   * @throws Error if branch already exists or creation fails
   */
  async createBranch(name: string, from?: string): Promise<void> {
    if (!name || name.trim().length === 0) {
      throw new Error('Branch name required')
    }

    const args = ['branch', name]
    if (from) {
      args.push(from)
    }

    await this.execGit(args)
  }

  /**
   * Switch to a different branch.
   *
   * @param name - Name of the branch to switch to
   * @returns Promise that resolves when branch is switched
   * @throws Error if branch doesn't exist or switch fails
   */
  async switchBranch(name: string): Promise<void> {
    if (!name || name.trim().length === 0) {
      throw new Error('Branch name required')
    }

    await this.execGit(['checkout', name])
  }

  /**
   * Get the current branch name.
   *
   * @returns Promise resolving to current branch name
   * @throws Error if command fails
   */
  async getCurrentBranch(): Promise<string> {
    const output = await this.execGit(['branch', '--show-current'])
    return output.trim()
  }

  /**
   * List all branches in the repository.
   *
   * @returns Promise resolving to array of branch names
   * @throws Error if command fails
   */
  async listBranches(): Promise<string[]> {
    const output = await this.execGit(['branch', '--list'])
    
    // Parse branch list output
    // Format: "  branch-name" or "* current-branch"
    const branches = output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => line.replace(/^\*\s+/, '')) // Remove asterisk from current branch
    
    return branches
  }

  /**
   * Merge a source branch into a target branch.
   *
   * @param source - Source branch to merge from
   * @param target - Target branch to merge into
   * @returns Promise resolving to MergeResult
   */
  async mergeBranch(source: string, target: string): Promise<MergeResult> {
    if (!source || source.trim().length === 0) {
      throw new Error('Source branch required')
    }
    if (!target || target.trim().length === 0) {
      throw new Error('Target branch required')
    }

    try {
      // Switch to target branch
      await this.switchBranch(target)

      // Attempt merge
      const output = await this.execGit(['merge', source])

      // Extract commit hash if merge created a commit
      const hashMatch = output.match(/Merge made by .+ ([a-f0-9]+)/)
      const hash = hashMatch ? hashMatch[1] : undefined

      return {
        success: true,
        hash,
      }
    } catch (error) {
      // Check for merge conflicts
      const status = await this.getStatus()
      
      if (status.unstaged.length > 0 || status.staged.length > 0) {
        // There are conflicts
        const conflicts = [...status.unstaged, ...status.staged]
        
        return {
          success: false,
          conflicts,
        }
      }

      // Other error
      throw error
    }
  }

  /**
   * Get commit history for a file or the entire repository.
   *
   * @param path - Optional file path to filter history
   * @param limit - Optional limit on number of commits to return
   * @returns Promise resolving to array of GitCommit objects
   * @throws Error if command fails
   */
  async getHistory(path?: string, limit?: number): Promise<GitCommit[]> {
    const args = [
      'log',
      '--format=%H%n%an%n%ae%n%at%n%s%n%x00', // Custom format with null separator
    ]

    if (limit) {
      args.push(`-${limit}`)
    }

    if (path) {
      args.push('--', path)
    }

    const output = await this.execGit(args)
    
    if (!output.trim()) {
      return []
    }

    // Parse the output
    const commits: GitCommit[] = []
    const commitBlocks = output.split('\x00').filter(block => block.trim())

    for (const block of commitBlocks) {
      const lines = block.trim().split('\n')
      if (lines.length < 5) continue

      const hash = lines[0]
      const authorName = lines[1]
      const authorEmail = lines[2]
      const timestamp = parseInt(lines[3], 10)
      const message = lines[4]

      // Get files changed in this commit
      const filesOutput = await this.execGit([
        'diff-tree',
        '--no-commit-id',
        '--name-only',
        '-r',
        hash,
      ])
      const files = filesOutput
        .split('\n')
        .map(f => f.trim())
        .filter(f => f.length > 0)

      commits.push({
        hash,
        author: {
          name: authorName,
          email: authorEmail,
        },
        date: new Date(timestamp * 1000),
        message,
        files,
      })
    }

    return commits
  }

  /**
   * Get details of a specific commit.
   *
   * @param hash - Commit hash
   * @returns Promise resolving to GitCommit object
   * @throws Error if commit doesn't exist or command fails
   */
  async getCommit(hash: string): Promise<GitCommit> {
    if (!hash || hash.trim().length === 0) {
      throw new Error('Commit hash required')
    }

    const output = await this.execGit([
      'show',
      '--format=%H%n%an%n%ae%n%at%n%s',
      '--no-patch',
      hash,
    ])

    const lines = output.trim().split('\n')
    if (lines.length < 5) {
      throw new Error(`Invalid commit: ${hash}`)
    }

    const commitHash = lines[0]
    const authorName = lines[1]
    const authorEmail = lines[2]
    const timestamp = parseInt(lines[3], 10)
    const message = lines[4]

    // Get files changed in this commit
    const filesOutput = await this.execGit([
      'diff-tree',
      '--no-commit-id',
      '--name-only',
      '-r',
      hash,
    ])
    const files = filesOutput
      .split('\n')
      .map(f => f.trim())
      .filter(f => f.length > 0)

    return {
      hash: commitHash,
      author: {
        name: authorName,
        email: authorEmail,
      },
      date: new Date(timestamp * 1000),
      message,
      files,
    }
  }

  /**
   * Get diff between two commits.
   *
   * @param hash1 - First commit hash
   * @param hash2 - Second commit hash
   * @returns Promise resolving to GitDiff object
   * @throws Error if commits don't exist or command fails
   */
  async getDiff(hash1: string, hash2: string): Promise<GitDiff> {
    if (!hash1 || hash1.trim().length === 0) {
      throw new Error('First commit hash required')
    }
    if (!hash2 || hash2.trim().length === 0) {
      throw new Error('Second commit hash required')
    }

    // Get diff stats
    const output = await this.execGit([
      'diff',
      '--numstat',
      hash1,
      hash2,
    ])

    const files: FileDiff[] = []

    if (output.trim()) {
      const lines = output.trim().split('\n')

      for (const line of lines) {
        const parts = line.split('\t')
        if (parts.length < 3) continue

        const additions = parseInt(parts[0], 10) || 0
        const deletions = parseInt(parts[1], 10) || 0
        const path = parts[2]

        // Determine status
        let status: 'added' | 'modified' | 'deleted'
        if (deletions === 0 && additions > 0) {
          status = 'added'
        } else if (additions === 0 && deletions > 0) {
          status = 'deleted'
        } else {
          status = 'modified'
        }

        files.push({
          path,
          status,
          additions,
          deletions,
        })
      }
    }

    return { files }
  }

  /**
   * Restore a file from a specific commit.
   *
   * @param path - File path to restore
   * @param hash - Commit hash to restore from
   * @returns Promise that resolves when file is restored
   * @throws Error if file or commit doesn't exist or restore fails
   */
  async restoreFile(path: string, hash: string): Promise<void> {
    if (!path || path.trim().length === 0) {
      throw new Error('File path required')
    }
    if (!hash || hash.trim().length === 0) {
      throw new Error('Commit hash required')
    }

    await this.execGit(['checkout', hash, '--', path])
  }

  /**
   * Revert a commit by creating a new commit that undoes the changes.
   *
   * @param hash - Commit hash to revert
   * @returns Promise resolving to the new revert commit hash
   * @throws Error if commit doesn't exist or revert fails
   */
  async revertCommit(hash: string): Promise<string> {
    if (!hash || hash.trim().length === 0) {
      throw new Error('Commit hash required')
    }

    // Revert the commit (creates a new commit)
    const output = await this.execGit(['revert', '--no-edit', hash])

    // Extract the new commit hash
    const hashMatch = output.match(/\[.+?\s+([a-f0-9]+)\]/)
    if (!hashMatch) {
      throw new Error('Failed to extract revert commit hash')
    }

    return hashMatch[1]
  }

  /**
   * Check if the working directory is clean (no uncommitted changes).
   *
   * @returns Promise resolving to true if clean, false otherwise
   */
  async isClean(): Promise<boolean> {
    const status = await this.getStatus()
    return (
      status.staged.length === 0 &&
      status.unstaged.length === 0 &&
      status.untracked.length === 0
    )
  }
}
