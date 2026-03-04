import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { join } from 'path'
import { QueryEngine } from './query-engine.js'
import { FileEngine } from './file-engine.js'
import { SchemaEngine } from './schema-engine.js'
import type { ContentEntry, ContentTypeSchema } from '../types/index.js'

/**
 * Integration tests for QueryEngine relation population with SchemaEngine.
 *
 * These tests verify that the QueryEngine correctly populates relations
 * when integrated with a real SchemaEngine instance.
 */
describe('QueryEngine - Relation Population Integration', () => {
  let queryEngine: QueryEngine
  let fileEngine: FileEngine
  let schemaEngine: SchemaEngine
  let testDir: string
  let contentDir: string
  let schemaDir: string

  beforeEach(async () => {
    // Create a unique test directory for each test
    testDir = join(
      process.cwd(),
      'test-data',
      `query-population-test-${Date.now()}-${Math.random().toString(36).substring(2)}`
    )
    contentDir = join(testDir, 'content', 'api')
    schemaDir = join(testDir, 'schema')
    
    await fs.mkdir(contentDir, { recursive: true })
    await fs.mkdir(schemaDir, { recursive: true })

    fileEngine = new FileEngine()
    schemaEngine = new SchemaEngine(schemaDir)
    queryEngine = new QueryEngine(contentDir, fileEngine, schemaEngine)
  })

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  it('should populate manyToOne relations with real SchemaEngine', async () => {
    // Create author schema
    const authorSchema: ContentTypeSchema = {
      apiId: 'authors',
kind: 'collectionType',
      displayName: 'Author',
      singularName: 'author',
      pluralName: 'authors',
      attributes: {
        name: { type: 'string', required: true },
        email: { type: 'email', required: true },
      },
    }

    // Create article schema with author relation
    const articleSchema: ContentTypeSchema = {
      apiId: 'articles',
kind: 'collectionType',
      displayName: 'Article',
      singularName: 'article',
      pluralName: 'articles',
      attributes: {
        title: { type: 'string', required: true },
        content: { type: 'text' },
        author: {
          type: 'relation',
          relation: {
            relation: 'manyToOne',
            target: 'authors',
          },
        },
      },
    }

    // Save schemas
    await schemaEngine.saveSchema('authors', authorSchema)
    await schemaEngine.saveSchema('articles', articleSchema)

    // Create test data
    const authorDir = join(contentDir, 'authors')
    const articleDir = join(contentDir, 'articles')
    await fs.mkdir(authorDir, { recursive: true })
    await fs.mkdir(articleDir, { recursive: true })

    const author: ContentEntry = {
      id: 'author-1',
      name: 'John Doe',
      email: 'john@example.com',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    const article: ContentEntry = {
      id: 'article-1',
      title: 'Test Article',
      content: 'This is a test article',
      author: 'author-1',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      publishedAt: '2024-01-01T00:00:00Z',
    }

    await fileEngine.writeAtomic(join(authorDir, `${author.id}.json`), author)
    await fileEngine.writeAtomic(join(articleDir, `${article.id}.json`), article)

    // Build indexes
    await queryEngine.buildIndex('authors')
    await queryEngine.buildIndex('articles')

    // Query with population
    const results = queryEngine.query('articles', {
      populate: { author: true },
    })

    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Test Article')
    
    // Verify author is populated
    const populatedAuthor = results[0].author as any
    expect(populatedAuthor).toBeTypeOf('object')
    expect(populatedAuthor.id).toBe('author-1')
    expect(populatedAuthor.name).toBe('John Doe')
    expect(populatedAuthor.email).toBe('john@example.com')
  })

  it('should populate oneToMany relations with real SchemaEngine', async () => {
    // Create category schema with articles relation
    const categorySchema: ContentTypeSchema = {
      apiId: 'categories',
kind: 'collectionType',
      displayName: 'Category',
      singularName: 'category',
      pluralName: 'categories',
      attributes: {
        name: { type: 'string', required: true },
        articles: {
          type: 'relation',
          relation: {
            relation: 'oneToMany',
            target: 'articles',
          },
        },
      },
    }

    // Create article schema
    const articleSchema: ContentTypeSchema = {
      apiId: 'articles',
kind: 'collectionType',
      displayName: 'Article',
      singularName: 'article',
      pluralName: 'articles',
      attributes: {
        title: { type: 'string', required: true },
        content: { type: 'text' },
      },
    }

    // Save schemas
    await schemaEngine.saveSchema('categories', categorySchema)
    await schemaEngine.saveSchema('articles', articleSchema)

    // Create test data
    const categoryDir = join(contentDir, 'categories')
    const articleDir = join(contentDir, 'articles')
    await fs.mkdir(categoryDir, { recursive: true })
    await fs.mkdir(articleDir, { recursive: true })

    const articles: ContentEntry[] = [
      {
        id: 'article-1',
        title: 'Article 1',
        content: 'Content 1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'article-2',
        title: 'Article 2',
        content: 'Content 2',
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      },
    ]

    const category: ContentEntry = {
      id: 'category-1',
      name: 'Technology',
      articles: ['article-1', 'article-2'],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    for (const article of articles) {
      await fileEngine.writeAtomic(join(articleDir, `${article.id}.json`), article)
    }
    await fileEngine.writeAtomic(join(categoryDir, `${category.id}.json`), category)

    // Build indexes
    await queryEngine.buildIndex('articles')
    await queryEngine.buildIndex('categories')

    // Query with population
    const results = queryEngine.query('categories', {
      populate: { articles: true },
    })

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Technology')
    
    // Verify articles are populated
    const populatedArticles = results[0].articles as any[]
    expect(Array.isArray(populatedArticles)).toBe(true)
    expect(populatedArticles).toHaveLength(2)
    expect(populatedArticles[0].id).toBe('article-1')
    expect(populatedArticles[0].title).toBe('Article 1')
    expect(populatedArticles[1].id).toBe('article-2')
    expect(populatedArticles[1].title).toBe('Article 2')
  })

  it('should handle nested population with real SchemaEngine', async () => {
    // Create schemas
    const authorSchema: ContentTypeSchema = {
      apiId: 'authors',
kind: 'collectionType',
      displayName: 'Author',
      singularName: 'author',
      pluralName: 'authors',
      attributes: {
        name: { type: 'string', required: true },
      },
    }

    const articleSchema: ContentTypeSchema = {
      apiId: 'articles',
kind: 'collectionType',
      displayName: 'Article',
      singularName: 'article',
      pluralName: 'articles',
      attributes: {
        title: { type: 'string', required: true },
        author: {
          type: 'relation',
          relation: {
            relation: 'manyToOne',
            target: 'authors',
          },
        },
      },
    }

    const commentSchema: ContentTypeSchema = {
      apiId: 'comments',
kind: 'collectionType',
      displayName: 'Comment',
      singularName: 'comment',
      pluralName: 'comments',
      attributes: {
        text: { type: 'text', required: true },
        article: {
          type: 'relation',
          relation: {
            relation: 'manyToOne',
            target: 'articles',
          },
        },
      },
    }

    // Save schemas
    await schemaEngine.saveSchema('authors', authorSchema)
    await schemaEngine.saveSchema('articles', articleSchema)
    await schemaEngine.saveSchema('comments', commentSchema)

    // Create test data
    const authorDir = join(contentDir, 'authors')
    const articleDir = join(contentDir, 'articles')
    const commentDir = join(contentDir, 'comments')
    await fs.mkdir(authorDir, { recursive: true })
    await fs.mkdir(articleDir, { recursive: true })
    await fs.mkdir(commentDir, { recursive: true })

    const author: ContentEntry = {
      id: 'author-1',
      name: 'John Doe',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    const article: ContentEntry = {
      id: 'article-1',
      title: 'Test Article',
      author: 'author-1',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    const comment: ContentEntry = {
      id: 'comment-1',
      text: 'Great article!',
      article: 'article-1',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    await fileEngine.writeAtomic(join(authorDir, `${author.id}.json`), author)
    await fileEngine.writeAtomic(join(articleDir, `${article.id}.json`), article)
    await fileEngine.writeAtomic(join(commentDir, `${comment.id}.json`), comment)

    // Build indexes
    await queryEngine.buildIndex('authors')
    await queryEngine.buildIndex('articles')
    await queryEngine.buildIndex('comments')

    // Query with nested population
    const results = queryEngine.query('comments', {
      populate: {
        article: {
          populate: {
            author: true,
          },
        },
      },
    })

    expect(results).toHaveLength(1)
    expect(results[0].text).toBe('Great article!')
    
    // Verify nested population
    const populatedArticle = results[0].article as any
    expect(populatedArticle).toBeTypeOf('object')
    expect(populatedArticle.id).toBe('article-1')
    expect(populatedArticle.title).toBe('Test Article')
    
    const populatedAuthor = populatedArticle.author as any
    expect(populatedAuthor).toBeTypeOf('object')
    expect(populatedAuthor.id).toBe('author-1')
    expect(populatedAuthor.name).toBe('John Doe')
  })

  it('should apply field selection in populated relations', async () => {
    // Create schemas
    const authorSchema: ContentTypeSchema = {
      apiId: 'authors',
kind: 'collectionType',
      displayName: 'Author',
      singularName: 'author',
      pluralName: 'authors',
      attributes: {
        name: { type: 'string', required: true },
        email: { type: 'email', required: true },
        bio: { type: 'text' },
      },
    }

    const articleSchema: ContentTypeSchema = {
      apiId: 'articles',
kind: 'collectionType',
      displayName: 'Article',
      singularName: 'article',
      pluralName: 'articles',
      attributes: {
        title: { type: 'string', required: true },
        author: {
          type: 'relation',
          relation: {
            relation: 'manyToOne',
            target: 'authors',
          },
        },
      },
    }

    // Save schemas
    await schemaEngine.saveSchema('authors', authorSchema)
    await schemaEngine.saveSchema('articles', articleSchema)

    // Create test data
    const authorDir = join(contentDir, 'authors')
    const articleDir = join(contentDir, 'articles')
    await fs.mkdir(authorDir, { recursive: true })
    await fs.mkdir(articleDir, { recursive: true })

    const author: ContentEntry = {
      id: 'author-1',
      name: 'John Doe',
      email: 'john@example.com',
      bio: 'A great author',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    const article: ContentEntry = {
      id: 'article-1',
      title: 'Test Article',
      author: 'author-1',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    }

    await fileEngine.writeAtomic(join(authorDir, `${author.id}.json`), author)
    await fileEngine.writeAtomic(join(articleDir, `${article.id}.json`), article)

    // Build indexes
    await queryEngine.buildIndex('authors')
    await queryEngine.buildIndex('articles')

    // Query with field selection in population
    const results = queryEngine.query('articles', {
      populate: {
        author: {
          fields: ['name'],
        },
      },
    })

    expect(results).toHaveLength(1)
    
    // Verify only selected fields are included
    const populatedAuthor = results[0].author as any
    expect(populatedAuthor.id).toBeDefined() // Always included
    expect(populatedAuthor.createdAt).toBeDefined() // Always included
    expect(populatedAuthor.updatedAt).toBeDefined() // Always included
    expect(populatedAuthor.name).toBe('John Doe')
    expect(populatedAuthor.email).toBeUndefined() // Not selected
    expect(populatedAuthor.bio).toBeUndefined() // Not selected
  })
})
