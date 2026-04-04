# Single Types

While **collection types** manage lists of entries, **single types** represent unique content — pages or settings that exist only once (e.g., a homepage, site config, or an about section).

## Defining a Single Type

```json
// schema/homepage.schema.json
{
  "displayName": "Homepage",
  "kind": "singleType",
  "singularName": "homepage",
  "apiId": "homepage",
  "attributes": {
    "hero_title": { "type": "string", "required": true },
    "hero_subtitle": { "type": "text" },
    "hero_image": { "type": "media" },
    "featured_posts_count": { "type": "integer", "default": 3 },
    "enable_newsletter": { "type": "boolean", "default": true }
  }
}
```

The key difference is `"kind": "singleType"` instead of `"collectionType"`.

## Content Storage

Single type content lives in a dedicated file:

```
content/api/homepage/data.json
```

There's only **one** data.json per single type — no list of entries.

```json
// content/api/homepage/data.json
{
  "hero_title": "Welcome to Our Site",
  "hero_subtitle": "Building the future, one commit at a time.",
  "hero_image": "hero-bg.jpg",
  "featured_posts_count": 5,
  "enable_newsletter": true,
  "updatedAt": "2026-04-04T12:00:00.000Z"
}
```

## API Endpoints

Single types use simplified endpoints (no `:id` parameter):

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/homepage` | Get the content |
| `PUT` | `/api/homepage` | Update the content |

No `POST` or `DELETE` — the content always exists, you only read or update it.

## Usage Examples

```bash
# Read the homepage content
GET /api/homepage

# Update the homepage
PUT /api/homepage
Content-Type: application/json
Authorization: Bearer <token>

{
  "hero_title": "New Hero Title",
  "featured_posts_count": 10
}
```

## When to Use Single Types

| Use Case | Type |
|----------|------|
| Blog posts, products, team members | Collection Type |
| Homepage, site settings, about page | **Single Type** |
| Global config (SEO, analytics) | **Single Type** |
| Footer content, contact info | **Single Type** |
