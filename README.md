# Git-Native JSON CMS

A production-grade content management system that uses JSON file-based storage and Git versioning instead of a traditional database. Built with TypeScript, Next.js 14, and a framework-agnostic core engine architecture.

## Features

- **JSON File Storage**: Content stored as JSON files for simplicity and portability
- **Git Versioning**: Every content change is versioned in Git for complete history tracking
- **Strapi-Compatible API**: REST API compatible with Strapi's query syntax
- **High Performance**: <50ms average read latency, <3s boot time for 10k entries
- **Concurrent Operations**: Supports 200 concurrent reads, 20 concurrent writes
- **Framework-Agnostic Core**: Core engines can be used independently
- **TypeScript**: Strict TypeScript for type safety
- **Property-Based Testing**: Comprehensive testing with fast-check

## Architecture

The system follows a layered modular architecture:

- **Core Package** (`@cms/core`): Framework-agnostic engines for content management
  - File Engine: Atomic file operations with concurrency control
  - Schema Engine: JSON Schema validation with AJV
  - Content Engine: CRUD operations and business logic
  - Query Engine: In-memory indexing and Strapi-compatible queries
  - Git Engine: Git operations for versioning
  - RBAC Engine: Role-based access control
  - Media Engine: File uploads and media library

- **API Package** (`@cms/api`): REST API layer with Strapi-compatible endpoints

- **Admin Package** (`@cms/admin`): Next.js 14 admin UI with App Router

## Project Structure

```
git-native-json-cms/
├── packages/
│   ├── core/          # Core engines (framework-agnostic)
│   ├── api/           # REST API layer
│   └── admin/         # Next.js admin UI
├── content/           # Content entries (JSON files)
├── schema/            # Content type schemas
├── uploads/           # Media files
├── .cms/              # System files (RBAC, users, media metadata)
└── .git/              # Git repository
```

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Git

### Installation

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test
```

### Development

```bash
# Start development mode (watches for changes)
npm run dev

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Technology Stack

- **TypeScript**: Strict type safety
- **Turborepo**: Monorepo build system
- **Vitest**: Unit and integration testing
- **fast-check**: Property-based testing
- **Next.js 14**: Admin UI framework
- **Tailwind CSS**: Styling
- **Radix UI**: Accessible UI components
- **AJV**: JSON Schema validation
- **bcrypt**: Password hashing
- **JWT**: Authentication tokens

## Performance Targets

| Metric | Target |
|--------|--------|
| Boot time (10k entries) | <3s |
| Average read latency | <50ms |
| Write latency (p95) | <200ms |
| Concurrent reads | 200 |
| Concurrent writes | 20 |
| Total entries | 100k |
| Entries per type | 10k |

## Testing

The project includes comprehensive testing:

- **Unit Tests**: Test individual engines and functions
- **Property-Based Tests**: Test correctness properties with fast-check
- **Integration Tests**: Test complete workflows
- **Stress Tests**: Test performance under load

Target: >80% code coverage for all packages

## License

MIT

## Status

🚧 **Under Development** - Core infrastructure complete, engines in progress
