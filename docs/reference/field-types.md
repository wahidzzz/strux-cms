# Field Types Reference

Strux supports the following field types in schema definitions.

## Scalar Types

| Type | Description | Example Value |
|------|-------------|---------------|
| `string` | Short text (single line) | `"Hello World"` |
| `text` | Long text (multi-line) | `"A longer description..."` |
| `richtext` | HTML content | `"<p>Rich <strong>content</strong></p>"` |
| `integer` | Whole number | `42` |
| `float` | Decimal number | `3.14` |
| `boolean` | True/false | `true` |
| `email` | Email address (validated) | `"user@example.com"` |
| `datetime` | ISO 8601 date-time | `"2026-04-04T12:00:00.000Z"` |
| `date` | ISO 8601 date | `"2026-04-04"` |
| `json` | Arbitrary JSON | `{ "key": "value" }` |
| `media` | File reference | `"uploads/photo.jpg"` |
| `uid` | URL-safe unique identifier | `"my-article-slug"` |
| `enumeration` | Predefined set of values | `"draft"` |
| `password` | Hashed string (write-only) | — |

## Field Options

### Common Options

```json
{
  "type": "string",
  "required": true,
  "unique": false,
  "default": "Untitled",
  "minLength": 1,
  "maxLength": 255
}
```

| Option | Types | Description |
|--------|-------|-------------|
| `required` | All | Field must be present |
| `unique` | All | Value must be unique across entries |
| `default` | All | Default value if not provided |
| `private` | All | Hidden from API responses |

### String/Text Options

| Option | Description |
|--------|-------------|
| `minLength` | Minimum character count |
| `maxLength` | Maximum character count |
| `regex` | Validation pattern |

### Number Options

| Option | Description |
|--------|-------------|
| `min` | Minimum value |
| `max` | Maximum value |

### Enumeration Options

```json
{
  "type": "enumeration",
  "enum": ["draft", "published", "archived"],
  "default": "draft"
}
```

### UID Options

```json
{
  "type": "uid",
  "targetField": "title"
}
```

Generates a URL-safe slug from the target field value.

## Relation Types

```json
{
  "type": "relation",
  "relation": "manyToOne",
  "target": "category"
}
```

| Relation | Description |
|----------|-------------|
| `oneToOne` | One entry links to one entry |
| `oneToMany` | One entry links to many entries |
| `manyToOne` | Many entries link to one entry |
| `manyToMany` | Many entries link to many entries |

## Component Types

```json
{
  "type": "component",
  "component": "seo",
  "repeatable": false
}
```

## Dynamic Zone Types

```json
{
  "type": "dynamiczone",
  "components": ["hero", "feature-grid", "cta"]
}
```
