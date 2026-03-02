# Field-Level Permissions

## Overview

The RBAC Engine supports field-level permissions, allowing you to control which fields users can access based on their role. This is useful for hiding sensitive information from certain user roles.

## Configuration

Field-level permissions are configured in the `.cms/rbac.json` file. Each permission can optionally specify a `fields` array that lists the fields accessible for that permission.

### Example Configuration

```json
{
  "roles": {
    "restricted": {
      "id": "restricted",
      "name": "Restricted User",
      "description": "Limited field access",
      "type": "custom",
      "permissions": [
        {
          "action": "read",
          "subject": "articles",
          "fields": ["id", "title", "content", "publishedAt"]
        }
      ]
    }
  }
}
```

In this example, users with the `restricted` role can only access the `id`, `title`, `content`, and `publishedAt` fields of articles. All other fields will be filtered out.

## API Methods

### `canAccessField(context, contentType, field)`

Check if a user can access a specific field.

**Parameters:**
- `context`: Request context with user and role information
- `contentType`: Content type being accessed (e.g., "articles")
- `field`: Field name to check

**Returns:** `boolean` - `true` if field access is allowed, `false` otherwise

**Example:**
```typescript
const context = { role: 'restricted' }
const canAccess = rbacEngine.canAccessField(context, 'articles', 'secret')
// Returns: false
```

### `filterFields(context, contentType, entry)`

Filter fields from a single entry based on role permissions.

**Parameters:**
- `context`: Request context with user and role information
- `contentType`: Content type being accessed
- `entry`: Entry object to filter

**Returns:** Filtered entry with only accessible fields (always includes `id`)

**Example:**
```typescript
const context = { role: 'restricted' }
const entry = {
  id: '1',
  title: 'Article Title',
  content: 'Article content',
  secret: 'sensitive-data',
  author: 'user-1'
}

const filtered = rbacEngine.filterFields(context, 'articles', entry)
// Returns: { id: '1', title: 'Article Title', content: 'Article content' }
```

### `filterFieldsMany(context, contentType, entries)`

Filter fields from multiple entries based on role permissions.

**Parameters:**
- `context`: Request context with user and role information
- `contentType`: Content type being accessed
- `entries`: Array of entry objects to filter

**Returns:** Array of filtered entries

**Example:**
```typescript
const context = { role: 'restricted' }
const entries = [
  { id: '1', title: 'Article 1', secret: 'secret-1' },
  { id: '2', title: 'Article 2', secret: 'secret-2' }
]

const filtered = rbacEngine.filterFieldsMany(context, 'articles', entries)
// Returns: [
//   { id: '1', title: 'Article 1' },
//   { id: '2', title: 'Article 2' }
// ]
```

## Integration with Query Engine

When implementing API endpoints, you should filter query results based on field-level permissions:

```typescript
// Example API endpoint
async function getArticles(context: RequestContext) {
  // Execute query
  const results = await queryEngine.query('articles', {
    filters: { publishedAt: { $notNull: true } }
  })
  
  // Filter fields based on permissions
  const filtered = rbacEngine.filterFieldsMany(context, 'articles', results)
  
  return filtered
}
```

## Permission Behavior

### No Field Restrictions

If a permission has no `fields` array or an empty array, the user has access to **all fields**:

```json
{
  "action": "read",
  "subject": "articles"
  // No fields specified = access to all fields
}
```

### Multiple Permissions

If a role has multiple permissions for the same content type, the fields from all permissions are **combined**:

```json
{
  "permissions": [
    {
      "action": "read",
      "subject": "articles",
      "fields": ["title", "content"]
    },
    {
      "action": "update",
      "subject": "articles",
      "fields": ["content", "updatedAt"]
    }
  ]
}
```

In this case, the user can access: `id`, `title`, `content`, and `updatedAt`.

### Always Accessible Fields

The `id` field is **always included** in filtered results, regardless of field restrictions. This ensures that entries can always be identified.

## Best Practices

1. **Always filter at the API layer**: Apply field filtering after querying data but before returning it to the client.

2. **Use specific field lists**: Be explicit about which fields are accessible rather than relying on defaults.

3. **Consider nested data**: If your entries contain nested objects or relations, you may need to apply field filtering recursively.

4. **Test thoroughly**: Use the provided test suite as a reference for testing field-level permissions in your application.

5. **Document field restrictions**: Clearly document which fields are accessible to each role in your API documentation.

## Validation: Requirement 6.9

This implementation validates Requirement 6.9:

> WHERE field-level permissions are defined, THE RBAC_Engine SHALL filter response data to include only permitted fields

The `filterFields` and `filterFieldsMany` methods ensure that only permitted fields are included in response data based on the role's field-level permissions.
