# Deployment

Strux can be deployed anywhere Node.js runs. Since content is stored as files, no database provisioning is required.

## Self-Hosted (VPS / VM)

```bash
# Build all packages for production
pnpm build

# Start the server
NODE_ENV=production pnpm start

# Or use PM2 for process management
pm2 start npm --name "strux-api" -- run start:api
pm2 start npm --name "strux-admin" -- run start:admin
```

## Docker

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files first for better layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/api/package.json ./packages/api/
COPY packages/admin/package.json ./packages/admin/

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# Expose ports
EXPOSE 3000 3001

CMD ["pnpm", "start"]
```

Build and run:
```bash
docker build -t strux-cms .
docker run -p 3000:3000 -p 3001:3001 \
  -v $(pwd)/content:/app/content \
  -v $(pwd)/uploads:/app/uploads \
  -e JWT_SECRET=your-secret \
  strux-cms
```

> 💡 **Tip**: Mount `content/` and `uploads/` as volumes to persist data outside the container.

## Docker Compose

```yaml
version: '3.8'
services:
  strux:
    build: .
    ports:
      - "3000:3000"
      - "3001:3001"
    volumes:
      - ./content:/app/content
      - ./uploads:/app/uploads
      - ./schema:/app/schema
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - NODE_ENV=production
    restart: unless-stopped
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | API server port |
| `JWT_SECRET` | — | **Required.** Secret for JWT signing |
| `NODE_ENV` | `development` | Environment mode |
| `CONTENT_DIR` | `./content` | Content storage path |
| `SCHEMA_DIR` | `./schema` | Schema definitions path |
| `UPLOADS_DIR` | `./uploads` | Media upload path |

## Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name cms.example.com;

    # API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Admin panel
    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Static Frontend Integration

Since Strux content is stored as JSON files, your frontend can read them directly at build time:

```javascript
// In your Next.js getStaticProps
import fs from 'fs';
import path from 'path';

export async function getStaticProps() {
  const contentDir = path.join(process.cwd(), 'content/api/articles');
  const files = fs.readdirSync(contentDir);
  const articles = files.map(f => 
    JSON.parse(fs.readFileSync(path.join(contentDir, f), 'utf8'))
  );

  return { props: { articles } };
}
```

This eliminates the need for a running API server during builds.

## Production Checklist

- [ ] Set a strong, unique `JWT_SECRET`
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS via reverse proxy or load balancer
- [ ] Mount `content/` and `uploads/` as persistent storage
- [ ] Configure Git for content versioning on the server
- [ ] Set up regular backups (or push to a remote Git repository)
- [ ] Restrict admin panel access via firewall or auth proxy
