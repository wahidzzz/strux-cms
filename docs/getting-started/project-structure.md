# Project Structure

## Overview

Strux is organized as a **Turborepo monorepo** with three main packages:

```
my-project/
├── packages/
│   ├── core/                  # Core business logic
│   │   └── src/
│   │       ├── engines/       # Modular engine system
│   │       │   ├── FileEngine.ts
│   │       │   ├── GitEngine.ts
│   │       │   ├── SchemaEngine.ts
│   │       │   ├── QueryEngine.ts
│   │       │   ├── RelationEngine.ts
│   │       │   ├── MediaEngine.ts
│   │       │   ├── AuthEngine.ts
│   │       │   ├── RBACEngine.ts
│   │       │   └── IndexEngine.ts
│   │       ├── utils/         # Shared utilities
│   │       └── index.ts       # Public API
│   │
│   ├── api/                   # REST API layer
│   │   └── src/
│   │       ├── routes/        # Express route handlers
│   │       ├── middleware/    # Auth, validation, error handling
│   │       └── server.ts      # Express app setup
│   │
│   └── admin/                 # Admin panel
│       ├── app/               # Next.js App Router pages
│       ├── components/        # React components
│       └── lib/               # Client utilities
│
├── content/                   # Content storage
│   └── api/                   # Entries organized by content type
│       ├── article/           # One directory per collection type
│       │   ├── abc123.json    # One file per entry
│       │   └── def456.json
│       └── category/
│
├── schema/                    # Content type definitions
│   ├── article.schema.json
│   ├── category.schema.json
│   └── components/            # Reusable component schemas
│
├── uploads/                   # Media file storage
├── .cms/                      # System files
│   ├── users/                 # User accounts (JSON)
│   ├── rbac.json              # Role-based access control
│   └── index/                 # Search indexes
│
├── .env                       # Environment variables
├── package.json               # Root workspace config
├── pnpm-workspace.yaml        # pnpm workspace definition
└── turbo.json                 # Build pipeline config
```

## Engine Architecture

The core package uses a modular **engine system** where each engine handles a specific domain:

| Engine | Responsibility |
|--------|---------------|
| `FileEngine` | File system CRUD, watching, atomic writes |
| `GitEngine` | Commit, branch, history, diff operations |
| `SchemaEngine` | Schema loading, validation, hot-reload |
| `QueryEngine` | Filtering, sorting, pagination, search |
| `RelationEngine` | Relationship resolution and population |
| `MediaEngine` | File upload, thumbnail generation |
| `AuthEngine` | User management, JWT, sessions |
| `RBACEngine` | Role-based access control |
| `IndexEngine` | In-memory search indexing |

## Content Storage Convention

Content entries follow this pattern:

```
content/api/{pluralName}/{id}.json
```

For example:
- `content/api/articles/abc123.json`
- `content/api/categories/cat001.json`

Each JSON file contains all the entry's data, including system fields:

```json
{
  "id": "abc123",
  "title": "My Article",
  "slug": "my-article",
  "content": "<p>Hello world</p>",
  "createdAt": "2026-04-04T12:00:00.000Z",
  "updatedAt": "2026-04-04T14:30:00.000Z",
  "createdBy": "user-001"
}
```

## Schema Convention

Schemas live in `schema/` and follow the naming pattern `{singularName}.schema.json`. See [Collection Types](../core-concepts/collection-types.md) for schema format details.
