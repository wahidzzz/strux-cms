import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { SchemaEngine } from './schema-engine.js'
import type { ContentTypeSchema } from '../types/index.js'

describe('SchemaEngine', () => {
  const testSchemaDir = 'test-data/schemas'
  let engine: SchemaEngine

  beforeEach(async () => {
    // Create test schema directory
    await fs.mkdir(testSchemaDir, { recursive: true })
    engine = new SchemaEngine(testSchemaDir)
  })

  afterEach(async () => {
    // Clean up test schema directory
    try {
      const files = await fs.readdir(testSchemaDir)
      for (const file of files) {
        await fs.unlink(join(testSchemaDir, file))
      }
      await fs.rmdir(testSchemaDir)
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('loadSchema', () => {
    it('should load a valid schema from disk', async () => {
      // Create a test schema file
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true },
          content: { type: 'text' },
        },
      }

      await fs.writeFile(
        join(testSchemaDir, 'article.schema.json'),
        JSON.stringify(schema, null, 2),
        'utf8'
      )

      // Load schema
      const loaded = await engine.loadSchema('article')

      expect(loaded).toEqual(schema)
      expect(engine.isCached('article')).toBe(true)
    })

    it('should return cached schema on second load', async () => {
      // Create a test schema file
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string' },
        },
      }

      await fs.writeFile(
        join(testSchemaDir, 'article.schema.json'),
        JSON.stringify(schema, null, 2),
        'utf8'
      )

      // Load schema twice
      const loaded1 = await engine.loadSchema('article')
      const loaded2 = await engine.loadSchema('article')

      expect(loaded1).toBe(loaded2) // Same object reference (cached)
    })

    it('should throw error if schema file does not exist', async () => {
      await expect(engine.loadSchema('nonexistent')).rejects.toThrow(
        'Schema not found for content type: nonexistent'
      )
    })

    it('should throw error if schema JSON is invalid', async () => {
      // Write invalid JSON
      await fs.writeFile(
        join(testSchemaDir, 'invalid.schema.json'),
        'not valid json',
        'utf8'
      )

      await expect(engine.loadSchema('invalid')).rejects.toThrow(
        'Failed to parse schema JSON'
      )
    })

    it('should throw error if schema structure is invalid', async () => {
      // Write schema with missing required fields
      const invalidSchema = {
        apiId: 'test',
        // Missing displayName, singularName, pluralName, attributes
      }

      await fs.writeFile(
        join(testSchemaDir, 'test.schema.json'),
        JSON.stringify(invalidSchema, null, 2),
        'utf8'
      )

      await expect(engine.loadSchema('test')).rejects.toThrow(
        'Invalid schema structure'
      )
    })

    it('should throw error for invalid contentType parameter', async () => {
      await expect(engine.loadSchema('')).rejects.toThrow(
        'Invalid contentType: must be a non-empty string'
      )
    })
  })

  describe('loadAllSchemas', () => {
    it('should load all schemas from directory in parallel', async () => {
      // Create multiple test schema files
      const schemas: ContentTypeSchema[] = [
        {
          apiId: 'article',
          displayName: 'Article',
          singularName: 'article',
          pluralName: 'articles',
          attributes: { title: { type: 'string' } },
        },
        {
          apiId: 'user',
          displayName: 'User',
          singularName: 'user',
          pluralName: 'users',
          attributes: { username: { type: 'string' } },
        },
        {
          apiId: 'comment',
          displayName: 'Comment',
          singularName: 'comment',
          pluralName: 'comments',
          attributes: { text: { type: 'text' } },
        },
      ]

      for (const schema of schemas) {
        await fs.writeFile(
          join(testSchemaDir, `${schema.apiId}.schema.json`),
          JSON.stringify(schema, null, 2),
          'utf8'
        )
      }

      // Load all schemas
      const schemaMap = await engine.loadAllSchemas()

      expect(schemaMap.size).toBe(3)
      expect(schemaMap.get('article')).toEqual(schemas[0])
      expect(schemaMap.get('user')).toEqual(schemas[1])
      expect(schemaMap.get('comment')).toEqual(schemas[2])
    })

    it('should return empty map if no schemas exist', async () => {
      const schemaMap = await engine.loadAllSchemas()
      expect(schemaMap.size).toBe(0)
    })

    it('should ignore non-schema files', async () => {
      // Create a schema file and a non-schema file
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: { title: { type: 'string' } },
      }

      await fs.writeFile(
        join(testSchemaDir, 'article.schema.json'),
        JSON.stringify(schema, null, 2),
        'utf8'
      )

      await fs.writeFile(join(testSchemaDir, 'readme.txt'), 'test', 'utf8')

      // Load all schemas
      const schemaMap = await engine.loadAllSchemas()

      expect(schemaMap.size).toBe(1)
      expect(schemaMap.has('article')).toBe(true)
    })
  })

  describe('saveSchema', () => {
    it('should save a valid schema to disk and cache', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true },
          content: { type: 'text' },
        },
      }

      await engine.saveSchema('article', schema)

      // Check file was created
      const filePath = join(testSchemaDir, 'article.schema.json')
      const content = await fs.readFile(filePath, 'utf8')
      const saved = JSON.parse(content)

      expect(saved).toEqual(schema)
      expect(engine.isCached('article')).toBe(true)
    })

    it('should throw error if schema structure is invalid', async () => {
      const invalidSchema = {
        apiId: 'test',
        // Missing required fields
      } as unknown as ContentTypeSchema

      await expect(engine.saveSchema('test', invalidSchema)).rejects.toThrow(
        'Invalid schema structure'
      )
    })

    it('should throw error if apiId does not match contentType', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: { title: { type: 'string' } },
      }

      await expect(engine.saveSchema('user', schema)).rejects.toThrow(
        'Schema apiId (article) must match contentType (user)'
      )
    })

    it('should throw error for invalid contentType parameter', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'test',
        displayName: 'Test',
        singularName: 'test',
        pluralName: 'tests',
        attributes: { title: { type: 'string' } },
      }

      await expect(engine.saveSchema('', schema)).rejects.toThrow(
        'Invalid contentType: must be a non-empty string'
      )
    })

    it('should update existing schema', async () => {
      const schema1: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: { title: { type: 'string' } },
      }

      const schema2: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article Updated',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string' },
          content: { type: 'text' },
        },
      }

      await engine.saveSchema('article', schema1)
      await engine.saveSchema('article', schema2)

      // Load and verify updated schema
      engine.clearCache()
      const loaded = await engine.loadSchema('article')
      expect(loaded).toEqual(schema2)
    })
  })

  describe('deleteSchema', () => {
    it('should delete schema file and remove from cache', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: { title: { type: 'string' } },
      }

      await engine.saveSchema('article', schema)
      expect(engine.isCached('article')).toBe(true)

      await engine.deleteSchema('article')

      // Check file was deleted
      const filePath = join(testSchemaDir, 'article.schema.json')
      await expect(fs.access(filePath)).rejects.toThrow()

      // Check cache was cleared
      expect(engine.isCached('article')).toBe(false)
    })

    it('should not throw error if schema file does not exist', async () => {
      await expect(engine.deleteSchema('nonexistent')).resolves.not.toThrow()
    })

    it('should throw error for invalid contentType parameter', async () => {
      await expect(engine.deleteSchema('')).rejects.toThrow(
        'Invalid contentType: must be a non-empty string'
      )
    })

    it('should remove from cache even if file does not exist', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: { title: { type: 'string' } },
      }

      await engine.saveSchema('article', schema)
      expect(engine.isCached('article')).toBe(true)

      // Manually delete file
      const filePath = join(testSchemaDir, 'article.schema.json')
      await fs.unlink(filePath)

      // Delete schema (file already gone)
      await engine.deleteSchema('article')

      // Cache should still be cleared
      expect(engine.isCached('article')).toBe(false)
    })
  })

  describe('schema validation', () => {
    it('should reject schema with non-kebab-case apiId', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'ArticleType', // Not kebab-case
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: { title: { type: 'string' } },
      }

      await expect(
        engine.saveSchema('ArticleType', schema)
      ).rejects.toThrow('apiId must be kebab-case')
    })

    it('should reject schema with same singularName and pluralName', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'article', // Same as singularName
        attributes: { title: { type: 'string' } },
      }

      await expect(engine.saveSchema('article', schema)).rejects.toThrow(
        'singularName and pluralName must be different'
      )
    })

    it('should reject schema with empty attributes', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {}, // Empty
      }

      await expect(engine.saveSchema('article', schema)).rejects.toThrow(
        'attributes must contain at least one field'
      )
    })

    it('should reject schema with reserved field names', async () => {
      const reservedFields = ['id', 'createdAt', 'updatedAt', 'publishedAt']

      for (const field of reservedFields) {
        const schema: ContentTypeSchema = {
          apiId: 'article',
          displayName: 'Article',
          singularName: 'article',
          pluralName: 'articles',
          attributes: {
            [field]: { type: 'string' },
          },
        }

        await expect(engine.saveSchema('article', schema)).rejects.toThrow(
          `Field name '${field}' is reserved`
        )
      }
    })

    it('should accept valid schema with all field types', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true },
          content: { type: 'text' },
          richContent: { type: 'richtext' },
          count: { type: 'number', min: 0, max: 100 },
          active: { type: 'boolean' },
          publishDate: { type: 'date' },
          createdTime: { type: 'datetime' },
          email: { type: 'email' },
          password: { type: 'password' },
          status: { type: 'enumeration', enum: ['draft', 'published'] },
          image: { type: 'media' },
          author: {
            type: 'relation',
            relation: {
              relation: 'manyToOne',
              target: 'user',
            },
          },
          metadata: { type: 'json' },
          slug: { type: 'uid', targetField: 'title' },
        },
      }

      await expect(
        engine.saveSchema('article', schema)
      ).resolves.not.toThrow()
    })
  })

  describe('cache management', () => {
    it('should clear cache', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: { title: { type: 'string' } },
      }

      await engine.saveSchema('article', schema)
      expect(engine.getCacheSize()).toBe(1)

      engine.clearCache()
      expect(engine.getCacheSize()).toBe(0)
      expect(engine.isCached('article')).toBe(false)
    })

    it('should report correct cache size', async () => {
      expect(engine.getCacheSize()).toBe(0)

      const schemas: ContentTypeSchema[] = [
        {
          apiId: 'article',
          displayName: 'Article',
          singularName: 'article',
          pluralName: 'articles',
          attributes: { title: { type: 'string' } },
        },
        {
          apiId: 'user',
          displayName: 'User',
          singularName: 'user',
          pluralName: 'users',
          attributes: { username: { type: 'string' } },
        },
      ]

      for (const schema of schemas) {
        await engine.saveSchema(schema.apiId, schema)
      }

      expect(engine.getCacheSize()).toBe(2)
    })

    it('should check if schema is cached', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: { title: { type: 'string' } },
      }

      expect(engine.isCached('article')).toBe(false)

      await engine.saveSchema('article', schema)
      expect(engine.isCached('article')).toBe(true)

      engine.clearCache()
      expect(engine.isCached('article')).toBe(false)
    })
  })

  describe('AJV validation', () => {
    beforeEach(async () => {
      // Create a test schema
      const schema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true, minLength: 3, maxLength: 100 },
          content: { type: 'text', required: true },
          count: { type: 'number', min: 0, max: 100 },
          active: { type: 'boolean' },
          email: { type: 'email' },
          status: { type: 'enumeration', enum: ['draft', 'published', 'archived'] },
          publishDate: { type: 'date' },
          metadata: { type: 'json' },
        },
      }

      await engine.saveSchema('article', schema)
    })

    it('should validate valid data', async () => {
      const data = {
        title: 'Test Article',
        content: 'This is the content',
        count: 50,
        active: true,
        email: 'test@example.com',
        status: 'draft',
        publishDate: '2024-01-01',
        metadata: { key: 'value' },
      }

      const result = await engine.validate('article', data)
      expect(result.valid).toBe(true)
      expect(result.errors).toBeUndefined()
    })

    it('should reject data with missing required field', async () => {
      const data = {
        content: 'This is the content',
      }

      const result = await engine.validate('article', data)
      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      // AJV returns empty path array for root-level required field errors
      expect(result.errors?.some(e => e.type === 'required')).toBe(true)
    })

    it('should reject data with wrong type', async () => {
      const data = {
        title: 'Test Article',
        content: 'This is the content',
        count: 'not a number', // Wrong type
      }

      const result = await engine.validate('article', data)
      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors?.some(e => e.path.includes('count'))).toBe(true)
    })

    it('should reject number outside min/max range', async () => {
      const data = {
        title: 'Test Article',
        content: 'This is the content',
        count: 150, // Exceeds max of 100
      }

      const result = await engine.validate('article', data)
      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors?.some(e => e.path.includes('count'))).toBe(true)
    })

    it('should reject string shorter than minLength', async () => {
      const data = {
        title: 'AB', // Less than minLength of 3
        content: 'This is the content',
      }

      const result = await engine.validate('article', data)
      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors?.some(e => e.path.includes('title'))).toBe(true)
    })

    it('should reject string longer than maxLength', async () => {
      const data = {
        title: 'A'.repeat(101), // Exceeds maxLength of 100
        content: 'This is the content',
      }

      const result = await engine.validate('article', data)
      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors?.some(e => e.path.includes('title'))).toBe(true)
    })

    it('should reject invalid email format', async () => {
      const data = {
        title: 'Test Article',
        content: 'This is the content',
        email: 'not-an-email', // Invalid email
      }

      const result = await engine.validate('article', data)
      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors?.some(e => e.path.includes('email'))).toBe(true)
    })

    it('should reject value not in enum', async () => {
      const data = {
        title: 'Test Article',
        content: 'This is the content',
        status: 'invalid-status', // Not in enum
      }

      const result = await engine.validate('article', data)
      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors?.some(e => e.path.includes('status'))).toBe(true)
    })

    it('should accept valid enum value', async () => {
      const data = {
        title: 'Test Article',
        content: 'This is the content',
        status: 'published',
      }

      const result = await engine.validate('article', data)
      expect(result.valid).toBe(true)
    })

    it('should cache compiled validators', async () => {
      expect(engine.getValidatorCacheSize()).toBe(0)

      await engine.validate('article', { title: 'Test', content: 'Content' })
      expect(engine.getValidatorCacheSize()).toBe(1)

      // Second validation should use cached validator
      await engine.validate('article', { title: 'Test 2', content: 'Content 2' })
      expect(engine.getValidatorCacheSize()).toBe(1)
    })

    it('should clear validator cache when clearCache is called', async () => {
      await engine.validate('article', { title: 'Test', content: 'Content' })
      expect(engine.getValidatorCacheSize()).toBe(1)

      engine.clearCache()
      expect(engine.getValidatorCacheSize()).toBe(0)
    })

    it('should remove validator from cache when schema is deleted', async () => {
      await engine.validate('article', { title: 'Test', content: 'Content' })
      expect(engine.getValidatorCacheSize()).toBe(1)

      await engine.deleteSchema('article')
      expect(engine.getValidatorCacheSize()).toBe(0)
    })

    it('should validate all field types correctly', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'test-types',
        displayName: 'Test Types',
        singularName: 'test-type',
        pluralName: 'test-types',
        attributes: {
          stringField: { type: 'string' },
          textField: { type: 'text' },
          richtextField: { type: 'richtext' },
          numberField: { type: 'number' },
          booleanField: { type: 'boolean' },
          dateField: { type: 'date' },
          datetimeField: { type: 'datetime' },
          emailField: { type: 'email' },
          passwordField: { type: 'password' },
          enumField: { type: 'enumeration', enum: ['a', 'b', 'c'] },
          jsonField: { type: 'json' },
          mediaField: { type: 'media' },
          relationField: { type: 'relation' },
          uidField: { type: 'uid' },
        },
      }

      await engine.saveSchema('test-types', schema)

      const validData = {
        stringField: 'test',
        textField: 'long text',
        richtextField: '<p>rich text</p>',
        numberField: 42,
        booleanField: true,
        dateField: '2024-01-01',
        datetimeField: '2024-01-01T12:00:00Z',
        emailField: 'test@example.com',
        passwordField: 'secret123',
        enumField: 'a',
        jsonField: { key: 'value' },
        mediaField: 'media-id-123',
        relationField: 'relation-id-456',
        uidField: 'unique-slug',
      }

      const result = await engine.validate('test-types', validData)
      expect(result.valid).toBe(true)
    })

    it('should accept media field as string or array', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'media-test',
        displayName: 'Media Test',
        singularName: 'media-test',
        pluralName: 'media-tests',
        attributes: {
          media: { type: 'media' },
        },
      }

      await engine.saveSchema('media-test', schema)

      // Test with string
      const result1 = await engine.validate('media-test', { media: 'media-id' })
      expect(result1.valid).toBe(true)

      // Test with array
      const result2 = await engine.validate('media-test', { media: ['id1', 'id2'] })
      expect(result2.valid).toBe(true)
    })

    it('should accept relation field as string or array', async () => {
      const schema: ContentTypeSchema = {
        apiId: 'relation-test',
        displayName: 'Relation Test',
        singularName: 'relation-test',
        pluralName: 'relation-tests',
        attributes: {
          relation: { type: 'relation' },
        },
      }

      await engine.saveSchema('relation-test', schema)

      // Test with string
      const result1 = await engine.validate('relation-test', { relation: 'rel-id' })
      expect(result1.valid).toBe(true)

      // Test with array
      const result2 = await engine.validate('relation-test', { relation: ['id1', 'id2'] })
      expect(result2.valid).toBe(true)
    })

    it('should return detailed error information', async () => {
      const data = {
        title: 'AB', // Too short
        content: 123, // Wrong type
        count: 150, // Out of range
      }

      const result = await engine.validate('article', data)
      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThan(0)
      
      // Check error structure
      for (const error of result.errors!) {
        expect(error).toHaveProperty('path')
        expect(error).toHaveProperty('message')
        expect(error).toHaveProperty('type')
        expect(Array.isArray(error.path)).toBe(true)
      }
    })
  })

  describe('schema introspection', () => {
    beforeEach(async () => {
      // Create test schemas with relations
      const userSchema: ContentTypeSchema = {
        apiId: 'user',
        displayName: 'User',
        singularName: 'user',
        pluralName: 'users',
        attributes: {
          username: { type: 'string', required: true },
          email: { type: 'email', required: true },
          bio: { type: 'text' },
          age: { type: 'number' },
        },
      }

      const articleSchema: ContentTypeSchema = {
        apiId: 'article',
        displayName: 'Article',
        singularName: 'article',
        pluralName: 'articles',
        attributes: {
          title: { type: 'string', required: true },
          content: { type: 'text' },
          publishDate: { type: 'date' },
          author: {
            type: 'relation',
            relation: {
              relation: 'manyToOne',
              target: 'user',
            },
          },
          categories: {
            type: 'relation',
            relation: {
              relation: 'manyToMany',
              target: 'category',
            },
          },
          metadata: { type: 'json' },
        },
      }

      const categorySchema: ContentTypeSchema = {
        apiId: 'category',
        displayName: 'Category',
        singularName: 'category',
        pluralName: 'categories',
        attributes: {
          name: { type: 'string', required: true },
          slug: { type: 'uid', targetField: 'name' },
        },
      }

      await engine.saveSchema('user', userSchema)
      await engine.saveSchema('article', articleSchema)
      await engine.saveSchema('category', categorySchema)
    })

    describe('getFieldType', () => {
      it('should return field type for simple field', async () => {
        const fieldType = await engine.getFieldType('article', 'title')
        expect(fieldType).toBe('string')
      })

      it('should return field type for different field types', async () => {
        expect(await engine.getFieldType('article', 'title')).toBe('string')
        expect(await engine.getFieldType('article', 'content')).toBe('text')
        expect(await engine.getFieldType('article', 'publishDate')).toBe('date')
        expect(await engine.getFieldType('article', 'author')).toBe('relation')
        expect(await engine.getFieldType('article', 'metadata')).toBe('json')
      })

      it('should return field type for nested field through relation', async () => {
        const fieldType = await engine.getFieldType('article', 'author.username')
        expect(fieldType).toBe('string')
      })

      it('should return field type for deeply nested field', async () => {
        const fieldType = await engine.getFieldType('article', 'author.email')
        expect(fieldType).toBe('email')
      })

      it('should throw error if field does not exist', async () => {
        await expect(
          engine.getFieldType('article', 'nonexistent')
        ).rejects.toThrow("Field 'nonexistent' not found in content type 'article'")
      })

      it('should throw error if nested field does not exist', async () => {
        await expect(
          engine.getFieldType('article', 'author.nonexistent')
        ).rejects.toThrow("Field 'author.nonexistent' not found in content type 'user'")
      })

      it('should throw error if content type does not exist', async () => {
        await expect(
          engine.getFieldType('nonexistent', 'field')
        ).rejects.toThrow('Schema not found for content type: nonexistent')
      })

      it('should throw error when trying to navigate into non-relation field', async () => {
        await expect(
          engine.getFieldType('article', 'title.something')
        ).rejects.toThrow("Cannot navigate into field 'title' of type 'string'")
      })

      it('should handle multiple levels of nesting', async () => {
        // Create a schema with nested relations
        const commentSchema: ContentTypeSchema = {
          apiId: 'comment',
          displayName: 'Comment',
          singularName: 'comment',
          pluralName: 'comments',
          attributes: {
            text: { type: 'text' },
            article: {
              type: 'relation',
              relation: {
                relation: 'manyToOne',
                target: 'article',
              },
            },
          },
        }

        await engine.saveSchema('comment', commentSchema)

        // Navigate through comment -> article -> author -> username
        const fieldType = await engine.getFieldType('comment', 'article.author.username')
        expect(fieldType).toBe('string')
      })
    })

    describe('getRelations', () => {
      it('should return all relation fields from a schema', async () => {
        const relations = await engine.getRelations('article')

        expect(relations).toHaveLength(2)
        expect(relations).toEqual(
          expect.arrayContaining([
            {
              fieldName: 'author',
              config: {
                relation: 'manyToOne',
                target: 'user',
              },
            },
            {
              fieldName: 'categories',
              config: {
                relation: 'manyToMany',
                target: 'category',
              },
            },
          ])
        )
      })

      it('should return empty array if schema has no relations', async () => {
        const relations = await engine.getRelations('user')
        expect(relations).toEqual([])
      })

      it('should return empty array for category schema', async () => {
        const relations = await engine.getRelations('category')
        expect(relations).toEqual([])
      })

      it('should throw error if content type does not exist', async () => {
        await expect(engine.getRelations('nonexistent')).rejects.toThrow(
          'Schema not found for content type: nonexistent'
        )
      })

      it('should handle schema with single relation', async () => {
        const commentSchema: ContentTypeSchema = {
          apiId: 'comment',
          displayName: 'Comment',
          singularName: 'comment',
          pluralName: 'comments',
          attributes: {
            text: { type: 'text' },
            article: {
              type: 'relation',
              relation: {
                relation: 'manyToOne',
                target: 'article',
              },
            },
          },
        }

        await engine.saveSchema('comment', commentSchema)

        const relations = await engine.getRelations('comment')
        expect(relations).toHaveLength(1)
        expect(relations[0]).toEqual({
          fieldName: 'article',
          config: {
            relation: 'manyToOne',
            target: 'article',
          },
        })
      })

      it('should handle all relation types', async () => {
        const testSchema: ContentTypeSchema = {
          apiId: 'test-relations',
          displayName: 'Test Relations',
          singularName: 'test-relation',
          pluralName: 'test-relations',
          attributes: {
            oneToOne: {
              type: 'relation',
              relation: {
                relation: 'oneToOne',
                target: 'user',
              },
            },
            oneToMany: {
              type: 'relation',
              relation: {
                relation: 'oneToMany',
                target: 'user',
              },
            },
            manyToOne: {
              type: 'relation',
              relation: {
                relation: 'manyToOne',
                target: 'user',
              },
            },
            manyToMany: {
              type: 'relation',
              relation: {
                relation: 'manyToMany',
                target: 'user',
              },
            },
          },
        }

        await engine.saveSchema('test-relations', testSchema)

        const relations = await engine.getRelations('test-relations')
        expect(relations).toHaveLength(4)
        
        const relationTypes = relations.map(r => r.config.relation)
        expect(relationTypes).toContain('oneToOne')
        expect(relationTypes).toContain('oneToMany')
        expect(relationTypes).toContain('manyToOne')
        expect(relationTypes).toContain('manyToMany')
      })
    })
  })
})
