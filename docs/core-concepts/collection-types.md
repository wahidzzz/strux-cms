# Collection Types

Collection types represent content with **multiple entries** — like blog posts, products, users, or categories. Each entry is stored as an individual JSON file.

## Defining a Collection Type

Create a JSON schema file in the `schema/` directory:

```json
// schema/article.schema.json
{
  "displayName": "Article",
  "kind": "collectionType",
  "singularName": "article",
  "pluralName": "articles",
  "description": "Blog posts and news articles.",
  "apiId": "article",
  "attributes": {
    "title": {
      "type": "string",
      "required": true
    },
    "slug": {
      "type": "uid",
      "targetField": "title",
      "required": true
    },
    "content": {
      "type": "richtext",
      "required": true
    },
    "is_featured": {
      "type": "boolean",
      "required": false
    }
  }
}
```

## Schema Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `displayName` | string | ✅ | Human-readable name shown in the admin |
| `kind` | string | ✅ | Must be `"collectionType"` |
| `singularName` | string | ✅ | Singular form (e.g., "article") |
| `pluralName` | string | ✅ | Plural form used in API routes (e.g., "articles") |
| `description` | string | ❌ | Optional description |
| `apiId` | string | ✅ | Unique API identifier |
| `attributes` | object | ✅ | Field definitions |

## Auto-Generated API

Once a schema is saved, Strux automatically creates these endpoints:

| Method | Endpoint | Action |
|--------|----------|--------|
| `GET` | `/api/articles` | List all entries |
| `GET` | `/api/articles/:id` | Get single entry |
| `POST` | `/api/articles` | Create entry |
| `PUT` | `/api/articles/:id` | Update entry |
| `DELETE` | `/api/articles/:id` | Delete entry |

## File Storage

Each entry is stored as a JSON file:

```
content/api/articles/
├── a1b2c3d4.json
├── e5f6a7b8.json
└── c9d0e1f2.json
```

System fields (`id`, `createdAt`, `updatedAt`, `createdBy`) are added automatically.

## Hot Reload

Strux watches the `schema/` directory for changes. When you modify a schema file, the changes are reflected immediately in the API and admin panel — no restart required.
