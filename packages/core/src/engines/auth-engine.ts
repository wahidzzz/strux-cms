/**
 * Auth Engine - User Authentication and Management
 * 
 * Handles:
 * - User persistence in .cms/users/
 * - Secure password hashing with bcrypt
 * - Authentication logic (login/verify)
 * - User registration and role assignment
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import type { User, RefreshToken } from '../types/index.js'
import { RBACEngine } from './rbac-engine.js'

export class AuthEngine {
  private usersPath: string
  private refreshTokensPath: string
  private saltRounds = 10

  constructor(
    basePath: string,
    private readonly rbacEngine: RBACEngine
  ) {
    this.usersPath = join(basePath, '.cms', 'users')
    this.refreshTokensPath = join(basePath, '.cms', 'refresh-tokens.json')
  }

  /**
   * Initialize AuthEngine - ensure users directory exists
   */
  async init(): Promise<void> {
    await fs.mkdir(this.usersPath, { recursive: true })
  }

  /**
   * Register a new user
   */
  async register(userData: Omit<User, 'id'> & { password?: string }): Promise<User> {
    // Check if user already exists (by email or username)
    const existingUsers = await this.listUsers()
    const isConflict = existingUsers.some(
      u => u.email === userData.email || u.username === userData.username
    )

    if (isConflict) {
      throw new Error('User with this email or username already exists')
    }

    // Auto-assign super_admin to the very first user in the system
    let userRole = userData.role || this.rbacEngine.getDefaultRole()
    if (existingUsers.length === 0) {
      // First user ever — make them super_admin
      userRole = 'super_admin'
      // Ensure super_admin role exists in config
      if (!this.rbacEngine.getRole('super_admin')) {
        // Trigger default config creation which includes super_admin
        await this.rbacEngine.createDefaultConfig()
      }
    }

    // Generate unique ID
    const userId = userData.username.toLowerCase().replace(/[^a-z0-p]/g, '-') + '-' + Math.random().toString(36).substring(2, 7)

    // Hash password if provided
    let hashedPassword = ''
    if (userData.password) {
      hashedPassword = await bcrypt.hash(userData.password, this.saltRounds)
    }

    const newUser: User & { password?: string } = {
      id: userId,
      username: userData.username,
      email: userData.email,
      role: userRole,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // Save user to file
    const userFilePath = join(this.usersPath, `${userId}.json`)
    await fs.writeFile(userFilePath, JSON.stringify(newUser, null, 2), 'utf-8')

    // Assign role in RBACEngine
    await this.rbacEngine.assignRole(userId, newUser.role)

    // Return user without password
    const { password, ...userWithoutPassword } = newUser
    return userWithoutPassword
  }

  /**
   * Authenticate a user by identifier (email/username) and password
   */
  async authenticate(identifier: string, password?: string): Promise<User | null> {
    if (!password) return null

    const users = await this.listUsersInternal()
    const user = users.find(
      u => u.email === identifier || u.username === identifier
    )

    if (!user || !user.password) {
      return null
    }

    const isValid = await bcrypt.compare(password, user.password)
    if (!isValid) {
      return null
    }

    const { password: _, ...userWithoutPassword } = user
    return userWithoutPassword
  }

  /**
   * Get a user by ID
   */
  async getUser(userId: string): Promise<User | null> {
    try {
      const userFilePath = join(this.usersPath, `${userId}.json`)
      const content = await fs.readFile(userFilePath, 'utf-8')
      const user = JSON.parse(content) as User & { password?: string }
      
      const { password, ...userWithoutPassword } = user
      return userWithoutPassword
    } catch {
      return null
    }
  }

  /**
   * List all users (without passwords)
   */
  async listUsers(): Promise<User[]> {
    const internalUsers = await this.listUsersInternal()
    return internalUsers.map(({ password, ...user }) => user)
  }

  /**
   * Internal list users with passwords for authentication
   */
  private async listUsersInternal(): Promise<(User & { password?: string })[]> {
    try {
      const files = await fs.readdir(this.usersPath)
      const users: (User & { password?: string })[] = []

      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.readFile(join(this.usersPath, file), 'utf-8')
          users.push(JSON.parse(content))
        }
      }

      return users
    } catch {
      return []
    }
  }

  /**
   * Update user details or password
   */
  async updateUser(userId: string, updates: Partial<User & { password?: string }>): Promise<User> {
    const userFilePath = join(this.usersPath, `${userId}.json`)
    const existingContent = await fs.readFile(userFilePath, 'utf-8')
    const user = JSON.parse(existingContent) as User & { password?: string }

    // Prevent changing super_admin role
    if (updates.role && updates.role !== user.role && this.rbacEngine.isSuperAdmin(user.role)) {
      throw new Error('Cannot change the role of a Super Admin user')
    }

    if (updates.password) {
      user.password = await bcrypt.hash(updates.password, this.saltRounds)
    }

    if (updates.username) user.username = updates.username
    if (updates.email) user.email = updates.email
    
    if (updates.role && updates.role !== user.role) {
      // Revoke old role and assign new one
      await this.rbacEngine.revokeRole(userId, user.role).catch(() => {})
      user.role = updates.role
      await this.rbacEngine.assignRole(userId, user.role)
    }

    user.updatedAt = new Date().toISOString()

    await fs.writeFile(userFilePath, JSON.stringify(user, null, 2), 'utf-8')

    const { password, ...userWithoutPassword } = user
    return userWithoutPassword
  }

  /**
   * Delete a user
   */
  async deleteUser(userId: string): Promise<void> {
    const userFilePath = join(this.usersPath, `${userId}.json`)

    // Read user to check role
    try {
      const content = await fs.readFile(userFilePath, 'utf-8')
      const user = JSON.parse(content) as User

      // Prevent deletion of super admin users
      if (this.rbacEngine.isSuperAdmin(user.role)) {
        throw new Error('Cannot delete a Super Admin user')
      }
    } catch (error) {
      if ((error as Error).message.includes('Super Admin')) throw error
      // If we can't read the file, proceed with deletion attempt
    }

    await fs.unlink(userFilePath)
    
    // Cleanup roles
    const rbacConfig = await (this.rbacEngine as any).loadConfig()
    const userRoleIds = rbacConfig.userRoles?.[userId] || []
    for (const roleId of userRoleIds) {
      await this.rbacEngine.revokeRole(userId, roleId).catch(() => {})
    }
  }

  /**
   * Load refresh tokens from disk
   */
  private async loadRefreshTokens(): Promise<RefreshToken[]> {
    try {
      const content = await fs.readFile(this.refreshTokensPath, 'utf-8')
      return JSON.parse(content) as RefreshToken[]
    } catch {
      return []
    }
  }

  /**
   * Save refresh tokens back to disk
   */
  private async saveRefreshTokens(tokens: RefreshToken[]): Promise<void> {
    await fs.writeFile(this.refreshTokensPath, JSON.stringify(tokens, null, 2), 'utf-8')
  }

  /**
   * Generate a new refresh token for a user
   */
  async generateRefreshToken(userId: string, ip: string = 'unknown'): Promise<string> {
    const token = `refresh_${randomBytes(32).toString('hex')}`
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30) // 30 days expiry

    const newRefreshToken: RefreshToken = {
      token,
      userId,
      expiresAt: expiresAt.toISOString(),
      createdByIp: ip
    }

    const tokens = await this.loadRefreshTokens()
    tokens.push(newRefreshToken)
    await this.saveRefreshTokens(tokens)

    return token
  }

  /**
   * Validate and rotate a refresh token
   * Returns a new refresh token and the user ID
   */
  async rotateRefreshToken(token: string, ip: string = 'unknown'): Promise<{ userId: string; newToken: string }> {
    const tokens = await this.loadRefreshTokens()
    const index = tokens.findIndex(t => t.token === token)

    if (index === -1) {
      throw new Error('Refresh token not found')
    }

    const entry = tokens[index]

    if (entry.revokedAt) {
      // Possible token reuse attack - revoke all user tokens for safety
      const filtered = tokens.filter(t => t.userId !== entry.userId)
      await this.saveRefreshTokens(filtered)
      throw new Error('Refresh token has been revoked')
    }

    if (new Date(entry.expiresAt) < new Date()) {
      tokens.splice(index, 1)
      await this.saveRefreshTokens(tokens)
      throw new Error('Refresh token has expired')
    }

    // Revoke old token
    entry.revokedAt = new Date().toISOString()

    // Generate new one
    const newToken = await this.generateRefreshToken(entry.userId, ip)

    // Save rotation
    await this.saveRefreshTokens(tokens)

    return { userId: entry.userId, newToken }
  }

  /**
   * Revoke a refresh token (on logout)
   */
  async revokeRefreshToken(token: string): Promise<void> {
    const tokens = await this.loadRefreshTokens()
    const index = tokens.findIndex(t => t.token === token)

    if (index !== -1) {
      tokens.splice(index, 1) // Remove instead of marking revoked for less storage
      await this.saveRefreshTokens(tokens)
    }
  }

  /**
   * List active refresh tokens for a user
   */
  async listUserRefreshTokens(userId: string): Promise<RefreshToken[]> {
    const tokens = await this.loadRefreshTokens()
    return tokens.filter(t => t.userId === userId && !t.revokedAt && new Date(t.expiresAt) > new Date())
  }
}
