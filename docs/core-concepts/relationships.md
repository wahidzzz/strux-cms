# Relationships

Strux supports content relationships between different content types. Relationships allow you to link entries together, like articles to categories or users to profiles.

## Relationship Types

### one-to-one

A single entry relates to exactly one entry in another type.

```json
// In user.schema.json
"profile": {
  "type": "relation",
  "relation": {
    "target": "profile",
    "relation": "oneToOne"
  }
}
```

**Use case**: User → Profile, Order → Invoice

### one-to-many

One entry can relate to many entries in another type.

```json
// In author.schema.json
"articles": {
  "type": "relation",
  "relation": {
    "target": "article",
    "relation": "oneToMany"
  }
}
```

**Use case**: Author → Articles, Category → Products

### many-to-one

Many entries relate to one entry (the inverse of one-to-many).

```json
// In article.schema.json
"category": {
  "type": "relation",
  "relation": {
    "target": "category",
    "relation": "manyToOne"
  }
}
```

**Use case**: Articles → Category, Comments → Post

### many-to-many

Multiple entries can relate to multiple entries in another type.

```json
// In article.schema.json
"tags": {
  "type": "relation",
  "relation": {
    "target": "tag",
    "relation": "manyToMany"
  }
}
```

**Use case**: Articles ↔ Tags, Students ↔ Courses

## Querying Relationships

### Population

Use the `populate` query parameter to include related data:

```bash
# Populate specific relations
GET /api/articles?populate=author,category

# Populate all relations
GET /api/articles?populate=*
```

### Response Format

Without population:
```json
{
  "id": "abc123",
  "title": "My Article",
  "category": "cat-001"  // Just the ID
}
```

With `?populate=category`:
```json
{
  "id": "abc123",
  "title": "My Article",
  "category": {
    "id": "cat-001",
    "name": "Tutorials",
    "slug": "tutorials"
  }
}
```

## Storage Format

Relationships are stored as IDs in the content JSON:

```json
// One-to-one / many-to-one: string ID
{ "category": "cat-001" }

// One-to-many / many-to-many: array of IDs
{ "tags": ["tag-001", "tag-002", "tag-003"] }
```

## Best Practices

1. **Use many-to-one for foreign keys** — If an article _belongs to_ one category, define the relation on the article.
2. **Avoid circular population** — Use `populate` selectively to prevent infinite loops.
3. **Keep relationships shallow** — For deeply nested structures, consider using components instead of nested relations.
