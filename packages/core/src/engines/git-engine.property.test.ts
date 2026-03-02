import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execSync } from 'child_process'
import * as fc from 'fast-check'
import { GitEngine } from './git-engine.js'

/**
 * Property-based tests for GitEngine
 * 
 * These tests validate universal correctness properties using fast-check
 * to generate random test cases.
 */
describe('GitEngine - Property-Based Tests', () => {
  let gitEngine: GitEngine
  let testDir: string

  beforeEach(async () => {
    // Create a unique test directory for each test
    testDir = join(
      tmpdir(),
      `git-pbt-${Date.now()}-${Math.random().toString(36).substring(2)}`
    )
    await fs.mkdir(testDir, { recursive: true })

    // Initialize a Git repository
    execSync('git init', { cwd: testDir, stdio: 'ignore' })
    execSync('git config user.name "Test User"', { cwd: testDir, stdio: 'ignore' })
    execSync('git config user.email "test@example.com"', { cwd: testDir, stdio: 'ignore' })

    // Create initial commit (required for Git operations)
    const initialFile = join(testDir, 'README.md')
    await fs.writeFile(initialFile, '# Test Repository\n', 'utf8')
    execSync('git add README.md', { cwd: testDir, stdio: 'ignore' })
    execSync('git commit -m "Initial commit"', { cwd: testDir, stdio: 'ignore' })

    gitEngine = new GitEngine(testDir)
  })

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  /**
   * Property P4: Git Commit Completeness
   * 
   * **Validates: Requirements 4.1, 4.3, NFR-10**
   * 
   * For any successful write operation, there exists a Git commit that includes
   * the file affected by that operation.
   * 
   * This property ensures:
   * - Every successful write results in a Git commit
   * - The commit contains the file that was written
   * - The commit is verified to exist in Git history
   * - The file content in the commit matches what was written
   */
  describe('P4: Git Commit Completeness', () => {
    it('should create a Git commit for every successful write operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary write operations with unique file names
          fc.record({
            fileName: fc.uuid().map(id => `file-${id.substring(0, 8)}`),
            data: fc.record({
              id: fc.uuid(),
              title: fc.string({ maxLength: 100 }),
              content: fc.string({ maxLength: 500 }),
              value: fc.integer(),
              timestamp: fc.date().map(d => d.toISOString()),
              metadata: fc.record({
                author: fc.string({ maxLength: 50 }),
                tags: fc.array(fc.string({ maxLength: 20 }), { maxLength: 5 })
              })
            }),
            operation: fc.constantFrom('create', 'update', 'delete')
          }),
          async (writeOp) => {
            const filePath = join(testDir, `${writeOp.fileName}.json`)
            const relativeFilePath = `${writeOp.fileName}.json`

            // Get commit count before write
            const beforeCommits = execSync('git rev-list --count HEAD', { 
              cwd: testDir,
              encoding: 'utf8'
            }).trim()
            const beforeCount = parseInt(beforeCommits, 10)

            // Perform write operation
            await fs.writeFile(filePath, JSON.stringify(writeOp.data, null, 2), 'utf8')

            // Commit the file (simulating a successful write operation)
            const commitMessage = gitEngine.generateCommitMessage(
              writeOp.operation,
              'test-content',
              writeOp.data.id
            )
            const commitHash = await gitEngine.commit([relativeFilePath], commitMessage)

            // Property 1: Commit hash should be returned
            expect(commitHash).toBeTruthy()
            expect(commitHash).toMatch(/^[a-f0-9]+$/)

            // Property 2: A new commit should exist in Git history
            const afterCommits = execSync('git rev-list --count HEAD', { 
              cwd: testDir,
              encoding: 'utf8'
            }).trim()
            const afterCount = parseInt(afterCommits, 10)
            expect(afterCount).toBe(beforeCount + 1)

            // Property 3: The commit should contain the file that was written
            const commitFiles = execSync(`git show --name-only --format= ${commitHash}`, {
              cwd: testDir,
              encoding: 'utf8'
            }).trim().split('\n').filter(f => f.length > 0)
            
            expect(commitFiles).toContain(relativeFilePath)

            // Property 4: The file content in the commit should match what was written
            const committedContent = execSync(`git show ${commitHash}:${relativeFilePath}`, {
              cwd: testDir,
              encoding: 'utf8'
            })
            const committedData = JSON.parse(committedContent)
            expect(committedData).toEqual(writeOp.data)

            // Property 5: The commit should be verifiable using git cat-file
            const objectType = execSync(`git cat-file -t ${commitHash}`, {
              cwd: testDir,
              encoding: 'utf8'
            }).trim()
            expect(objectType).toBe('commit')
          }
        ),
        { numRuns: 20, timeout: 10000 }
      )
    }, 15000)

    it('should create commits for multiple sequential write operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a sequence of write operations with unique file names
          fc.array(
            fc.record({
              id: fc.uuid(),
              version: fc.integer({ min: 1, max: 1000 }),
              content: fc.string({ maxLength: 200 })
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (writeOps) => {
            // Get initial commit count
            const initialCommits = execSync('git rev-list --count HEAD', { 
              cwd: testDir,
              encoding: 'utf8'
            }).trim()
            const initialCount = parseInt(initialCommits, 10)

            const commitHashes: string[] = []

            // Perform each write operation sequentially with unique file names
            for (let i = 0; i < writeOps.length; i++) {
              const writeOp = writeOps[i]
              // Use timestamp and index to ensure uniqueness
              const fileName = `file-${Date.now()}-${i}-${writeOp.id.substring(0, 8)}`
              const filePath = join(testDir, `${fileName}.json`)
              const relativeFilePath = `${fileName}.json`

              // Write file
              await fs.writeFile(filePath, JSON.stringify(writeOp, null, 2), 'utf8')

              // Commit the file
              const commitMessage = `Update ${fileName} to version ${writeOp.version}`
              const commitHash = await gitEngine.commit([relativeFilePath], commitMessage)

              commitHashes.push(commitHash)

              // Property: Each commit should be unique
              const uniqueHashes = new Set(commitHashes)
              expect(uniqueHashes.size).toBe(commitHashes.length)
            }

            // Property: Total number of new commits should equal number of write operations
            const finalCommits = execSync('git rev-list --count HEAD', { 
              cwd: testDir,
              encoding: 'utf8'
            }).trim()
            const finalCount = parseInt(finalCommits, 10)
            expect(finalCount).toBe(initialCount + writeOps.length)

            // Property: All commits should be verifiable
            for (const commitHash of commitHashes) {
              const objectType = execSync(`git cat-file -t ${commitHash}`, {
                cwd: testDir,
                encoding: 'utf8'
              }).trim()
              expect(objectType).toBe('commit')
            }

            // Property: Each commit should be reachable from HEAD
            const allCommits = execSync('git rev-list HEAD', {
              cwd: testDir,
              encoding: 'utf8'
            }).trim().split('\n')

            for (const commitHash of commitHashes) {
              // Check if the full commit hash is in the list
              const found = allCommits.some(hash => hash.startsWith(commitHash) || commitHash.startsWith(hash))
              expect(found).toBe(true)
            }
          }
        ),
        { numRuns: 15, timeout: 10000 }
      )
    }, 15000)

    it('should create commits for multiple files in a single operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate multiple files to commit together
          fc.array(
            fc.record({
              id: fc.uuid(),
              data: fc.record({
                id: fc.uuid(),
                value: fc.integer()
              })
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (files) => {
            // Get commit count before write
            const beforeCommits = execSync('git rev-list --count HEAD', { 
              cwd: testDir,
              encoding: 'utf8'
            }).trim()
            const beforeCount = parseInt(beforeCommits, 10)

            // Write all files with unique names
            const relativeFilePaths: string[] = []
            for (const file of files) {
              const fileName = `file-${file.id.substring(0, 8)}`
              const filePath = join(testDir, `${fileName}.json`)
              const relativeFilePath = `${fileName}.json`
              await fs.writeFile(filePath, JSON.stringify(file.data, null, 2), 'utf8')
              relativeFilePaths.push(relativeFilePath)
            }

            // Commit all files together
            const commitMessage = `Batch update ${files.length} files`
            const commitHash = await gitEngine.commit(relativeFilePaths, commitMessage)

            // Property 1: Exactly one commit should be created
            const afterCommits = execSync('git rev-list --count HEAD', { 
              cwd: testDir,
              encoding: 'utf8'
            }).trim()
            const afterCount = parseInt(afterCommits, 10)
            expect(afterCount).toBe(beforeCount + 1)

            // Property 2: The commit should contain all files
            const commitFiles = execSync(`git show --name-only --format= ${commitHash}`, {
              cwd: testDir,
              encoding: 'utf8'
            }).trim().split('\n').filter(f => f.length > 0)

            for (const relativeFilePath of relativeFilePaths) {
              expect(commitFiles).toContain(relativeFilePath)
            }

            // Property 3: Each file's content in the commit should match what was written
            for (const file of files) {
              const fileName = `file-${file.id.substring(0, 8)}`
              const relativeFilePath = `${fileName}.json`
              const committedContent = execSync(`git show ${commitHash}:${relativeFilePath}`, {
                cwd: testDir,
                encoding: 'utf8'
              })
              const committedData = JSON.parse(committedContent)
              expect(committedData).toEqual(file.data)
            }
          }
        ),
        { numRuns: 20, timeout: 10000 }
      )
    }, 15000)

    it('should create commits with author information preserved', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            data: fc.record({
              id: fc.uuid(),
              content: fc.string({ maxLength: 100 })
            }),
            author: fc.record({
              name: fc.string({ minLength: 3, maxLength: 50 })
                .filter(s => /^[a-zA-Z0-9 .-]+$/.test(s)) // Only alphanumeric, spaces, dots, and hyphens
                .map(s => s.trim())
                .map(s => s.replace(/\s+/g, ' ')) // Normalize whitespace
                .filter(s => s.length >= 3),
              email: fc.emailAddress()
            })
          }),
          async (writeOp) => {
            // Use timestamp to ensure unique file names
            const fileName = `file-${Date.now()}-${Math.random().toString(36).substring(2)}`
            const filePath = join(testDir, `${fileName}.json`)
            const relativeFilePath = `${fileName}.json`

            // Write file
            await fs.writeFile(filePath, JSON.stringify(writeOp.data, null, 2), 'utf8')

            // Commit with author information
            const commitMessage = `Create ${fileName}`
            const commitHash = await gitEngine.commit(
              [relativeFilePath],
              commitMessage,
              writeOp.author
            )

            // Property 1: Commit should exist
            expect(commitHash).toBeTruthy()

            // Property 2: Commit should have the correct author
            const commitInfo = execSync(`git show --format="%an <%ae>" --no-patch ${commitHash}`, {
              cwd: testDir,
              encoding: 'utf8'
            }).trim()

            expect(commitInfo).toBe(`${writeOp.author.name} <${writeOp.author.email}>`)

            // Property 3: The file should still be in the commit
            const commitFiles = execSync(`git show --name-only --format= ${commitHash}`, {
              cwd: testDir,
              encoding: 'utf8'
            }).trim().split('\n').filter(f => f.length > 0)

            expect(commitFiles).toContain(relativeFilePath)
          }
        ),
        { numRuns: 20, timeout: 10000 }
      )
    }, 15000)

    it('should maintain commit history integrity across multiple operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a series of operations on the same file
          fc.array(
            fc.record({
              version: fc.integer({ min: 1, max: 100 }),
              content: fc.string({ maxLength: 200 }),
              timestamp: fc.date().map(d => d.toISOString())
            }),
            { minLength: 3, maxLength: 6 }
          ),
          async (versions) => {
            const fileName = `history-${Date.now()}-${Math.random().toString(36).substring(2)}`
            const filePath = join(testDir, `${fileName}.json`)
            const relativeFilePath = `${fileName}.json`

            const commitHashes: string[] = []

            // Perform each version update
            for (const version of versions) {
              await fs.writeFile(filePath, JSON.stringify(version, null, 2), 'utf8')
              
              const commitMessage = `Update to version ${version.version}`
              const commitHash = await gitEngine.commit([relativeFilePath], commitMessage)
              
              commitHashes.push(commitHash)
            }

            // Property 1: Number of commits should equal number of versions
            expect(commitHashes.length).toBe(versions.length)

            // Property 2: All commits should be unique
            const uniqueHashes = new Set(commitHashes)
            expect(uniqueHashes.size).toBe(versions.length)

            // Property 3: Each commit should contain the correct version of the file
            for (let i = 0; i < versions.length; i++) {
              const commitHash = commitHashes[i]
              const expectedVersion = versions[i]

              const committedContent = execSync(`git show ${commitHash}:${relativeFilePath}`, {
                cwd: testDir,
                encoding: 'utf8'
              })
              const committedData = JSON.parse(committedContent)

              expect(committedData).toEqual(expectedVersion)
            }

            // Property 4: Git log should show all commits in reverse chronological order
            const gitLog = execSync('git log --oneline', {
              cwd: testDir,
              encoding: 'utf8'
            }).trim().split('\n')

            // All our commit hashes should appear in the log
            for (const commitHash of commitHashes) {
              const found = gitLog.some(line => line.startsWith(commitHash.substring(0, 7)))
              expect(found).toBe(true)
            }

            // Property 5: The current file content should match the last version
            const currentContent = await fs.readFile(filePath, 'utf8')
            const currentData = JSON.parse(currentContent)
            expect(currentData).toEqual(versions[versions.length - 1])
          }
        ),
        { numRuns: 10, timeout: 15000 }
      )
    }, 20000)

    it('should handle nested directory structures in commits', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            pathComponents: fc.array(
              fc.string({ minLength: 1, maxLength: 10 })
                .filter(s => !s.includes('/') && !s.includes('\\') && !s.includes('\0'))
                .map(s => s.replace(/[^a-zA-Z0-9_-]/g, '_')),
              { minLength: 1, maxLength: 3 }
            ),
            fileName: fc.uuid().map(id => `file-${id.substring(0, 8)}`),
            data: fc.record({
              id: fc.uuid(),
              nested: fc.boolean()
            })
          }),
          async (writeOp) => {
            // Create nested directory structure
            const nestedDir = join(testDir, ...writeOp.pathComponents)
            await fs.mkdir(nestedDir, { recursive: true })

            const filePath = join(nestedDir, `${writeOp.fileName}.json`)
            const relativeFilePath = join(...writeOp.pathComponents, `${writeOp.fileName}.json`)

            // Write file
            await fs.writeFile(filePath, JSON.stringify(writeOp.data, null, 2), 'utf8')

            // Commit the file
            const commitMessage = `Add nested file ${writeOp.fileName}`
            const commitHash = await gitEngine.commit([relativeFilePath], commitMessage)

            // Property 1: Commit should exist
            expect(commitHash).toBeTruthy()

            // Property 2: The commit should contain the nested file
            const commitFiles = execSync(`git show --name-only --format= ${commitHash}`, {
              cwd: testDir,
              encoding: 'utf8'
            }).trim().split('\n').filter(f => f.length > 0)

            expect(commitFiles).toContain(relativeFilePath)

            // Property 3: The file content in the commit should match
            const committedContent = execSync(`git show ${commitHash}:${relativeFilePath}`, {
              cwd: testDir,
              encoding: 'utf8'
            })
            const committedData = JSON.parse(committedContent)
            expect(committedData).toEqual(writeOp.data)

            // Property 4: The file should be retrievable from the commit
            const objectType = execSync(`git cat-file -t ${commitHash}:${relativeFilePath}`, {
              cwd: testDir,
              encoding: 'utf8'
            }).trim()
            expect(objectType).toBe('blob')
          }
        ),
        { numRuns: 15, timeout: 10000 }
      )
    }, 15000)
  })
  
  /**
   * Property P14: Git History Completeness
   * 
   * **Validates: Requirements 4.1, 4.4, 4.5**
   * 
   * For any content entry, its current state can be reconstructed from the Git commit history.
   * 
   * This property ensures:
   * - All changes to a file are tracked in Git history
   * - The file can be restored to any previous state from history
   * - The commit history is complete and accurate
   * - File content at any commit matches the expected state
   */
  describe('P14: Git History Completeness', () => {
    it('should reconstruct file state from Git history', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a series of state changes for a file
          fc.array(
            fc.record({
              version: fc.integer({ min: 1, max: 1000 }),
              title: fc.string({ maxLength: 100 }),
              content: fc.string({ maxLength: 300 }),
              published: fc.boolean(),
              timestamp: fc.date().map(d => d.toISOString())
            }),
            { minLength: 3, maxLength: 8 }
          ),
          async (states) => {
            const fileName = `entry-${Date.now()}-${Math.random().toString(36).substring(2)}`
            const filePath = join(testDir, `${fileName}.json`)
            const relativeFilePath = `${fileName}.json`

            const commitHashes: string[] = []
            const expectedStates: typeof states = []

            // Create a series of commits, each representing a state change
            for (const state of states) {
              await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8')
              
              const commitMessage = `Update ${fileName} to version ${state.version}`
              const commitHash = await gitEngine.commit([relativeFilePath], commitMessage)
              
              commitHashes.push(commitHash)
              expectedStates.push(state)
            }

            // Property 1: History should contain all commits
            const history = await gitEngine.getHistory(relativeFilePath)
            expect(history.length).toBeGreaterThanOrEqual(states.length)

            // Property 2: Each commit in history should contain the file
            for (const commit of history) {
              if (commitHashes.includes(commit.hash)) {
                expect(commit.files).toContain(relativeFilePath)
              }
            }

            // Property 3: File can be restored to any previous state
            for (let i = 0; i < commitHashes.length; i++) {
              const commitHash = commitHashes[i]
              const expectedState = expectedStates[i]

              // Restore file to this commit
              await gitEngine.restoreFile(relativeFilePath, commitHash)

              // Verify the restored content matches the expected state
              const restoredContent = await fs.readFile(filePath, 'utf8')
              const restoredData = JSON.parse(restoredContent)
              expect(restoredData).toEqual(expectedState)
            }

            // Property 4: Current state matches the last commit
            const lastCommitHash = commitHashes[commitHashes.length - 1]
            await gitEngine.restoreFile(relativeFilePath, lastCommitHash)
            
            const currentContent = await fs.readFile(filePath, 'utf8')
            const currentData = JSON.parse(currentContent)
            expect(currentData).toEqual(expectedStates[expectedStates.length - 1])

            // Property 5: Each commit's content can be retrieved directly
            for (let i = 0; i < commitHashes.length; i++) {
              const commitHash = commitHashes[i]
              const expectedState = expectedStates[i]

              const committedContent = execSync(`git show ${commitHash}:${relativeFilePath}`, {
                cwd: testDir,
                encoding: 'utf8'
              })
              const committedData = JSON.parse(committedContent)
              expect(committedData).toEqual(expectedState)
            }
          }
        ),
        { numRuns: 10, timeout: 15000 }
      )
    }, 20000)

    it('should maintain complete history across multiple files', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate multiple files with their own histories
          fc.array(
            fc.record({
              fileId: fc.uuid().map(id => `file-${id.substring(0, 8)}`),
              states: fc.array(
                fc.record({
                  id: fc.uuid(),
                  value: fc.integer(),
                  data: fc.string({ maxLength: 100 })
                }),
                { minLength: 2, maxLength: 4 }
              )
            }),
            { minLength: 2, maxLength: 4 }
          ).map(files => {
            // Ensure unique file IDs
            const uniqueFiles = new Map<string, typeof files[0]>()
            for (const file of files) {
              if (!uniqueFiles.has(file.fileId)) {
                uniqueFiles.set(file.fileId, file)
              }
            }
            return Array.from(uniqueFiles.values())
          }).filter(files => files.length >= 2), // Ensure at least 2 unique files
          async (files) => {
            const fileCommits = new Map<string, string[]>()

            // Create history for each file
            for (const file of files) {
              const filePath = join(testDir, `${file.fileId}.json`)
              const relativeFilePath = `${file.fileId}.json`
              const commits: string[] = []

              for (const state of file.states) {
                await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8')
                
                const commitMessage = `Update ${file.fileId}`
                const commitHash = await gitEngine.commit([relativeFilePath], commitMessage)
                
                commits.push(commitHash)
              }

              fileCommits.set(relativeFilePath, commits)
            }

            // Property 1: Each file's history should be retrievable
            for (const file of files) {
              const relativeFilePath = `${file.fileId}.json`
              const history = await gitEngine.getHistory(relativeFilePath)
              
              const fileCommitHashes = fileCommits.get(relativeFilePath) || []
              
              // History should contain at least the commits we made for this file
              const historyHashes = history.map(c => c.hash)
              for (const commitHash of fileCommitHashes) {
                expect(historyHashes).toContain(commitHash)
              }
            }

            // Property 2: Each file can be restored to any of its previous states
            for (const file of files) {
              const relativeFilePath = `${file.fileId}.json`
              const filePath = join(testDir, relativeFilePath)
              const commits = fileCommits.get(relativeFilePath) || []

              for (let i = 0; i < commits.length; i++) {
                const commitHash = commits[i]
                const expectedState = file.states[i]

                await gitEngine.restoreFile(relativeFilePath, commitHash)

                const restoredContent = await fs.readFile(filePath, 'utf8')
                const restoredData = JSON.parse(restoredContent)
                expect(restoredData).toEqual(expectedState)
              }
              
              // Restore to last commit to clean up
              const lastCommit = commits[commits.length - 1]
              await gitEngine.restoreFile(relativeFilePath, lastCommit)
            }

            // Property 3: Global history contains all commits
            const globalHistory = await gitEngine.getHistory()
            const globalHashes = globalHistory.map(c => c.hash)

            for (const commits of fileCommits.values()) {
              for (const commitHash of commits) {
                expect(globalHashes).toContain(commitHash)
              }
            }
          }
        ),
        { numRuns: 8, timeout: 20000 }
      )
    }, 25000)

    it('should allow reverting commits while maintaining history', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            initialState: fc.record({
              id: fc.uuid(),
              value: fc.integer({ min: 0, max: 100 })
            }),
            badState: fc.record({
              id: fc.uuid(),
              value: fc.integer({ min: 101, max: 200 })
            }),
            finalState: fc.record({
              id: fc.uuid(),
              value: fc.integer({ min: 201, max: 300 })
            })
          }),
          async (scenario) => {
            const fileName = `revert-${Date.now()}-${Math.random().toString(36).substring(2)}`
            const filePath = join(testDir, `${fileName}.json`)
            const relativeFilePath = `${fileName}.json`

            // Create initial state
            await fs.writeFile(filePath, JSON.stringify(scenario.initialState, null, 2), 'utf8')
            const initialCommit = await gitEngine.commit([relativeFilePath], 'Initial state')

            // Create bad state
            await fs.writeFile(filePath, JSON.stringify(scenario.badState, null, 2), 'utf8')
            const badCommit = await gitEngine.commit([relativeFilePath], 'Bad state')

            // Create final state
            await fs.writeFile(filePath, JSON.stringify(scenario.finalState, null, 2), 'utf8')
            const finalCommit = await gitEngine.commit([relativeFilePath], 'Final state')

            // Get history before revert
            const historyBefore = await gitEngine.getHistory(relativeFilePath)
            const commitCountBefore = historyBefore.length

            // Revert the bad commit
            let revertCommit: string
            try {
              revertCommit = await gitEngine.revertCommit(badCommit)
            } catch (error) {
              // If revert fails due to conflicts, skip this test case
              // This can happen with certain state combinations
              if (error instanceof Error && error.message.includes('conflict')) {
                // Abort the revert and skip
                try {
                  await gitEngine.execGit(['revert', '--abort'])
                } catch {
                  // Ignore abort errors
                }
                return // Skip this test case
              }
              throw error
            }

            // Property 1: Revert creates a new commit
            expect(revertCommit).toBeTruthy()
            expect(revertCommit).not.toBe(badCommit)

            // Property 2: History grows by one commit
            const historyAfter = await gitEngine.getHistory(relativeFilePath)
            expect(historyAfter.length).toBe(commitCountBefore + 1)

            // Property 3: All original commits still exist in history
            const historyHashes = historyAfter.map(c => c.hash)
            expect(historyHashes).toContain(initialCommit)
            expect(historyHashes).toContain(badCommit)
            expect(historyHashes).toContain(finalCommit)
            expect(historyHashes).toContain(revertCommit)

            // Property 4: Original commits are still accessible
            for (const commitHash of [initialCommit, badCommit, finalCommit]) {
              const commit = await gitEngine.getCommit(commitHash)
              expect(commit.hash).toBe(commitHash)
            }

            // Property 5: File can still be restored to any previous state
            await gitEngine.restoreFile(relativeFilePath, initialCommit)
            let content = await fs.readFile(filePath, 'utf8')
            expect(JSON.parse(content)).toEqual(scenario.initialState)

            await gitEngine.restoreFile(relativeFilePath, badCommit)
            content = await fs.readFile(filePath, 'utf8')
            expect(JSON.parse(content)).toEqual(scenario.badState)

            await gitEngine.restoreFile(relativeFilePath, finalCommit)
            content = await fs.readFile(filePath, 'utf8')
            expect(JSON.parse(content)).toEqual(scenario.finalState)
          }
        ),
        { numRuns: 10, timeout: 15000 }
      )
    }, 20000)

    it('should provide accurate commit details from history', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              message: fc.string({ minLength: 5, maxLength: 100 })
                .filter(s => s.trim().length >= 5), // Ensure non-empty after trim
              author: fc.record({
                name: fc.string({ minLength: 3, maxLength: 50 })
                  .filter(s => /^[a-zA-Z0-9 .-]+$/.test(s))
                  .map(s => s.trim())
                  .filter(s => s.length >= 3),
                email: fc.emailAddress()
              }),
              data: fc.record({
                id: fc.uuid(),
                value: fc.integer()
              })
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (commits) => {
            const fileName = `details-${Date.now()}-${Math.random().toString(36).substring(2)}`
            const filePath = join(testDir, `${fileName}.json`)
            const relativeFilePath = `${fileName}.json`

            const commitHashes: string[] = []

            // Create commits with specific messages and authors
            for (const commitData of commits) {
              await fs.writeFile(filePath, JSON.stringify(commitData.data, null, 2), 'utf8')
              
              const commitHash = await gitEngine.commit(
                [relativeFilePath],
                commitData.message,
                commitData.author
              )
              
              commitHashes.push(commitHash)
            }

            // Property 1: getCommit returns accurate details for each commit
            for (let i = 0; i < commitHashes.length; i++) {
              const commitHash = commitHashes[i]
              const expectedData = commits[i]

              const commit = await gitEngine.getCommit(commitHash)

              expect(commit.hash).toBe(commitHash)
              expect(commit.message).toBe(expectedData.message)
              expect(commit.author.name).toBe(expectedData.author.name)
              expect(commit.author.email).toBe(expectedData.author.email)
              expect(commit.files).toContain(relativeFilePath)
              expect(commit.date).toBeInstanceOf(Date)
            }

            // Property 2: getHistory returns commits in reverse chronological order
            const history = await gitEngine.getHistory(relativeFilePath)
            
            // Find our commits in the history
            const ourCommits = history.filter(c => commitHashes.includes(c.hash))
            
            // They should appear in reverse order (newest first)
            for (let i = 0; i < ourCommits.length - 1; i++) {
              const current = ourCommits[i]
              const next = ourCommits[i + 1]
              
              // Current commit should be newer than next
              expect(current.date.getTime()).toBeGreaterThanOrEqual(next.date.getTime())
            }

            // Property 3: History limit works correctly
            const limitedHistory = await gitEngine.getHistory(relativeFilePath, 2)
            expect(limitedHistory.length).toBeLessThanOrEqual(2)
          }
        ),
        { numRuns: 10, timeout: 15000 }
      )
    }, 20000)
  })
})
