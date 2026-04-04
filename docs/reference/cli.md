# CLI Reference

## `create-strux-app`

Interactive CLI to scaffold new Strux CMS projects.

### Usage

```bash
npx create-strux-app my-project
```

Or with a specific package manager:

```bash
pnpm dlx create-strux-app my-project
bunx create-strux-app my-project
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `project-name` | No | Directory name for the project. If omitted, the CLI will prompt for it. |

### Interactive Prompts

1. **Project name** — Directory name (if not provided as argument)
2. **Template** — Starter template to use:
   - `blog` — Blog with articles, categories, and authors
   - `portfolio` — Portfolio with projects and case studies
   - `docs` — Documentation site with pages and navigation
   - `empty` — Blank project with no starter content
3. **Git init** — Initialize a Git repository (default: yes)
4. **Install dependencies** — Auto-install with detected package manager (default: yes)

### What It Does

1. Creates the project directory
2. Clones the Strux CMS core files
3. Writes starter schemas for the selected template
4. Generates sample content entries
5. Creates a `.env` file with a secure `JWT_SECRET`
6. Initializes a Git repository (if selected)
7. Installs dependencies (if selected)

### Output Structure

```
my-project/
├── .env
├── .gitignore
├── package.json
├── pnpm-workspace.yaml
├── schema/
│   ├── *.schema.json      # From selected template
│   └── components/
├── content/
│   └── api/               # Sample content
├── packages/
│   ├── core/
│   ├── api/
│   └── admin/
└── uploads/
```

### Requirements

- **Node.js** 18 or later
- **Git** (for repository initialization)
- **pnpm** recommended (npm and yarn also supported)
