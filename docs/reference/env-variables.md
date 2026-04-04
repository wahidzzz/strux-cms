# Environment Variables

All environment variables are configured in the `.env` file at the project root.

## Required

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Secret key for signing JWT tokens. Must be a strong, random string. Generated automatically by `create-strux-app`. |

## Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port for the API server |
| `ADMIN_PORT` | `3001` | Port for the admin panel dev server |
| `NODE_ENV` | `development` | Environment: `development`, `production`, or `test` |
| `CONTENT_DIR` | `./content` | Path to content storage directory |
| `SCHEMA_DIR` | `./schema` | Path to schema definitions directory |
| `UPLOADS_DIR` | `./uploads` | Path to uploaded media files |
| `LOG_LEVEL` | `info` | Logging level: `debug`, `info`, `warn`, `error` |

## Example `.env` File

```env
# Required
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0-your-secret-key

# Server
PORT=3000
ADMIN_PORT=3001
NODE_ENV=development

# Paths (relative to project root)
CONTENT_DIR=./content
SCHEMA_DIR=./schema
UPLOADS_DIR=./uploads

# Logging
LOG_LEVEL=info
```

## Security Notes

- **Never commit `.env` to version control** — it's already in `.gitignore`
- Generate a strong `JWT_SECRET` using: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- In production, use environment variable injection from your hosting platform rather than a `.env` file
