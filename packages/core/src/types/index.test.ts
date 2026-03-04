import { describe, it, expect } from 'vitest'
import type { ContentEntry, ContentTypeSchema, QueryParams } from './index.js'

describe('Type definitions', () => {
  it('should define ContentEntry interface', () => {
    const entry: ContentEntry = {
      id: '1',
      title: 'Test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    
    expect(entry.id).toBe('1')
    expect(entry.title).toBe('Test')
  })

  it('should define ContentTypeSchema interface', () => {
    const schema: ContentTypeSchema = {
      apiId: 'articles',
kind: 'collectionType',
      displayName: 'Article',
      singularName: 'article',
      pluralName: 'articles',
      attributes: {
        title: {
          type: 'string',
          required: true,
        },
      },
    }
    
    expect(schema.apiId).toBe('articles')
    expect(schema.attributes.title.type).toBe('string')
  })

  it('should define QueryParams interface', () => {
    const params: QueryParams = {
      filters: {
        title: { $eq: 'Test' },
      },
      sort: [{ field: 'createdAt', order: 'desc' }],
      pagination: { page: 1, pageSize: 25 },
    }
    
    expect(params.filters).toBeDefined()
    expect(params.sort).toHaveLength(1)
    expect(params.pagination?.page).toBe(1)
  })
})
