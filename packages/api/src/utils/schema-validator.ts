/**
 * Schema Validation Utilities
 * 
 * Provides validation functions for content type schemas before saving.
 * Validates schema structure, field names, field types, and naming conventions.
 * 
 * @module utils/schema-validator
 */

import type { ContentTypeSchema, FieldType } from '@cms/core'

/**
 * Reserved field names that cannot be used in content type schemas
 * These are system-managed fields automatically added to all content entries
 */
const RESERVED_FIELD_NAMES = [
  'id',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'createdBy',
  'updatedBy'
]

/**
 * Valid field types supported by the CMS
 */
const VALID_FIELD_TYPES: FieldType[] = [
  'string',
  'text',
  'richtext',
  'number',
  'boolean',
  'date',
  'datetime',
  'email',
  'password',
  'enumeration',
  'media',
  'relation',
  'component',
  'dynamiczone',
  'json',
  'uid'
]

/**
 * Validation error details
 */
export interface SchemaValidationError {
  field: string
  message: string
}

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
  valid: boolean
  errors: SchemaValidationError[]
}

/**
 * Validate a content type schema before saving
 * 
 * Checks:
 * 1. Required fields: apiId, displayName, singularName, pluralName, attributes
 * 2. Reserved field names: id, createdAt, updatedAt, publishedAt, createdBy, updatedBy
 * 3. Valid field types
 * 4. apiId format (kebab-case)
 * 5. singularName ≠ pluralName
 * 
 * @param schema - Content type schema to validate
 * @returns Validation result with errors if any
 */
export function validateSchema(schema: Partial<ContentTypeSchema>): SchemaValidationResult {
  const errors: SchemaValidationError[] = []

  // 1. Validate required fields
  if (!schema.apiId || typeof schema.apiId !== 'string' || schema.apiId.trim() === '') {
    errors.push({
      field: 'apiId',
      message: 'apiId is required and must be a non-empty string'
    })
  }

  if (!schema.displayName || typeof schema.displayName !== 'string' || schema.displayName.trim() === '') {
    errors.push({
      field: 'displayName',
      message: 'displayName is required and must be a non-empty string'
    })
  }

  if (!schema.singularName || typeof schema.singularName !== 'string' || schema.singularName.trim() === '') {
    errors.push({
      field: 'singularName',
      message: 'singularName is required and must be a non-empty string'
    })
  }

  if (!schema.pluralName || typeof schema.pluralName !== 'string' || schema.pluralName.trim() === '') {
    errors.push({
      field: 'pluralName',
      message: 'pluralName is required and must be a non-empty string'
    })
  }

  if (!schema.attributes || typeof schema.attributes !== 'object' || Object.keys(schema.attributes).length === 0) {
    errors.push({
      field: 'attributes',
      message: 'attributes is required and must be a non-empty object'
    })
  }

  // 4. Validate apiId format (kebab-case)
  if (schema.apiId && typeof schema.apiId === 'string') {
    const kebabCaseRegex = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
    if (!kebabCaseRegex.test(schema.apiId)) {
      errors.push({
        field: 'apiId',
        message: 'apiId must be in kebab-case format (lowercase letters, numbers, and hyphens only, starting with a letter)'
      })
    }
  }

  // 5. Validate singularName ≠ pluralName
  if (schema.singularName && schema.pluralName && schema.singularName === schema.pluralName) {
    errors.push({
      field: 'pluralName',
      message: 'pluralName must be different from singularName'
    })
  }

  // 2. Check for reserved field names and 3. Validate field types
  if (schema.attributes && typeof schema.attributes === 'object') {
    for (const [fieldName, fieldDef] of Object.entries(schema.attributes)) {
      // Check reserved field names
      if (RESERVED_FIELD_NAMES.includes(fieldName)) {
        errors.push({
          field: `attributes.${fieldName}`,
          message: `Field name '${fieldName}' is reserved and cannot be used`
        })
      }

      // Validate field type
      if (!fieldDef || typeof fieldDef !== 'object') {
        errors.push({
          field: `attributes.${fieldName}`,
          message: 'Field definition must be an object'
        })
        continue
      }

      if (!fieldDef.type) {
        errors.push({
          field: `attributes.${fieldName}.type`,
          message: 'Field type is required'
        })
      } else if (!VALID_FIELD_TYPES.includes(fieldDef.type)) {
        errors.push({
          field: `attributes.${fieldName}.type`,
          message: `Invalid field type '${fieldDef.type}'. Valid types are: ${VALID_FIELD_TYPES.join(', ')}`
        })
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Check if a field name is reserved
 * 
 * @param fieldName - Field name to check
 * @returns True if the field name is reserved
 */
export function isReservedFieldName(fieldName: string): boolean {
  return RESERVED_FIELD_NAMES.includes(fieldName)
}

/**
 * Check if a field type is valid
 * 
 * @param fieldType - Field type to check
 * @returns True if the field type is valid
 */
export function isValidFieldType(fieldType: string): boolean {
  return VALID_FIELD_TYPES.includes(fieldType as FieldType)
}

/**
 * Validate apiId format (kebab-case)
 * 
 * @param apiId - API ID to validate
 * @returns True if the apiId is in valid kebab-case format
 */
export function isValidApiId(apiId: string): boolean {
  const kebabCaseRegex = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
  return kebabCaseRegex.test(apiId)
}
