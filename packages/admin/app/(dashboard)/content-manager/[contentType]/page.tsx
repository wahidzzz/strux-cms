import React from 'react'
import { getCMS } from '@/lib/cms'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Database } from 'lucide-react'
import ContentList from './(components)/ContentList'

type Props = {
  params: { contentType: string }
  searchParams: { page?: string, q?: string, filters?: string }
}

export default async function Page({ params, searchParams }: Props) {
  const { contentType } = params
  const cms = await getCMS()
  
  let schema;
  try {
    schema = await cms.getSchemaEngine().loadSchema(contentType)
  } catch (err) {
    schema = null
  }

  if (!schema) {
    return (
      <div className="border border-border border-dashed rounded-xl bg-muted/10 flex flex-col items-center justify-center p-12 min-h-[400px]">
        <Database className="w-16 h-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Content Type Not Found</h2>
        <p className="text-muted-foreground text-center max-w-sm mb-6">
          The requested content type &quot;{contentType}&quot; does not exist.
        </p>
        <div className="flex gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors font-medium text-sm"
          >
            Back to Dashboard
          </Link>
          <Link
            href="/content-type-builder"
            className="flex items-center gap-2 bg-muted/50 text-foreground px-4 py-2 rounded-md hover:bg-muted transition-colors font-medium text-sm border border-border"
          >
            Go to Content-Type Builder
          </Link>
        </div>
      </div>
    )
  }

  // Handle SingleType redirect
  if (schema.kind === 'singleType') {
    const result = await cms.getContentEngine().findMany(contentType, { pagination: { pageSize: 1 } })
    const entry = result.data?.[0]
    if (entry) {
      redirect(`/content-manager/${contentType}/${entry.documentId || entry.id}`)
    } else {
      redirect(`/content-manager/${contentType}/create`)
    }
  }

  // Fetch data for CollectionType
  const pageValue = parseInt(searchParams.page || '1', 10)
  const query = searchParams.q || ''
  
  let filters = {}
  try {
    if (searchParams.filters) {
      filters = JSON.parse(searchParams.filters)
    }
  } catch (e) {
    console.error('Failed to parse filters from URL', e)
  }

  const result = await cms.getContentEngine().findMany(contentType, {
    pagination: { page: pageValue, pageSize: 12 },
    filters,
    _q: query
  })

  // Convert schema and result to plain objects for client component
  // to avoid any potential serialization issues with Map/Set if they existed
  const plainSchema = JSON.parse(JSON.stringify(schema))
  const plainData = JSON.parse(JSON.stringify(result.data))
  const plainMeta = JSON.parse(JSON.stringify(result.meta.pagination))

  return (
    <ContentList
      params={params}
      schema={plainSchema}
      initialData={plainData}
      initialMeta={plainMeta}
    />
  )
}
