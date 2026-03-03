/**
 * Tests for CMS initialization and configuration management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { CMS } from './index.js'
import type { CMSConfig } from './types/index.js'

describe('CMS Configuration Management', () => {
    const testBasePath = join(process.cwd(), 'test-cms-config')

    beforeEach(async () => {
        // Create test directory
        await fs.mkdir(testBasePath, { recursive: true })
    })

    afterEach(async () => {
        // Clean up test directory
        await fs.rm(testBasePath, { recursive: true, force: true })
    })

    it('should create default configuration if config.json does not exist', async () => {
        const cms = new CMS(testBasePath)
        await cms.initialize()

        // Check that config.json was created
        const configPath = join(testBasePath, '.cms', 'config.json')
        const configExists = await fs.access(configPath).then(() => true).catch(() => false)
        expect(configExists).toBe(true)

        // Load and verify config
        const configData = await fs.readFile(configPath, 'utf-8')
        const config = JSON.parse(configData) as CMSConfig

        // Verify JWT configuration
        expect(config.jwt).toBeDefined()
        expect(config.jwt.secret).toBeDefined()
        expect(config.jwt.secret.length).toBeGreaterThan(0)
        expect(config.jwt.expiresIn).toBe('7d')

        // Verify upload configuration
        expect(config.upload).toBeDefined()
        expect(config.upload.maxFileSize).toBe(10 * 1024 * 1024) // 10MB
        expect(config.upload.allowedMimeTypes).toBeDefined()
        expect(Array.isArray(config.upload.allowedMimeTypes)).toBe(true)
        expect(config.upload.allowedMimeTypes.length).toBeGreaterThan(0)
        expect(config.upload.maxFiles).toBe(10)

        // Verify server configuration
        expect(config.server).toBeDefined()
        expect(config.server?.port).toBe(3000)
        expect(config.server?.host).toBe('localhost')
        expect(config.server?.cors?.enabled).toBe(true)
    })

    it('should load existing configuration if config.json exists', async () => {
        // Create custom config
        const customConfig: CMSConfig = {
            jwt: {
                secret: 'custom-secret-key-for-testing',
                expiresIn: '14d'
            },
            upload: {
                maxFileSize: 5 * 1024 * 1024, // 5MB
                allowedMimeTypes: ['image/jpeg', 'image/png'],
                maxFiles: 5
            },
            server: {
                port: 4000,
                host: '0.0.0.0',
                cors: {
                    enabled: false
                }
            }
        }

        // Write custom config
        await fs.mkdir(join(testBasePath, '.cms'), { recursive: true })
        const configPath = join(testBasePath, '.cms', 'config.json')
        await fs.writeFile(configPath, JSON.stringify(customConfig, null, 2), 'utf-8')

        // Initialize CMS
        const cms = new CMS(testBasePath)
        await cms.initialize()

        // Get config and verify it matches custom config
        const loadedConfig = cms.getConfig()
        expect(loadedConfig.jwt.secret).toBe('custom-secret-key-for-testing')
        expect(loadedConfig.jwt.expiresIn).toBe('14d')
        expect(loadedConfig.upload.maxFileSize).toBe(5 * 1024 * 1024)
        expect(loadedConfig.upload.allowedMimeTypes).toEqual(['image/jpeg', 'image/png'])
        expect(loadedConfig.upload.maxFiles).toBe(5)
        expect(loadedConfig.server?.port).toBe(4000)
        expect(loadedConfig.server?.host).toBe('0.0.0.0')
        expect(loadedConfig.server?.cors?.enabled).toBe(false)
    })

    it('should provide sensible defaults for JWT configuration', async () => {
        const cms = new CMS(testBasePath)
        await cms.initialize()

        const config = cms.getConfig()

        // JWT secret should be a 64-character hex string (32 bytes)
        expect(config.jwt.secret).toMatch(/^[a-f0-9]{64}$/)
        
        // JWT expiration should be 7 days (as per requirement 8.4)
        expect(config.jwt.expiresIn).toBe('7d')
    })

    it('should provide sensible defaults for upload limits', async () => {
        const cms = new CMS(testBasePath)
        await cms.initialize()

        const config = cms.getConfig()

        // Max file size should be 10MB
        expect(config.upload.maxFileSize).toBe(10 * 1024 * 1024)

        // Should include common image types
        expect(config.upload.allowedMimeTypes).toContain('image/jpeg')
        expect(config.upload.allowedMimeTypes).toContain('image/png')
        expect(config.upload.allowedMimeTypes).toContain('image/gif')

        // Should include common document types
        expect(config.upload.allowedMimeTypes).toContain('application/pdf')

        // Should include video types
        expect(config.upload.allowedMimeTypes).toContain('video/mp4')

        // Max files per upload
        expect(config.upload.maxFiles).toBe(10)
    })

    it('should throw error if configuration is missing JWT secret', async () => {
        // Create invalid config (missing JWT secret)
        const invalidConfig = {
            jwt: {
                expiresIn: '7d'
            },
            upload: {
                maxFileSize: 10 * 1024 * 1024,
                allowedMimeTypes: ['image/jpeg']
            }
        }

        await fs.mkdir(join(testBasePath, '.cms'), { recursive: true })
        const configPath = join(testBasePath, '.cms', 'config.json')
        await fs.writeFile(configPath, JSON.stringify(invalidConfig, null, 2), 'utf-8')

        const cms = new CMS(testBasePath)
        
        await expect(cms.initialize()).rejects.toThrow('Configuration missing JWT secret')
    })

    it('should throw error if getConfig is called before initialization', () => {
        const cms = new CMS(testBasePath)
        
        expect(() => cms.getConfig()).toThrow('CMS not initialized - configuration not loaded')
    })

    it('should generate unique JWT secrets for different installations', async () => {
        // Create first CMS instance
        const cms1 = new CMS(testBasePath)
        await cms1.initialize()
        const config1 = cms1.getConfig()

        // Clean up
        await fs.rm(testBasePath, { recursive: true, force: true })
        await fs.mkdir(testBasePath, { recursive: true })

        // Create second CMS instance
        const cms2 = new CMS(testBasePath)
        await cms2.initialize()
        const config2 = cms2.getConfig()

        // Secrets should be different
        expect(config1.jwt.secret).not.toBe(config2.jwt.secret)
    })
})
