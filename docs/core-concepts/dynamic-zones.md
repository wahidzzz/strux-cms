# Dynamic Zones

Dynamic zones are one of Strux's most powerful features. They allow editors to compose pages from **reusable content blocks** (components), creating flexible layouts without fixed templates.

## How Dynamic Zones Work

1. You define **components** — reusable content structures (hero, feature grid, testimonials, etc.)
2. You add a **dynamic zone field** to a content type
3. Editors can then **add, remove, and reorder** components within that zone

## Defining Components

Components live in the `schema/components/` directory:

```json
// schema/components/hero.json
{
  "displayName": "Hero",
  "attributes": {
    "heading": { "type": "string", "required": true },
    "subheading": { "type": "text" },
    "background_image": { "type": "media" },
    "cta_text": { "type": "string" },
    "cta_url": { "type": "string" }
  }
}
```

```json
// schema/components/feature-grid.json
{
  "displayName": "Feature Grid",
  "attributes": {
    "title": { "type": "string" },
    "features": { "type": "json" }
  }
}
```

```json
// schema/components/testimonials.json
{
  "displayName": "Testimonials",
  "attributes": {
    "heading": { "type": "string" },
    "items": { "type": "json" }
  }
}
```

## Using Dynamic Zones in Schemas

Reference components in a content type using the `dynamiczone` field type:

```json
// schema/page.schema.json
{
  "displayName": "Page",
  "kind": "collectionType",
  "singularName": "page",
  "pluralName": "pages",
  "apiId": "page",
  "attributes": {
    "title": { "type": "string", "required": true },
    "slug": { "type": "uid", "targetField": "title", "required": true },
    "body": {
      "type": "dynamiczone",
      "components": ["hero", "feature-grid", "testimonials", "cta"]
    }
  }
}
```

## Content Structure

Dynamic zone content is stored as an ordered array of typed blocks:

```json
{
  "id": "page-001",
  "title": "Homepage",
  "slug": "home",
  "body": [
    {
      "__component": "hero",
      "heading": "Welcome to Our Site",
      "subheading": "We build amazing things",
      "background_image": "hero-bg.jpg",
      "cta_text": "Get Started",
      "cta_url": "/signup"
    },
    {
      "__component": "feature-grid",
      "title": "Why Choose Us",
      "features": [
        { "title": "Fast", "description": "Lightning-fast performance" },
        { "title": "Secure", "description": "Enterprise-grade security" }
      ]
    },
    {
      "__component": "testimonials",
      "heading": "What People Say",
      "items": [
        { "name": "Jane Doe", "quote": "Strux changed my workflow!" }
      ]
    }
  ]
}
```

## Key Properties

- **`__component`**: Identifies which component schema this block uses
- **Order matters**: Blocks render in the order they appear in the array
- **Reusable**: The same component type can appear multiple times

## Best Practices

1. **Keep components focused** — Each component should represent one visual block
2. **Use descriptive names** — `hero`, `pricing-table`, `team-grid` not `block1`, `section2`
3. **Validate with schemas** — Each component's fields are validated against its schema
4. **Use components for shared structures** — If a block appears in multiple content types, extract it as a component
