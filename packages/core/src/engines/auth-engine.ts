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
  private saltRounds = 10

  constructor(
    basePath: string,
    private readonly rbacEngine: RBACEngine
  ) {
    this.usersPath = join(basePath, '.cms', 'users')
  }

  /**
   * Initialize AuthEngine - ensure users directory exists
   */
  async init(): Promise<void> {
    await fs.mkdir(this.usersPath, { recursive: true })

    // Cleanup old unified tokens file and tokens directory if they exist
    const basePath = join(this.usersPath, '..')
    await fs.unlink(join(basePath, 'refresh-tokens.json')).catch(() => { })
    await fs.rm(join(basePath, 'tokens'), { recursive: true, force: true }).catch(() => { })
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
      updatedAt: new Date().toISOString(),
      refreshTokens: []
    }

    // Save user to file
    const userFilePath = join(this.usersPath, `${userId}.json`)
    await fs.writeFile(userFilePath, JSON.stringify(newUser, null, 2), 'utf-8')

    // Assign role in RBACEngine
    await this.rbacEngine.assignRole(userId, newUser.role)

    // Return user without password
    const { password, refreshTokens, ...userWithoutPassword } = newUser
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

    const { password: _, refreshTokens: __, ...userWithoutPassword } = user
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
      
      const { password, refreshTokens, ...userWithoutPassword } = user
      return userWithoutPassword
    } catch {
      return null
    }
  }

  /**
   * Internal helper to load full user object (including password and tokens)
   */
  private async getFullUser(userId: string): Promise<(User & { password?: string }) | null> {
    try {
      const userFilePath = join(this.usersPath, `${userId}.json`)
      const content = await fs.readFile(userFilePath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return null
    }
  }

  /**
   * Internal helper to save full user object
   */
  private async saveUser(user: User & { password?: string }): Promise<void> {
    // Prune expired tokens before save
    const now = new Date()
    user.refreshTokens = (user.refreshTokens || []).filter(t => new Date(t.expiresAt) > now)

    const userFilePath = join(this.usersPath, `${user.id}.json`)
    await fs.writeFile(userFilePath, JSON.stringify(user, null, 2), 'utf-8')
  }

  /**
   * List all users (without passwords or tokens)
   */
  async listUsers(): Promise<User[]> {
    const internalUsers = await this.listUsersInternal()
    return internalUsers.map(({ password, refreshTokens, ...user }) => user)
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
    const user = await this.getFullUser(userId)
    if (!user) throw new Error('User not found')

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

    await this.saveUser(user)

    const { password, refreshTokens, ...userWithoutPassword } = user
    return userWithoutPassword
  }

  /**
   * Delete a user
   */
  async deleteUser(userId: string): Promise<void> {
    const user = await this.getFullUser(userId)
    if (!user) return

    // Prevent deletion of super admin users
    if (this.rbacEngine.isSuperAdmin(user.role)) {
      throw new Error('Cannot delete a Super Admin user')
    }

    const userFilePath = join(this.usersPath, `${userId}.json`)
    await fs.unlink(userFilePath)
    
    // Cleanup roles
    const rbacConfig = await (this.rbacEngine as any).loadConfig()
    const userRoleIds = rbacConfig.userRoles?.[userId] || []
    for (const roleId of userRoleIds) {
      await this.rbacEngine.revokeRole(userId, roleId).catch(() => {})
    }
  }

  /**
   * Generate a new refresh token and append to User storage
   * Returns a combined "userId:token" string for efficient lookup
   */
  async generateRefreshToken(userId: string, ip: string = 'unknown'): Promise<string> {
    const user = await this.getFullUser(userId)
    if (!user) throw new Error('User not found')

    const tokenSecret = randomBytes(32).toString('hex')
    const combinedToken = `${userId}:${tokenSecret}`

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30) // 30 days expiry

    const newRefreshToken: RefreshToken = {
      token: combinedToken,
      userId,
      expiresAt: expiresAt.toISOString(),
      createdByIp: ip
    }

    // Replace all previous tokens — one active session per user
    user.refreshTokens = [newRefreshToken]

    await this.saveUser(user)

    return combinedToken
  }

  /**
   * Validate and rotate a refresh token within the User object
   */
  async rotateRefreshToken(combinedToken: string, ip: string = 'unknown'): Promise<{ userId: string; newToken: string }> {
    const [userId, _] = combinedToken.split(':')
    if (!userId) throw new Error('Invalid refresh token format')

    const user = await this.getFullUser(userId)
    if (!user || !user.refreshTokens) {
      throw new Error('Refresh token not found')
    }

    const tokenIndex = user.refreshTokens.findIndex(t => t.token === combinedToken)
    if (tokenIndex === -1) {
      throw new Error('Refresh token not found')
    }

    const entry = user.refreshTokens[tokenIndex]

    if (entry.revokedAt) {
      // Possible token reuse attack - clear all tokens for safety
      user.refreshTokens = []
      await this.saveUser(user)
      throw new Error('Refresh token has been revoked')
    }

    if (new Date(entry.expiresAt) < new Date()) {
      user.refreshTokens.splice(tokenIndex, 1)
      await this.saveUser(user)
      throw new Error('Refresh token has expired')
    }

    // Remove old token
    user.refreshTokens.splice(tokenIndex, 1)

    // Generate new one
    const newToken = await this.generateRefreshToken(userId, ip)

    // saveUser already called in generateRefreshToken

    return { userId, newToken }
  }

  /**
   * Revoke a refresh token (on logout)
   */
  async revokeRefreshToken(combinedToken: string): Promise<void> {
    const [userId, _] = combinedToken.split(':')
    if (!userId) return

    const user = await this.getFullUser(userId)
    if (!user || !user.refreshTokens) return

    user.refreshTokens = user.refreshTokens.filter(t => t.token !== combinedToken)
    await this.saveUser(user)
  }

  /**
   * List active refresh tokens for a user
   */
  async listUserRefreshTokens(userId: string): Promise<RefreshToken[]> {
    const user = await this.getFullUser(userId)
    if (!user || !user.refreshTokens) return []

    const now = new Date()
    return user.refreshTokens.filter(t => !t.revokedAt && new Date(t.expiresAt) > now)
  }
}
