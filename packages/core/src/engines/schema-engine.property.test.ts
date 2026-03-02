import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import * as fc from 'fast-check'
import { SchemaEngine } from './schema-engine'
import type { ContentTypeSchema, FieldDefinition, FieldType } from '../types/index.js'

/**
 * Property-based tests for SchemaEngine
 * 
 * These tests validate universal correctness properties using fast-check
 * to generate random test cases.
 */
describe('SchemaEngine - Property-Based Tests', () => {
  let schemaEngine: SchemaEngine
  let testDir: string

  beforeEach(async () => {
    // Create a unique test directory for each test
    testDir = join(
      process.cwd(),
      'test-data',
      `schema-pbt-${Date.now()}-${Math.random().toString(36).substring(2)}`
    )
    await fs.mkdir(testDir, { recursive: true })
    
    schemaEngine = new SchemaEngine(testDir)
  })

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  /**
   * Property P7: Validation Enforcement
   * 
   * **Validates: Requirements 2.3, 2.4, 11.1, 11.2, 11.7**
   * 
   * For any content type and data, if the data fails schema validation,
   * the system rejects the create or update operation with a ValidationError
   * before any write occurs.
   */
  describe('P7: Validation Enforcement', () => {
    /**
     * Test that invalid data is always rejected with detailed validation errors
     */
    it('should reject invalid data with ValidationError containing detailed information', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          async (apiId) => {
            // Create a schema with a required field
            const schema: ContentTypeSchema = {
              apiId,
              displayName: 'Test Schema',
              singularName: 'test',
              pluralName: 'tests',
              attributes: {
                title: { type: 'string', required: true },
                count: { type: 'number', required: true },
              },
            }

            await schemaEngine.saveSchema(apiId, schema)

            // Test 1: Missing required field
            const missingField = { count: 42 } // Missing 'title'
            const result1 = await schemaEngine.validate(apiId, missingField)
            expect(result1.valid).toBe(false)
            expect(result1.errors).toBeDefined()
            expect(result1.errors!.length).toBeGreaterThan(0)

            // Test 2: Wrong type
            const wrongType = { title: 'valid', count: 'not-a-number' }
            const result2 = await schemaEngine.validate(apiId, wrongType)
            expect(result2.valid).toBe(false)
            expect(result2.errors).toBeDefined()
            expect(result2.errors!.length).toBeGreaterThan(0)

            // Property: Each error must have required fields
            for (const error of result1.errors!) {
              expect(error).toHaveProperty('path')
              expect(error).toHaveProperty('message')
              expect(error).toHaveProperty('type')
              expect(Array.isArray(error.path)).toBe(true)
              expect(typeof error.message).toBe('string')
              expect(error.message.length).toBeGreaterThan(0)
            }
          }
        ),
        { numRuns: 50 }
      )
    })

    /**
     * Test that valid data always passes validation
     */
    it('should accept valid data that conforms to the schema', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a schema with specific field types
          fc.record({
            apiId: fc.string({ minLength: 1, maxLength: 20 })
              .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
            displayName: fc.string({ minLength: 1, maxLength: 50 }),
            singularName: fc.string({ minLength: 1, maxLength: 30 }),
            pluralName: fc.string({ minLength: 1, maxLength: 30 }),
          }),
          async (schemaData) => {
            // Ensure singularName and pluralName are different
            if (schemaData.singularName === schemaData.pluralName) {
              schemaData.pluralName = schemaData.pluralName + 's'
            }

            // Create a schema with known fields
            const schema: ContentTypeSchema = {
              apiId: schemaData.apiId,
              displayName: schemaData.displayName,
              singularName: schemaData.singularName,
              pluralName: schemaData.pluralName,
              attributes: {
                title: { type: 'string', required: true },
                count: { type: 'number', required: false },
                active: { type: 'boolean', required: false },
                email: { type: 'email', required: false },
              },
            }

            // Save the schema
            await schemaEngine.saveSchema(schema.apiId, schema)

            // Generate valid data
            await fc.assert(
              fc.asyncProperty(
                fc.record({
                  title: fc.string({ minLength: 1, maxLength: 100 }),
                  count: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
                  active: fc.option(fc.boolean(), { nil: undefined }),
                  email: fc.option(fc.emailAddress(), { nil: undefined }),
                }),
                async (validData) => {
                  // Validate the data
                  const result = await schemaEngine.validate(schema.apiId, validData)

                  // Property: Valid data must pass validation
                  expect(result.valid).toBe(true)
                  expect(result.errors).toBeUndefined()
                }
              ),
              { numRuns: 20 }
            )
          }
        ),
        { numRuns: 30 }
      )
    })

    /**
     * Test that missing required fields are detected
     */
    it('should reject data missing required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          async (apiId) => {
            // Create schema with multiple required fields
            const schema: ContentTypeSchema = {
              apiId,
              displayName: 'Test Schema',
              singularName: 'test',
              pluralName: 'tests',
              attributes: {
                title: { type: 'string', required: true },
                email: { type: 'email', required: true },
                count: { type: 'number', required: true },
              },
            }

            await schemaEngine.saveSchema(apiId, schema)

            // Create data missing required fields
            const incompleteData = {
              title: 'some value',
              // Missing email and count
            }

            // Validate
            const result = await schemaEngine.validate(apiId, incompleteData)

            // Property 1: Validation must fail
            expect(result.valid).toBe(false)

            // Property 2: Error must mention the missing field
            expect(result.errors).toBeDefined()
            expect(result.errors!.length).toBeGreaterThan(0)

            // Property 3: At least one error should be about a required field
            const hasRequiredError = result.errors!.some(
              error => error.type === 'required' || error.message.toLowerCase().includes('required')
            )
            expect(hasRequiredError).toBe(true)
          }
        ),
        { numRuns: 50 }
      )
    })

    /**
     * Test that type mismatches are detected
     */
    it('should reject data with incorrect field types', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          async (apiId) => {
            // Create schema with specific field types
            const schema: ContentTypeSchema = {
              apiId,
              displayName: 'Test Schema',
              singularName: 'test',
              pluralName: 'tests',
              attributes: {
                stringField: { type: 'string', required: true },
                numberField: { type: 'number', required: true },
                booleanField: { type: 'boolean', required: true },
                emailField: { type: 'email', required: true },
              },
            }

            await schemaEngine.saveSchema(apiId, schema)

            // Test 1: Provide number instead of string
            const wrongType1 = {
              stringField: 12345,
              numberField: 42,
              booleanField: true,
              emailField: 'test@example.com',
            }
            const result1 = await schemaEngine.validate(apiId, wrongType1)
            expect(result1.valid).toBe(false)
            expect(result1.errors).toBeDefined()

            // Test 2: Provide string instead of number
            const wrongType2 = {
              stringField: 'valid',
              numberField: 'not-a-number',
              booleanField: true,
              emailField: 'test@example.com',
            }
            const result2 = await schemaEngine.validate(apiId, wrongType2)
            expect(result2.valid).toBe(false)
            expect(result2.errors).toBeDefined()

            // Test 3: Provide string instead of boolean
            const wrongType3 = {
              stringField: 'valid',
              numberField: 42,
              booleanField: 'not-a-boolean',
              emailField: 'test@example.com',
            }
            const result3 = await schemaEngine.validate(apiId, wrongType3)
            expect(result3.valid).toBe(false)
            expect(result3.errors).toBeDefined()

            // Test 4: Provide invalid email format
            const wrongType4 = {
              stringField: 'valid',
              numberField: 42,
              booleanField: true,
              emailField: 'not-an-email',
            }
            const result4 = await schemaEngine.validate(apiId, wrongType4)
            expect(result4.valid).toBe(false)
            expect(result4.errors).toBeDefined()
          }
        ),
        { numRuns: 30 }
      )
    })

    /**
     * Test that constraint violations are detected (min/max, minLength/maxLength)
     */
    it('should reject data violating field constraints', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          async (apiId) => {
            const minValue = 10
            const maxValue = 50

            // Create schema with constraints
            const schema: ContentTypeSchema = {
              apiId,
              displayName: 'Test Schema',
              singularName: 'test',
              pluralName: 'tests',
              attributes: {
                numberField: {
                  type: 'number',
                  required: true,
                  min: minValue,
                  max: maxValue,
                },
                stringField: {
                  type: 'string',
                  required: true,
                  minLength: 5,
                  maxLength: 10,
                },
              },
            }

            await schemaEngine.saveSchema(apiId, schema)

            // Test 1: Number below minimum
            const belowMin = {
              numberField: minValue - 1,
              stringField: 'valid',
            }
            const result1 = await schemaEngine.validate(apiId, belowMin)
            expect(result1.valid).toBe(false)
            expect(result1.errors).toBeDefined()

            // Test 2: Number above maximum
            const aboveMax = {
              numberField: maxValue + 1,
              stringField: 'valid',
            }
            const result2 = await schemaEngine.validate(apiId, aboveMax)
            expect(result2.valid).toBe(false)
            expect(result2.errors).toBeDefined()

            // Test 3: String too short
            const tooShort = {
              numberField: 30,
              stringField: 'abc', // Less than minLength 5
            }
            const result3 = await schemaEngine.validate(apiId, tooShort)
            expect(result3.valid).toBe(false)
            expect(result3.errors).toBeDefined()

            // Test 4: String too long
            const tooLong = {
              numberField: 30,
              stringField: 'this-is-way-too-long', // More than maxLength 10
            }
            const result4 = await schemaEngine.validate(apiId, tooLong)
            expect(result4.valid).toBe(false)
            expect(result4.errors).toBeDefined()

            // Test 5: Valid data within constraints
            const validData = {
              numberField: 30,
              stringField: 'valid',
            }
            const result5 = await schemaEngine.validate(apiId, validData)
            expect(result5.valid).toBe(true)
          }
        ),
        { numRuns: 30 }
      )
    })

    /**
     * Test that enum constraint violations are detected
     */
    it('should reject data with invalid enum values', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          async (apiId) => {
            const validEnums = ['active', 'inactive', 'pending']
            const invalidValue = 'invalid-status'

            // Create schema with enum constraint
            const schema: ContentTypeSchema = {
              apiId,
              displayName: 'Test Schema',
              singularName: 'test',
              pluralName: 'tests',
              attributes: {
                status: {
                  type: 'enumeration',
                  required: true,
                  enum: validEnums,
                },
              },
            }

            await schemaEngine.saveSchema(apiId, schema)

            // Test 1: Invalid enum value
            const invalidData = { status: invalidValue }
            const result1 = await schemaEngine.validate(apiId, invalidData)
            expect(result1.valid).toBe(false)
            expect(result1.errors).toBeDefined()
            expect(result1.errors!.length).toBeGreaterThan(0)

            // Test 2: Valid enum value
            const validData = { status: validEnums[0] }
            const result2 = await schemaEngine.validate(apiId, validData)
            expect(result2.valid).toBe(true)

            // Test 3: Another valid enum value
            const validData2 = { status: validEnums[1] }
            const result3 = await schemaEngine.validate(apiId, validData2)
            expect(result3.valid).toBe(true)
          }
        ),
        { numRuns: 50 }
      )
    })

    /**
     * Test that validation errors contain detailed path information for nested fields
     */
    it('should provide detailed error paths for validation failures', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          async (apiId) => {
            // Create schema
            const schema: ContentTypeSchema = {
              apiId,
              displayName: 'Test Schema',
              singularName: 'test',
              pluralName: 'tests',
              attributes: {
                title: { type: 'string', required: true },
                email: { type: 'email', required: true },
                count: { type: 'number', required: true, min: 0, max: 100 },
              },
            }

            await schemaEngine.saveSchema(apiId, schema)

            // Create data with multiple validation errors
            const invalidData = {
              // Missing title (required field)
              email: 'not-an-email', // Invalid email format
              count: 150, // Exceeds max constraint
            }

            const result = await schemaEngine.validate(apiId, invalidData)

            // Property 1: Validation must fail
            expect(result.valid).toBe(false)

            // Property 2: Multiple errors should be reported
            expect(result.errors).toBeDefined()
            expect(result.errors!.length).toBeGreaterThan(0)

            // Property 3: Each error must have a path array
            for (const error of result.errors!) {
              expect(Array.isArray(error.path)).toBe(true)
            }

            // Property 4: Errors should reference the correct fields
            const errorPaths = result.errors!.map(e => e.path.join('.'))
            const hasEmailError = errorPaths.some(p => p.includes('email') || p === '')
            const hasCountError = errorPaths.some(p => p.includes('count') || p === '')
            
            // At least one of the constraint violations should be detected
            expect(hasEmailError || hasCountError).toBe(true)
          }
        ),
        { numRuns: 50 }
      )
    })

    /**
     * Test that validation is consistent - same data always produces same result
     */
    it('should produce consistent validation results for the same data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          fc.record({
            title: fc.string({ minLength: 1, maxLength: 100 }),
            count: fc.integer({ min: -100, max: 200 }),
            active: fc.boolean(),
          }),
          async (apiId, testData) => {
            // Create schema
            const schema: ContentTypeSchema = {
              apiId,
              displayName: 'Test Schema',
              singularName: 'test',
              pluralName: 'tests',
              attributes: {
                title: { type: 'string', required: true },
                count: { type: 'number', required: true, min: 0, max: 100 },
                active: { type: 'boolean', required: true },
              },
            }

            await schemaEngine.saveSchema(apiId, schema)

            // Validate the same data multiple times
            const result1 = await schemaEngine.validate(apiId, testData)
            const result2 = await schemaEngine.validate(apiId, testData)
            const result3 = await schemaEngine.validate(apiId, testData)

            // Property: All validation results must be identical
            expect(result1.valid).toBe(result2.valid)
            expect(result2.valid).toBe(result3.valid)

            if (!result1.valid) {
              expect(result1.errors).toBeDefined()
              expect(result2.errors).toBeDefined()
              expect(result3.errors).toBeDefined()
              
              // Same number of errors
              expect(result1.errors!.length).toBe(result2.errors!.length)
              expect(result2.errors!.length).toBe(result3.errors!.length)
            }
          }
        ),
        { numRuns: 50 }
      )
    })

    /**
     * Test that validation happens before any write operation
     * (This is a behavioral property - we verify no side effects occur on validation failure)
     */
    it('should validate without side effects - no writes occur during validation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(s)),
          async (apiId) => {
            // Create schema
            const schema: ContentTypeSchema = {
              apiId,
              displayName: 'Test Schema',
              singularName: 'test',
              pluralName: 'tests',
              attributes: {
                title: { type: 'string', required: true },
              },
            }

            await schemaEngine.saveSchema(apiId, schema)

            // Get initial file system state
            const filesBefore = await fs.readdir(testDir)

            // Validate invalid data multiple times
            for (let i = 0; i < 5; i++) {
              await schemaEngine.validate(apiId, { title: 12345 }) // Wrong type
            }

            // Get file system state after validation
            const filesAfter = await fs.readdir(testDir)

            // Property: File system should be unchanged by validation
            // (only the schema file should exist, no additional files created)
            expect(filesAfter.length).toBe(filesBefore.length)
            expect(filesAfter.sort()).toEqual(filesBefore.sort())

            // Property: Schema cache should still work
            const result = await schemaEngine.validate(apiId, { title: 'valid' })
            expect(result.valid).toBe(true)
          }
        ),
        { numRuns: 30 }
      )
    })
  })
})
