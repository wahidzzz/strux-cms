# create-strux-app

Scaffold a new [Strux CMS](https://github.com/wahidzzz/jayson-cms) project in seconds.

## Quick Start

```bash
npx create-strux-app my-project
cd my-project
pnpm dev
```

## Usage

```bash
# Interactive mode (recommended)
npx create-strux-app

# With a project name
npx create-strux-app my-blog

# Skip all prompts (use defaults)
npx create-strux-app my-blog --yes
```

## Templates

| Template     | Description                        | Schemas Included       |
|--------------|------------------------------------|------------------------|
| **Blog**     | Articles + categories              | article, category      |
| **Portfolio**| Projects showcase                  | project                |
| **Docs**     | Documentation pages                | page                   |
| **Empty**    | Blank project, no starter schemas  | —                      |

## What Gets Scaffolded

```
my-project/
├── packages/
│   ├── core/       # Core engines
│   ├── api/        # REST API
│   └── admin/      # Admin panel (Next.js)
├── content/        # Your content (JSON)
├── schema/         # Content type definitions
├── uploads/        # Media files
├── .cms/           # System files
├── .env            # Environment variables
└── package.json
```

## Requirements

- **Node.js** ≥ 20.0.0
- **Git** ≥ 2.30
- **pnpm** ≥ 8.0 (recommended)

## License

MIT
