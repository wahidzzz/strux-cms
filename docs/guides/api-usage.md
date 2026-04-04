# API Usage

Strux provides a REST API for full CRUD operations on every content type. Endpoints are auto-generated from your schemas.

## Base URL

```
http://localhost:3000/api
```

## Endpoints

For a content type with `pluralName: "articles"`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/articles` | List all entries |
| `GET` | `/api/articles/:id` | Get single entry |
| `POST` | `/api/articles` | Create entry |
| `PUT` | `/api/articles/:id` | Update entry |
| `DELETE` | `/api/articles/:id` | Delete entry |

## Query Parameters

### Pagination

```bash
GET /api/articles?page=1&pageSize=10
```

Response includes pagination metadata:
```json
{
  "data": [...],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 42,
      "pageCount": 5
    }
  }
}
```

### Sorting

```bash
# Ascending
GET /api/articles?sort=title:asc

# Descending
GET /api/articles?sort=createdAt:desc
```

### Filtering

```bash
# Exact match
GET /api/articles?filters[is_featured]=true

# Multiple filters
GET /api/articles?filters[is_featured]=true&filters[category]=tutorials
```

### Population

```bash
# Specific relations
GET /api/articles?populate=author,category

# All relations
GET /api/articles?populate=*
```

### Search

```bash
GET /api/articles?search=hello
```

Full-text search across all string/text fields.

## Creating Entries

```bash
POST /api/articles
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "My New Article",
  "slug": "my-new-article",
  "content": "<p>Hello world!</p>",
  "is_featured": false,
  "category": "cat-001"
}
```

**Response** (201 Created):
```json
{
  "data": {
    "id": "abc12345",
    "title": "My New Article",
    "slug": "my-new-article",
    "content": "<p>Hello world!</p>",
    "is_featured": false,
    "category": "cat-001",
    "createdAt": "2026-04-04T12:00:00.000Z",
    "updatedAt": "2026-04-04T12:00:00.000Z"
  }
}
```

## Updating Entries

```bash
PUT /api/articles/abc12345
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "Updated Title",
  "is_featured": true
}
```

Only fields included in the body are updated. Omitted fields remain unchanged.

## Deleting Entries

```bash
DELETE /api/articles/abc12345
Authorization: Bearer <token>
```

## Error Responses

All errors follow a consistent format:

```json
{
  "error": {
    "status": 400,
    "name": "ValidationError",
    "message": "Missing required field: title",
    "details": {}
  }
}
```

| Status | Meaning |
|--------|---------|
| 400 | Validation error (missing/invalid fields) |
| 401 | Not authenticated |
| 403 | Forbidden (insufficient permissions) |
| 404 | Entry not found |
| 500 | Internal server error |

## Authentication

See the [Authentication guide](./authentication.md) for login, registration, and JWT token usage.
