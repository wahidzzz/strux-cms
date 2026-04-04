# Introduction

Strux is a **Git-native, JSON-based Content Management System** designed for developers who want full control over their content without the overhead of traditional databases.

## Philosophy

**Content-as-Code**: In Strux, everything — schemas, content entries, configuration — is a file. This means you can:

- **Version it** with Git (every save = a commit)
- **Branch it** for staging environments
- **Merge it** during team collaboration
- **Diff it** to see exactly what changed
- **Review it** in pull requests

## How It Works

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│  Admin Panel │────│   REST API   │────│  Core Engine  │
│  (Next.js)   │    │  (Express)   │    │ (TypeScript)  │
└─────────────┘    └──────────────┘    └──────────────┘
                                              │
                    ┌─────────────────────────┤
                    │                         │
              ┌─────────┐             ┌──────────┐
              │  JSON    │             │   Git    │
              │  Files   │             │  Engine  │
              └─────────┘             └──────────┘
```

1. Content is stored as **JSON files** in the `content/` directory
2. Schemas define the structure in the `schema/` directory  
3. The **Core Engine** reads, validates, and manages content
4. The **REST API** exposes CRUD endpoints for every content type
5. The **Admin Panel** provides a visual interface for content editors
6. The **Git Engine** automatically commits every change

## When to Use Strux

Strux is ideal for:

- **JAMstack sites** where content is consumed at build time
- **Documentation sites** that need versioned content
- **Small to medium projects** that don't need database infrastructure
- **Developer portfolios** and personal blogs
- **Prototyping** content-driven applications

## Key Features

| Feature | Description |
|---------|-------------|
| Zero Database | All content stored as JSON files |
| Git Versioning | Full history, author attribution, branching |
| Schema-First | Define content types with JSON schemas |
| Auto API | REST endpoints generated from schemas |
| Admin Panel | Modern Next.js admin interface |
| Relationships | One-to-one, one-to-many, many-to-many |
| Dynamic Zones | Flexible, composable content blocks |
| RBAC | Role-based access control |
| Media Uploads | Image and file management |
| TypeScript | Fully typed throughout |
