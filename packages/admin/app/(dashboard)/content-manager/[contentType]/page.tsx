import React from 'react'
import { getCMS } from '@/lib/cms'
import { redirect } from 'next/navigation'
import ContentList from './(components)/ContentList'

type Props = {
  params: { contentType: string }
  searchParams: { page?: string, q?: string, filters?: string }
}

export default async function Page({ params, searchParams }: Props) {
  const { contentType } = params
  const cms = await getCMS()
  
  const schema = await cms.getSchemaEngine().loadSchema(contentType)
  if (!schema) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Content type not found</h2>
          <p className="text-gray-400 mt-2">Manage all &quot;Jayson CMS&quot; content entries</p>
          <p className="text-muted-foreground mt-1">The requested content type &quot;{contentType}&quot; does not exist.</p>
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
