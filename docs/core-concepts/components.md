# Components

Components are reusable content structures that can be shared across multiple content types and dynamic zones.

## Why Components?

Without components, you'd duplicate field definitions across content types. Components let you define a structure once and reference it everywhere.

## Defining Components

Components live in the `schema/components/` directory:

```json
// schema/components/seo.json
{
  "displayName": "SEO",
  "attributes": {
    "meta_title": { "type": "string", "maxLength": 60 },
    "meta_description": { "type": "text", "maxLength": 160 },
    "og_image": { "type": "media" },
    "no_index": { "type": "boolean", "default": false }
  }
}
```

```json
// schema/components/link.json
{
  "displayName": "Link",
  "attributes": {
    "label": { "type": "string", "required": true },
    "url": { "type": "string", "required": true },
    "is_external": { "type": "boolean", "default": false }
  }
}
```

## Using Components in Schemas

Reference components using the `component` field type:

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
    "content": { "type": "richtext" },
    "seo": {
      "type": "component",
      "component": "seo"
    },
    "related_links": {
      "type": "component",
      "component": "link",
      "repeatable": true
    }
  }
}
```

## Single vs Repeatable

- **Single component**: One instance embedded (e.g., SEO meta block)
- **Repeatable component**: An array of instances (e.g., a list of links)

```json
// Single — stored as an object
"seo": {
  "meta_title": "My Article",
  "meta_description": "A great article about..."
}

// Repeatable — stored as an array
"related_links": [
  { "label": "Docs", "url": "/docs", "is_external": false },
  { "label": "GitHub", "url": "https://github.com/...", "is_external": true }
]
```

## Components vs Dynamic Zones

| Feature | Component | Dynamic Zone |
|---------|-----------|-------------|
| Fixed structure | ✅ Same component type | ❌ Mixed component types |
| Repeatable | Optional | Always (array of blocks) |
| Use case | Known, reusable data shapes | Flexible page builders |
| `__component` key | Not needed | Required per block |
