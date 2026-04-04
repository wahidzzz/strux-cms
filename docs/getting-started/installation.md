# Installation

## Prerequisites

| Dependency | Version | Required |
|------------|---------|----------|
| Node.js | ≥ 20.0.0 | Yes |
| Git | ≥ 2.30 | Yes |
| pnpm | ≥ 8.0 | Recommended |

## Quick Start (Recommended)

Use the `create-strux-app` CLI to scaffold a new project:

```bash
npx create-strux-app my-project
cd my-project
pnpm dev
```

The CLI will:
1. Clone the latest Strux CMS
2. Ask you to choose a starter template (blog, portfolio, docs, or empty)
3. Set up schemas and sample content
4. Generate a `.env` file with a JWT secret
5. Initialize a Git repository
6. Install dependencies

## Manual Setup

If you prefer manual control:

```bash
# Clone the repository
git clone https://github.com/wahidzzz/jayson-cms.git my-project
cd my-project

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start development servers
pnpm dev
```

## Environment Variables

Create a `.env` file in the project root:

```env
JWT_SECRET=your-secret-key-here
PORT=3000
NODE_ENV=development
```

> ⚠️ **Important**: Always set a strong, unique `JWT_SECRET` in production.

## Development Servers

After `pnpm dev`, two servers will start:

| Service | URL | Description |
|---------|-----|-------------|
| API | http://localhost:3000 | REST API endpoints |
| Admin | http://localhost:3001 | Admin panel UI |

## First Steps

1. Open the admin panel at `http://localhost:3001`
2. Register the first user (becomes admin automatically)
3. Create your first content entry
4. Query it via the API at `http://localhost:3000/api/{pluralName}`

## Troubleshooting

### Port already in use
Change the `PORT` variable in `.env` or kill the existing process.

### Git not found
Strux requires Git for content versioning. Install it from [git-scm.com](https://git-scm.com).

### Node version too old
Strux requires Node.js 20+. Use [nvm](https://github.com/nvm-sh/nvm) to manage versions:
```bash
nvm install 20
nvm use 20
```
