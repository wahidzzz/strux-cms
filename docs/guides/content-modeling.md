# Content Modeling

This guide walks you through designing a content model for a real-world application — a blog with authors, categories, and pages.

## Planning Your Model

Before writing schemas, map out your content:

```
Blog Application
├── Articles (collection) — has author, category, tags
├── Authors (collection) — has articles
├── Categories (collection) — has articles
├── Homepage (single) — hero content, featured posts
└── Site Settings (single) — logo, nav links, footer
```

## Step 1: Define Collection Types

### Authors

```json
// schema/author.schema.json
{
  "displayName": "Author",
  "kind": "collectionType",
  "singularName": "author",
  "pluralName": "authors",
  "apiId": "author",
  "attributes": {
    "name": { "type": "string", "required": true },
    "bio": { "type": "text" },
    "avatar": { "type": "media" },
    "email": { "type": "email", "unique": true }
  }
}
```

### Categories

```json
// schema/category.schema.json
{
  "displayName": "Category",
  "kind": "collectionType",
  "singularName": "category",
  "pluralName": "categories",
  "apiId": "category",
  "attributes": {
    "name": { "type": "string", "required": true },
    "slug": { "type": "uid", "targetField": "name" },
    "description": { "type": "text" },
    "color": { "type": "string" }
  }
}
```

### Articles

```json
// schema/article.schema.json
{
  "displayName": "Article",
  "kind": "collectionType",
  "singularName": "article",
  "pluralName": "articles",
  "apiId": "article",
  "attributes": {
    "title": { "type": "string", "required": true },
    "slug": { "type": "uid", "targetField": "title", "required": true },
    "excerpt": { "type": "text", "maxLength": 300 },
    "content": { "type": "richtext" },
    "cover_image": { "type": "media" },
    "is_featured": { "type": "boolean", "default": false },
    "published_at": { "type": "datetime" },
    "author": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "author"
    },
    "category": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "category"
    },
    "seo": {
      "type": "component",
      "component": "seo"
    }
  }
}
```

## Step 2: Define Single Types

### Site Settings

```json
// schema/site-settings.schema.json
{
  "displayName": "Site Settings",
  "kind": "singleType",
  "singularName": "site-settings",
  "apiId": "site-settings",
  "attributes": {
    "site_name": { "type": "string", "required": true },
    "tagline": { "type": "string" },
    "logo": { "type": "media" },
    "nav_links": {
      "type": "component",
      "component": "link",
      "repeatable": true
    },
    "footer_text": { "type": "richtext" }
  }
}
```

## Step 3: Define Components

### SEO Component

```json
// schema/components/seo.json
{
  "displayName": "SEO",
  "attributes": {
    "meta_title": { "type": "string", "maxLength": 60 },
    "meta_description": { "type": "text", "maxLength": 160 },
    "og_image": { "type": "media" }
  }
}
```

## Resulting File Structure

After defining all schemas and creating content:

```
schema/
├── article.schema.json
├── author.schema.json
├── category.schema.json
├── site-settings.schema.json
└── components/
    ├── seo.json
    └── link.json

content/api/
├── articles/
│   ├── art-001.json
│   ├── art-002.json
│   └── art-003.json
├── authors/
│   ├── auth-001.json
│   └── auth-002.json
├── categories/
│   ├── cat-001.json
│   └── cat-002.json
└── site-settings/
    └── data.json
```

## Best Practices

1. **Start with your content types** — Write schemas before creating content
2. **Use relations over duplication** — Store author data once, reference by ID
3. **Keep schemas minimal** — Only add fields you'll actually use
4. **Use components for shared blocks** — SEO, social links, CTAs
5. **Name consistently** — Use `snake_case` for field names, `kebab-case` for slugs
