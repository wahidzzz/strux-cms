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
import bcrypt from 'bcryptjs'
import type { User } from '../types/index.js'
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
      role: userData.role || this.rbacEngine.getDefaultRole(),
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
    await fs.unlink(userFilePath)
    
    // Cleanup roles
    const userRoleIds = (this.rbacEngine as any).config?.userRoles?.[userId] || []
    for (const roleId of userRoleIds) {
      await this.rbacEngine.revokeRole(userId, roleId).catch(() => {})
    }
  }
}
