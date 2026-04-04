# API Endpoints Reference

All endpoints are relative to the base URL (default: `http://localhost:3000`).

## Content API

For each content type with `pluralName`, the following routes are generated:

### Collection Types

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/:pluralName` | No | List entries (paginated) |
| `GET` | `/api/:pluralName/:id` | No | Get single entry |
| `POST` | `/api/:pluralName` | Yes | Create entry |
| `PUT` | `/api/:pluralName/:id` | Yes | Update entry |
| `DELETE` | `/api/:pluralName/:id` | Yes | Delete entry |

### Single Types

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/:singularName` | No | Get content |
| `PUT` | `/api/:singularName` | Yes | Update content |

## Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Create a new user |
| `POST` | `/api/auth/login` | Get access + refresh tokens |
| `POST` | `/api/auth/refresh` | Refresh an expired access token |
| `GET` | `/api/auth/me` | Get current user profile |

## Schema Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/schemas` | Yes | List all schemas |
| `GET` | `/api/schemas/:apiId` | Yes | Get single schema |
| `POST` | `/api/schemas` | Yes (admin) | Create a new schema |
| `PUT` | `/api/schemas/:apiId` | Yes (admin) | Update a schema |
| `DELETE` | `/api/schemas/:apiId` | Yes (admin) | Delete a schema |

## Media Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/upload` | Yes | Upload file(s) |
| `GET` | `/api/uploads` | No | List uploaded files |
| `DELETE` | `/api/uploads/:filename` | Yes | Delete an uploaded file |

## Query Parameters

### Pagination

| Parameter | Default | Description |
|-----------|---------|-------------|
| `page` | `1` | Page number |
| `pageSize` | `25` | Items per page (max 100) |

### Sorting

| Parameter | Example | Description |
|-----------|---------|-------------|
| `sort` | `title:asc` | Sort by field, `asc` or `desc` |

### Filtering

| Parameter | Example | Description |
|-----------|---------|-------------|
| `filters[field]` | `filters[is_featured]=true` | Exact match |

### Population

| Parameter | Example | Description |
|-----------|---------|-------------|
| `populate` | `author,category` | Include related entries |
| `populate` | `*` | Include all relations |

### Search

| Parameter | Example | Description |
|-----------|---------|-------------|
| `search` | `hello world` | Full-text search across string fields |

## Response Format

### Success (single)

```json
{
  "data": { "id": "...", ...fields }
}
```

### Success (list)

```json
{
  "data": [...],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 25,
      "total": 100,
      "pageCount": 4
    }
  }
}
```

### Error

```json
{
  "error": {
    "status": 400,
    "name": "ValidationError",
    "message": "...",
    "details": {}
  }
}
```
