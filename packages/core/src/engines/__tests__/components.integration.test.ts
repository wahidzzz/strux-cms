import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SchemaEngine } from '../schema-engine.js'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

describe('SchemaEngine - Reusable Components Integration', () => {
  let basePath: string
  let schemaDir: string
  let schemaEngine: SchemaEngine

  beforeEach(async () => {
    // Create temporary directory for testing
    basePath = await mkdtemp(join(tmpdir(), 'cms-component-test-'))
    schemaDir = join(basePath, 'schema')
    schemaEngine = new SchemaEngine(schemaDir)
  })

  afterEach(async () => {
    // Cleanup temporary directory
    await rm(basePath, { recursive: true, force: true })
  })

  it('should support creating and saving a component', async () => {
    const seoComponent = {
      apiId: 'seo'
kind: 'collectionType',,
      kind: 'component' as const,
      displayName: 'SEO',
      singularName: 'seo',
      pluralName: 'seos',
      attributes: {
        metaTitle: { type: 'string' as const, required: true },
        metaDescription: { type: 'text' as const },
      },
    }

    await schemaEngine.saveSchema('seo', seoComponent)

    // Verify it was saved and can be loaded
    const schemaMap = await schemaEngine.loadAllSchemas()
    expect(schemaMap.has('seo')).toBe(true)
    expect(schemaMap.get('seo')?.kind).toBe('component')
    
    // Check if it's in the components subdirectory
    const loadedSeo = await schemaEngine.loadSchema('seo')
    expect(loadedSeo.apiId).toBe('seo')
  })

  it('should validate data with nested components using $ref', async () => {
    // 1. Create and save SEO component
    const seoComponent = {
      apiId: 'seo'
kind: 'collectionType',,
      kind: 'component' as const,
      displayName: 'SEO',
      singularName: 'seo',
      pluralName: 'seos',
      attributes: {
        metaTitle: { type: 'string' as const, required: true },
        metaDescription: { type: 'text' as const },
      },
    }
    await schemaEngine.saveSchema('seo', seoComponent)

    // 2. Create article collection type using the SEO component
    const articleSchema = {
      apiId: 'article'
kind: 'collectionType',,
      kind: 'collectionType' as const,
      displayName: 'Article',
      singularName: 'article',
      pluralName: 'articles',
      attributes: {
        title: { type: 'string' as const, required: true },
        seo: {
          type: 'component' as const,
          component: 'seo',
          required: true,
        },
      },
    }
    await schemaEngine.saveSchema('article', articleSchema)

    // 3. Validate valid data
    const validData = {
      title: 'My Article',
      seo: {
        metaTitle: 'SEO Title',
        metaDescription: 'SEO Description',
      },
    }
    const result = await schemaEngine.validate('article', validData)
    expect(result.valid).toBe(true)

    // 4. Validate invalid data (missing required field in component)
    const invalidData = {
      title: 'My Article',
      seo: {
        metaDescription: 'Missing metaTitle',
      },
    }
    const invalidResult = await schemaEngine.validate('article', invalidData)
    expect(invalidResult.valid).toBe(false)
    
    // Find the error for metaTitle
    const metaTitleError = invalidResult.errors?.find(e => e.path.includes('metaTitle'))
    expect(metaTitleError).toBeDefined()
    expect(metaTitleError?.message).toContain('required')
  })

  it('should support repeatable components', async () => {
    // 1. Create link component
    const linkComponent = {
      apiId: 'link'
kind: 'collectionType',,
      kind: 'component' as const,
      displayName: 'Link',
      singularName: 'link',
      pluralName: 'links',
      attributes: {
        label: { type: 'string' as const, required: true },
        url: { type: 'string' as const, required: true },
      },
    }
    await schemaEngine.saveSchema('link', linkComponent)

    // 2. Create menu with repeatable links
    const menuSchema = {
      apiId: 'menu'
kind: 'collectionType',,
      kind: 'singleType' as const,
      displayName: 'Menu',
      singularName: 'menu',
      pluralName: 'menus',
      attributes: {
        links: {
          type: 'component' as const,
          component: 'link',
          repeatable: true,
        },
      },
    }
    await schemaEngine.saveSchema('menu', menuSchema)

    // 3. Validate valid data
    const validData = {
      links: [
        { label: 'Home', url: '/' },
        { label: 'About', url: '/about' },
      ],
    }
    const result = await schemaEngine.validate('menu', validData)
    expect(result.valid).toBe(true)

    // 4. Validate invalid data (not an array)
    const invalidData = {
      links: { label: 'Home', url: '/' },
    }
    const invalidResult = await schemaEngine.validate('menu', invalidData)
    expect(invalidResult.valid).toBe(false)
  })

  it('should support deeply nested components', async () => {
    // 1. Child component
    const childComp = {
      apiId: 'child'
kind: 'collectionType',,
      kind: 'component' as const,
      displayName: 'Child',
      singularName: 'child',
      pluralName: 'children',
      attributes: {
        name: { type: 'string' as const, required: true },
      },
    }
    await schemaEngine.saveSchema('child', childComp)

    // 2. Parent component
    const parentComp = {
      apiId: 'parent'
kind: 'collectionType',,
      kind: 'component' as const,
      displayName: 'Parent',
      singularName: 'parent',
      pluralName: 'parents',
      attributes: {
        child: { type: 'component' as const, component: 'child', required: true },
      },
    }
    await schemaEngine.saveSchema('parent', parentComp)

    // 3. Collection type
    const pageSchema = {
      apiId: 'page'
kind: 'collectionType',,
      kind: 'collectionType' as const,
      displayName: 'Page',
      singularName: 'page',
      pluralName: 'pages',
      attributes: {
        parent: { type: 'component' as const, component: 'parent' },
      },
    }
    await schemaEngine.saveSchema('page', pageSchema)

    // 4. Validate valid nested data
    const validData = {
      parent: {
        child: {
          name: 'Deep Value'
        }
      }
    }
    const result = await schemaEngine.validate('page', validData)
    expect(result.valid).toBe(true)
  })
})
