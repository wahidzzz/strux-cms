/**
 * API Key Engine - API Key Management
 * 
 * Handles:
 * - API key generation with secure random tokens
 * - Key storage (hashed) in .cms/config.json
 * - Key validation and permission checking
 * - Key revocation
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import type { CMSConfig, ApiKeyEntry } from '../types/index.js'

export interface GeneratedApiKey {
  id: string
  name: string
  key: string       // Only returned once at creation time
  prefix: string
  permissions: string[]
  createdAt: string
  expiresAt?: string
  createdBy: string
}

export class ApiKeyEngine {
  private configPath: string
  private saltRounds = 10

  constructor(basePath: string) {
    this.configPath = join(basePath, '.cms', 'config.json')
  }

  /**
   * Load the current config from disk
   */
  private async loadConfig(): Promise<CMSConfig> {
    const content = await fs.readFile(this.configPath, 'utf-8')
    return JSON.parse(content) as CMSConfig
  }

  /**
   * Save config back to disk
   */
  private async saveConfig(config: CMSConfig): Promise<void> {
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  /**
   * Generate a new API key
   * 
   * @param name Human-readable name for the key
   * @param createdBy User ID of the creator
   * @param permissions Permission scopes (default: ['*'] for full access)
   * @param expiresAt Optional expiry date
   * @returns The generated key (full key is only returned once)
   */
  async generateKey(
    name: string,
    createdBy: string,
    permissions: string[] = ['*'],
    expiresAt?: string
  ): Promise<GeneratedApiKey> {
    if (!name || typeof name !== 'string') {
      throw new Error('API key name is required')
    }

    const config = await this.loadConfig()

    // Initialize apiKeys if not present
    if (!config.apiKeys) {
      config.apiKeys = { keys: [] }
    }

    // Generate a secure random key: jayson_<32 random bytes hex>
    const rawKey = randomBytes(32).toString('hex')
    const fullKey = `jayson_${rawKey}`
    const prefix = fullKey.substring(0, 12) + '...'

    // Hash the key for storage
    const keyHash = await bcrypt.hash(fullKey, this.saltRounds)

    // Generate a unique ID
    const id = `key_${randomBytes(8).toString('hex')}`

    const entry: ApiKeyEntry = {
      id,
      name,
      keyHash,
      prefix,
      permissions,
      createdAt: new Date().toISOString(),
      expiresAt,
      createdBy
    }

    config.apiKeys.keys.push(entry)
    await this.saveConfig(config)

    return {
      id,
      name,
      key: fullKey,    // Only returned at creation time
      prefix,
      permissions,
      createdAt: entry.createdAt,
      expiresAt,
      createdBy
    }
  }

  /**
   * Validate an API key and return its entry if valid
   * 
   * @param key The raw API key to validate
   * @returns The key entry if valid, null otherwise
   */
  async validateKey(key: string): Promise<ApiKeyEntry | null> {
    if (!key || typeof key !== 'string') return null

    const config = await this.loadConfig()
    if (!config.apiKeys?.keys?.length) return null

    for (const entry of config.apiKeys.keys) {
      // Check expiry first (cheaper than bcrypt)
      if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
        continue
      }

      // Compare with hash
      const isValid = await bcrypt.compare(key, entry.keyHash)
      if (isValid) {
        return entry
      }
    }

    return null
  }

  /**
   * Check if an API key has a specific permission
   * 
   * @param entry API key entry
   * @param permission Permission to check (e.g. 'content:read')
   * @returns true if the key has the permission
   */
  hasPermission(entry: ApiKeyEntry, permission: string): boolean {
    // Wildcard grants all permissions
    if (entry.permissions.includes('*')) return true
    return entry.permissions.includes(permission)
  }

  /**
   * List all API keys (without revealing the actual keys)
   * 
   * @returns Array of API key entries (keyHash excluded in response)
   */
  async listKeys(): Promise<Omit<ApiKeyEntry, 'keyHash'>[]> {
    const config = await this.loadConfig()
    if (!config.apiKeys?.keys) return []

    return config.apiKeys.keys.map(({ keyHash, ...rest }) => rest)
  }

  /**
   * Revoke (delete) an API key
   * 
   * @param keyId The key ID to revoke
   * @throws Error if key not found
   */
  async revokeKey(keyId: string): Promise<void> {
    const config = await this.loadConfig()
    if (!config.apiKeys?.keys) {
      throw new Error('No API keys configured')
    }

    const index = config.apiKeys.keys.findIndex(k => k.id === keyId)
    if (index === -1) {
      throw new Error(`API key "${keyId}" not found`)
    }

    config.apiKeys.keys.splice(index, 1)
    await this.saveConfig(config)
  }
}
