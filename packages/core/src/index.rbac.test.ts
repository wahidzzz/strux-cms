import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { CMS } from '../src/index.js'

describe('RBAC Default Configuration Creation', () => {
  const testDir = '/tmp/cms-rbac-test-' + Date.now()

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  it('should create default RBAC configuration if it does not exist', async () => {
    const cms = new CMS(testDir)
    
    // Initialize CMS (should create default RBAC config)
    await cms.initialize()
    
    // Verify RBAC config file was created
    const rbacConfigPath = join(testDir, '.cms', 'rbac.json')
    const configExists = await fs.access(rbacConfigPath).then(() => true).catch(() => false)
    expect(configExists).toBe(true)
    
    // Read and verify config content
    const configContent = await fs.readFile(rbacConfigPath, 'utf-8')
    const config = JSON.parse(configContent)
    
    // Verify structure
    expect(config).toHaveProperty('roles')
    expect(config).toHaveProperty('defaultRole')
    expect(config.defaultRole).toBe('authenticated')
    
    // Verify all four default roles exist
    expect(config.roles).toHaveProperty('admin')
    expect(config.roles).toHaveProperty('editor')
    expect(config.roles).toHaveProperty('authenticated')
    expect(config.roles).toHaveProperty('public')
    
    // Verify admin role
    expect(config.roles.admin.name).toBe('Administrator')
    expect(config.roles.admin.type).toBe('admin')
    expect(config.roles.admin.permissions).toHaveLength(1)
    expect(config.roles.admin.permissions[0]).toEqual({
      action: '*',
      subject: 'all'
    })
    
    // Verify editor role
    expect(config.roles.editor.name).toBe('Editor')
    expect(config.roles.editor.type).toBe('editor')
    expect(config.roles.editor.permissions).toHaveLength(5)
    const editorActions = config.roles.editor.permissions.map((p: any) => p.action)
    expect(editorActions).toContain('create')
    expect(editorActions).toContain('read')
    expect(editorActions).toContain('update')
    expect(editorActions).toContain('publish')
    expect(editorActions).toContain('unpublish')
    expect(editorActions).not.toContain('delete')
    
    // Verify authenticated role
    expect(config.roles.authenticated.name).toBe('Authenticated')
    expect(config.roles.authenticated.type).toBe('authenticated')
    expect(config.roles.authenticated.permissions).toHaveLength(3)
    const updatePermission = config.roles.authenticated.permissions.find((p: any) => p.action === 'update')
    expect(updatePermission).toBeDefined()
    expect(updatePermission.conditions).toEqual({ createdBy: '${user.id}' })
    
    // Verify public role
    expect(config.roles.public.name).toBe('Public')
    expect(config.roles.public.type).toBe('public')
    expect(config.roles.public.permissions).toHaveLength(1)
    expect(config.roles.public.permissions[0]).toEqual({
      action: 'read',
      subject: 'all'
    })
  })

  it('should not overwrite existing RBAC configuration', async () => {
    // Create custom RBAC config
    const cmsDir = join(testDir, '.cms')
    await fs.mkdir(cmsDir, { recursive: true })
    
    const customConfig = {
      roles: {
        custom: {
          id: 'custom',
          name: 'Custom Role',
          description: 'Custom role for testing',
          type: 'custom',
          permissions: [
            {
              action: 'read',
              subject: 'articles'
            }
          ]
        }
      },
      defaultRole: 'custom'
    }
    
    await fs.writeFile(
      join(cmsDir, 'rbac.json'),
      JSON.stringify(customConfig, null, 2)
    )
    
    const cms = new CMS(testDir)
    await cms.initialize()
    
    // Verify custom config was not overwritten
    const configContent = await fs.readFile(join(cmsDir, 'rbac.json'), 'utf-8')
    const config = JSON.parse(configContent)
    
    expect(config.defaultRole).toBe('custom')
    expect(config.roles).toHaveProperty('custom')
    expect(config.roles).not.toHaveProperty('admin')
  })
})
