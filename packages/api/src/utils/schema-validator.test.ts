/**
 * Tests for Schema Validation Utilities
 * 
 * @module utils/schema-validator.test
 */

import { describe, it, expect } from 'vitest'
import {
  validateSchema,
  isReservedFieldName,
  isValidFieldType,
  isValidApiId
} from './schema-validator'
import type { ContentTypeSchema } from '@cms/core'

describe('Schema Validator', () => {
  describe('validateSchema', () => {
    it('should validate a valid schema', () => {
      const schema: ContentTypeSchema = {
        apiId: 'blog-post',
        displayName: 'Blog Post',
        singularName: 'blog-post',
        pluralName: 'blog-posts',
        attributes: {
          title: {
            type: 'string',
            required: true
          },
          content: {
            type: 'richtext'
          }
        }
      }

      const result = validateSchema(schema)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject schema without apiId', () => {
      const schema = {
        displayName: 'Blog Post',
        singularName: 'blog-post',
        pluralName: 'blog-posts',
        attributes: {
          title: { type: 'string' }
        }
      } as Partial<ContentTypeSchema>

      const result = validateSchema(schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual({
        field: 'apiId',
        message: 'apiId is required and must be a non-empty string'
      })
    })

    it('should reject schema without displayName', () => {
      const schema = {
        apiId: 'blog-post',
        singularName: 'blog-post',
        pluralName: 'blog-posts',
        attributes: {
          title: { type: 'string' }
        }
      } as Partial<ContentTypeSchema>

      const result = validateSchema(schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual({
        field: 'displayName',
        message: 'displayName is required and must be a non-empty string'
      })
    })

    it('should reject schema without singularName', () => {
      const schema = {
        apiId: 'blog-post',
        displayName: 'Blog Post',
        pluralName: 'blog-posts',
        attributes: {
          title: { type: 'string' }
        }
      } as Partial<ContentTypeSchema>

      const result = validateSchema(schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual({
        field: 'singularName',
        message: 'singularName is required and must be a non-empty string'
      })
    })

    it('should reject schema without pluralName', () => {
      const schema = {
        apiId: 'blog-post',
        displayName: 'Blog Post',
        singularName: 'blog-post',
        attributes: {
          title: { type: 'string' }
        }
      } as Partial<ContentTypeSchema>

      const result = validateSchema(schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual({
        field: 'pluralName',
        message: 'pluralName is required and must be a non-empty string'
      })
    })

    it('should reject schema without attributes', () => {
      const schema = {
        apiId: 'blog-post',
        displayName: 'Blog Post',
        singularName: 'blog-post',
        pluralName: 'blog-posts'
      } as Partial<ContentTypeSchema>

      const result = validateSchema(schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual({
        field: 'attributes',
        message: 'attributes is required and must be a non-empty object'
      })
    })

    it('should reject schema with empty attributes', () => {
      const schema = {
        apiId: 'blog-post',
        displayName: 'Blog Post',
        singularName: 'blog-post',
        pluralName: 'blog-posts',
        attributes: {}
      } as ContentTypeSchema

      const result = validateSchema(schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual({
        field: 'attributes',
        message: 'attributes is required and must be a non-empty object'
      })
    })

    it('should reject schema with invalid apiId format (uppercase)', () => {
      const schema: ContentTypeSchema = {
        apiId: 'BlogPost',
        displayName: 'Blog Post',
        singularName: 'blog-post',
        pluralName: 'blog-posts',
        attributes: {
          title: { type: 'string' }
        }
      }

      const result = validateSchema(schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual({
        field: 'apiId',
        message: 'apiId must be in kebab-case format (lowercase letters, numbers, and hyphens only, starting with a letter)'
      })
    })

    it('should reject schema with invalid apiId format (underscore)', () => {
      const schema: ContentTypeSchema = {
        apiId: 'blog_post',
        displayName: 'Blog Post',
        singularName: 'blog-post',
        pluralName: 'blog-posts',
        attributes: {
          title: { type: 'string' }
        }
      }

      const result = validateSchema(schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual({
        field: 'apiId',
        message: 'apiId must be in kebab-case format (lowercase letters, numbers, and hyphens only, starting with a letter)'
      })
    })

    it('should reject schema with invalid apiId format (starting with number)', () => {
      const schema: ContentTypeSchema = {
        apiId: '1blog-post',
        displayName: 'Blog Post',
        singularName: 'blog-post',
        pluralName: 'blog-posts',
        attributes: {
          title: { type: 'string' }
        }
      }

      const result = validateSchema(schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual({
        field: 'apiId',
        message: 'apiId must be in kebab-case format (lowercase letters, numbers, and hyphens only, starting with a letter)'
      })
    })

    it('should reject schema where singularName equals pluralName', () => {
      const schema: ContentTypeSchema = {
        apiId: 'blog-post',
        displayName: 'Blog Post',
        singularName: 'blog-post',
        pluralName: 'blog-post',
        attributes: {
          title: { type: 'string' }
        }
      }

      const result = validateSchema(schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual({
        field: 'pluralName',
        message: 'pluralName must be different from singularName'
      })
    })

    it('should reject schema with reserved field name "id"', () => {
      const schema: ContentTypeSchema = {
        apiId: 'blog-post',
        displayName: 'Blog Post',
        singularName: 'blog-post',
        pluralName: 'blog-posts',
        attributes: {
          id: { type: 'string' },
          title: { type: 'string' }
        }
      }

      const result = validateSchema(schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual({
        field: 'attributes.id',
        message: "Field name 'id' is reserved and cannot be used"
      })
    })

    it('should reject schema with reserved field name "createdAt"', () => {
      const schema: ContentTypeSchema = {
        apiId: 'blog-post',
        displayName: 'Blog Post',
        singularName: 'blog-post',
        pluralName: 'blog-posts',
        attributes: {
          createdAt: { type: 'datetime' },
          title: { type: 'string' }
        }
      }

      const result = validateSchema(schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual({
        field: 'attributes.createdAt',
        message: "Field name 'createdAt' is reserved and cannot be used"
      })
    })

    it('should reject schema with reserved field name "updatedAt"', () => {
      const schema: ContentTypeSchema = {
        apiId: 'blog-post',
        displayName: 'Blog Post',
        singularName: 'blog-post',
        pluralName: 'blog-posts',
        attributes: {
          updatedAt: { type: 'datetime' },
          title: { type: 'string' }
        }
      }

      const result = validateSchema(schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual({
        field: 'attributes.updatedAt',
        message: "Field name 'updatedAt' is reserved and cannot be used"
      })
    })

    it('should reject schema with reserved field name "publishedAt"', () => {
      const schema: ContentTypeSchema = {
        apiId: 'blog-post',
        displayName: 'Blog Post',
        singularName: 'blog-post',
        pluralName: 'blog-posts',
        attributes: {
          publishedAt: { type: 'datetime' },
          title: { type: 'string' }
        }
      }

      const result = validateSchema(schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual({
        field: 'attributes.publishedAt',
        message: "Field name 'publishedAt' is reserved and cannot be used"
      })
    })

    it('should reject schema with reserved field name "createdBy"', () => {
      const schema: ContentTypeSchema = {
        apiId: 'blog-post',
        displayName: 'Blog Post',
        singularName: 'blog-post',
        pluralName: 'blog-posts',
        attributes: {
          createdBy: { type: 'string' },
          title: { type: 'string' }
        }
      }

      const result = validateSchema(schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual({
        field: 'attributes.createdBy',
        message: "Field name 'createdBy' is reserved and cannot be used"
      })
    })

    it('should reject schema with reserved field name "updatedBy"', () => {
      const schema: ContentTypeSchema = {
        apiId: 'blog-post',
        displayName: 'Blog Post',
        singularName: 'blog-post',
        pluralName: 'blog-posts',
        attributes: {
          updatedBy: { type: 'string' },
          title: { type: 'string' }
        }
      }

      const result = validateSchema(schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual({
        field: 'attributes.updatedBy',
        message: "Field name 'updatedBy' is reserved and cannot be used"
      })
    })

    it('should reject schema with invalid field type', () => {
      const schema: ContentTypeSchema = {
        apiId: 'blog-post',
        displayName: 'Blog Post',
        singularName: 'blog-post',
        pluralName: 'blog-posts',
        attributes: {
          title: { type: 'invalid-type' as any }
        }
      }

      const result = validateSchema(schema)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => 
        e.field === 'attributes.title.type' && 
        e.message.includes('Invalid field type')
      )).toBe(true)
    })

    it('should reject schema with field missing type', () => {
      const schema: ContentTypeSchema = {
        apiId: 'blog-post',
        displayName: 'Blog Post',
        singularName: 'blog-post',
        pluralName: 'blog-posts',
        attributes: {
          title: {} as any
        }
      }

      const result = validateSchema(schema)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual({
        field: 'attributes.title.type',
        message: 'Field type is required'
      })
    })

    it('should accept all valid field types', () => {
      const validTypes = [
        'string', 'text', 'richtext', 'number', 'boolean',
        'date', 'datetime', 'email', 'password', 'enumeration',
        'media', 'relation', 'component', 'dynamiczone', 'json', 'uid'
      ]

      for (const fieldType of validTypes) {
        const schema: ContentTypeSchema = {
          apiId: 'test-type',
          displayName: 'Test Type',
          singularName: 'test-type',
          pluralName: 'test-types',
          attributes: {
            testField: { type: fieldType as any }
          }
        }

        const result = validateSchema(schema)
        expect(result.valid).toBe(true)
      }
    })

    it('should collect multiple validation errors', () => {
      const schema = {
        apiId: 'InvalidApiId',
        displayName: 'Test',
        singularName: 'test',
        pluralName: 'test',
        attributes: {
          id: { type: 'string' },
          createdAt: { type: 'datetime' },
          invalidField: { type: 'invalid-type' as any }
        }
      } as ContentTypeSchema

      const result = validateSchema(schema)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(3)
    })
  })

  describe('isReservedFieldName', () => {
    it('should return true for reserved field names', () => {
      expect(isReservedFieldName('id')).toBe(true)
      expect(isReservedFieldName('createdAt')).toBe(true)
      expect(isReservedFieldName('updatedAt')).toBe(true)
      expect(isReservedFieldName('publishedAt')).toBe(true)
      expect(isReservedFieldName('createdBy')).toBe(true)
      expect(isReservedFieldName('updatedBy')).toBe(true)
    })

    it('should return false for non-reserved field names', () => {
      expect(isReservedFieldName('title')).toBe(false)
      expect(isReservedFieldName('content')).toBe(false)
      expect(isReservedFieldName('author')).toBe(false)
    })
  })

  describe('isValidFieldType', () => {
    it('should return true for valid field types', () => {
      expect(isValidFieldType('string')).toBe(true)
      expect(isValidFieldType('number')).toBe(true)
      expect(isValidFieldType('boolean')).toBe(true)
      expect(isValidFieldType('richtext')).toBe(true)
      expect(isValidFieldType('relation')).toBe(true)
    })

    it('should return false for invalid field types', () => {
      expect(isValidFieldType('invalid')).toBe(false)
      expect(isValidFieldType('unknown')).toBe(false)
      expect(isValidFieldType('')).toBe(false)
    })
  })

  describe('isValidApiId', () => {
    it('should return true for valid kebab-case apiIds', () => {
      expect(isValidApiId('blog-post')).toBe(true)
      expect(isValidApiId('article')).toBe(true)
      expect(isValidApiId('user-profile')).toBe(true)
      expect(isValidApiId('product-category-2')).toBe(true)
    })

    it('should return false for invalid apiIds', () => {
      expect(isValidApiId('BlogPost')).toBe(false)
      expect(isValidApiId('blog_post')).toBe(false)
      expect(isValidApiId('1blog-post')).toBe(false)
      expect(isValidApiId('blog-post-')).toBe(false)
      expect(isValidApiId('-blog-post')).toBe(false)
      expect(isValidApiId('blog--post')).toBe(false)
      expect(isValidApiId('')).toBe(false)
    })
  })
})
