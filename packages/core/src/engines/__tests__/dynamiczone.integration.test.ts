import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SchemaEngine } from '../schema-engine'
import { join } from 'path'
import * as fs from 'fs/promises'
import * as os from 'os'
import { ContentTypeSchema } from '../../types'

describe('Dynamic Zones Validation', () => {
  let schemaEngine: SchemaEngine
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(os.tmpdir(), 'schema-test-'))
    schemaEngine = new SchemaEngine(tempDir)

    // Create a mock component 1
    const comp1: ContentTypeSchema = {
      apiId: 'seo-info',
kind: 'collectionType',
      displayName: 'SEO Info',
      singularName: 'seo-info',
      pluralName: 'seo-infos',
      kind: 'component',
      attributes: {
        metaTitle: { type: 'string', required: true },
        metaDescription: { type: 'string' }
      }
    }
    await schemaEngine.saveSchema('seo-info', comp1)

    // Create a mock component 2
    const comp2: ContentTypeSchema = {
      apiId: 'hero-banner',
kind: 'collectionType',
      displayName: 'Hero Banner',
      singularName: 'hero-banner',
      pluralName: 'hero-banners',
      kind: 'component',
      attributes: {
        title: { type: 'string', required: true },
        image: { type: 'string' }
      }
    }
    await schemaEngine.saveSchema('hero-banner', comp2)

    // Create a collection type with a dynamic zone
    const pageSchema: ContentTypeSchema = {
      apiId: 'page',
kind: 'collectionType',
      displayName: 'Page',
      singularName: 'page',
      pluralName: 'pages',
      kind: 'collectionType',
      attributes: {
        title: { type: 'string', required: true },
        contentBlocks: {
          type: 'dynamiczone',
          allowedComponents: ['hero-banner', 'seo-info']
        }
      }
    }
    await schemaEngine.saveSchema('page', pageSchema)
  })

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch (e) {
      // Ignore cleanup errors
    }
  })

  it('should validate a dynamic zone with allowed components', async () => {
    const validData = {
      title: 'Home Page',
      contentBlocks: [
        {
          __component: 'hero-banner',
          title: 'Welcome!',
          image: '/upload/hero.png'
        },
        {
          __component: 'seo-info',
          metaTitle: 'Home | My Site'
        }
      ]
    }

    const { valid, errors } = await schemaEngine.validate('page', validData)
    expect(valid).toBe(true)
    expect(errors).toBeUndefined()
  })

  it('should fail validation if an unallowed component is used in a dynamic zone', async () => {
    // Create an unallowed component
    const unallowedComp: ContentTypeSchema = {
      apiId: 'secret-comp',
kind: 'collectionType',
      displayName: 'Secret Comp',
      singularName: 'secret-comp',
      pluralName: 'secret-comps',
      kind: 'component',
      attributes: {
        classifiedInfo: { type: 'string' }
      }
    }
    await schemaEngine.saveSchema('secret-comp', unallowedComp)

    const invalidData = {
      title: 'About Page',
      contentBlocks: [
        {
          __component: 'hero-banner',
          title: 'About Us'
        },
        {
          __component: 'secret-comp',
          classifiedInfo: 'hacked!'
        }
      ]
    }

    const { valid, errors } = await schemaEngine.validate('page', invalidData)
    expect(valid).toBe(false)
    expect(errors).toBeDefined()
    // It should fail because 'secret-comp' is not in the oneOf/anyOf allowed structure
    expect(errors!.some(e => e.path.includes('contentBlocks'))).toBe(true)
  })

  it('should fail validation if a component missing required fields is provided', async () => {
    const invalidData = {
      title: 'Contact Page',
      contentBlocks: [
        {
          __component: 'hero-banner',
          // missing 'title'
          image: '/hero.png'
        }
      ]
    }

    const { valid, errors } = await schemaEngine.validate('page', invalidData)
    expect(valid).toBe(false)
    expect(errors).toBeDefined()
    expect(errors![0].message).toContain('required')
  })
})
