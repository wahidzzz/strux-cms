# Project Setup Guide

This document describes the initial project setup for the Strux CMS.

## Project Structure

The project is organized as a Turborepo monorepo with three main packages:

### Packages

1. **@cms/core** - Framework-agnostic core engines
   - Location: `packages/core/`
   - Purpose: Core business logic and data management
   - Dependencies: ajv, nanoid
   - Test framework: Vitest with fast-check for property-based testing

2. **@cms/api** - REST API layer
   - Location: `packages/api/`
   - Purpose: Strapi-compatible REST API endpoints
   - Dependencies: @cms/core, bcrypt, jsonwebtoken
   - Test framework: Vitest

3. **@cms/admin** - Admin UI
   - Location: `packages/admin/`
   - Purpose: Next.js 14 admin interface
   - Dependencies: @cms/core, Next.js 14, React 18, Tailwind CSS, Radix UI
   - Test framework: Vitest with jsdom

### Directory Structure

```
git-native-json-cms/
├── packages/
│   ├── core/              # Core engines package
│   │   ├── src/
│   │   │   ├── engines/   # Engine implementations (to be added)
│   │   │   ├── types/     # TypeScript type definitions
│   │   │   └── index.ts   # Package entry point
│   │   ├── tests/         # Test files (to be added)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   ├── api/               # API layer package
│   │   ├── src/
│   │   │   ├── routes/    # API route handlers (to be added)
│   │   │   └── index.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   └── admin/             # Admin UI package
│       ├── app/           # Next.js App Router
│       │   ├── globals.css
│       │   ├── layout.tsx
│       │   └── page.tsx
│       ├── components/    # React components (to be added)
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.js
│       ├── tailwind.config.ts
│       └── vitest.config.ts
├── content/               # Content storage directory
│   └── api/              # Content organized by type (to be created)
├── schema/               # Content type schemas
├── uploads/              # Media file storage
├── .cms/                 # System files
│   ├── rbac.json         # RBAC configuration (to be created)
│   ├── users.json        # User accounts (to be created)
│   ├── media.json        # Media metadata (to be created)
│   └── index.json        # Index cache (generated at runtime)
├── .git/                 # Git repository
├── package.json          # Root package.json with workspaces
├── turbo.json            # Turborepo configuration
├── .gitignore
└── README.md
```

## Configuration Files

### Root Configuration

- **package.json**: Workspace configuration with Turborepo scripts
- **turbo.json**: Build pipeline configuration for monorepo
- **.gitignore**: Git ignore patterns for dependencies, build outputs, and temporary files

### TypeScript Configuration

All packages use strict TypeScript configuration:
- Strict mode enabled
- No unused locals/parameters
- No implicit returns
- No fallthrough cases
- ES2022 target
- ESNext modules

### Testing Configuration

All packages use Vitest with:
- Coverage reporting (v8 provider)
- 80% coverage thresholds
- Node environment for core and api
- jsdom environment for admin

### Build System

Turborepo pipeline:
- **build**: Compiles TypeScript, builds Next.js
- **dev**: Watch mode for development
- **test**: Runs all tests
- **test:coverage**: Runs tests with coverage reporting
- **lint**: Lints all packages
- **clean**: Removes build artifacts

## Technology Stack

### Core Technologies
- **Node.js**: >= 20.0.0
- **TypeScript**: ^5.3.0 (strict mode)
- **Turborepo**: ^1.11.0 (monorepo management)

### Core Package
- **ajv**: ^8.12.0 (JSON Schema validation)
- **nanoid**: ^5.0.0 (ID generation)
- **vitest**: ^1.0.0 (testing)
- **fast-check**: ^3.15.0 (property-based testing)

### API Package
- **bcrypt**: ^5.1.0 (password hashing)
- **jsonwebtoken**: ^9.0.0 (JWT tokens)

### Admin Package
- **Next.js**: ^14.0.0 (framework)
- **React**: ^18.2.0 (UI library)
- **Tailwind CSS**: ^3.4.0 (styling)
- **Radix UI**: Various components (accessible UI primitives)
- **lucide-react**: ^0.294.0 (icons)

## Development Workflow

### Initial Setup

```bash
# Install dependencies
npm install

# Build all packages
npm run build
```

### Development

```bash
# Start all packages in watch mode
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint
```

### Package-Specific Commands

```bash
# Work on core package
cd packages/core
npm run dev        # Watch mode
npm test          # Run tests
npm run build     # Build

# Work on API package
cd packages/api
npm run dev       # Watch mode with tsx
npm test         # Run tests

# Work on admin package
cd packages/admin
npm run dev      # Next.js dev server
npm run build    # Production build
npm run start    # Production server
```

## Next Steps

The following components will be implemented in subsequent tasks:

1. **Core Engines** (Task 2-9):
   - File Engine: Atomic file operations
   - Schema Engine: JSON Schema validation
   - Git Engine: Git operations
   - Query Engine: In-memory indexing and queries
   - RBAC Engine: Role-based access control
   - Media Engine: File uploads and media library
   - Content Engine: CRUD operations and business logic

2. **API Layer** (Task 13-16):
   - Content routes
   - Schema routes
   - Media routes
   - Authentication routes

3. **Admin UI** (Task 18-22):
   - Content Manager
   - Content-Type Builder
   - Media Library
   - Settings

4. **Testing** (Task 24):
   - Property-based tests for all 15 correctness properties
   - Integration tests
   - Stress tests

5. **Documentation** (Task 26):
   - API documentation
   - Developer guide
   - Deployment guide

## Git Repository

The project is initialized as a Git repository with:
- Main branch: `main`
- Initial commit: Project setup with all configuration files
- .gitignore: Configured to ignore node_modules, build outputs, and temporary files

All content changes will be versioned in Git as part of the CMS functionality.

## Requirements Validation

This setup satisfies the following requirements:

- **Requirement 9.1**: System initialization with directory structure
- **NFR-1**: TypeScript strict mode for all packages
- **NFR-2**: Vitest configured with coverage reporting (80% threshold)
- **NFR-14**: Comprehensive testing setup with property-based testing support

## Troubleshooting

### Common Issues

1. **Node version mismatch**: Ensure Node.js >= 20.0.0
2. **Build failures**: Run `npm run clean` then `npm install`
3. **Test failures**: Ensure all packages are built with `npm run build`

### Verification

To verify the setup is correct:

```bash
# Check Node version
node --version  # Should be >= 20.0.0

# Install and build
npm install
npm run build

# Run tests
npm test

# Should see all tests passing
```
