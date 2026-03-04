import Link from 'next/link'
import { getCMS } from '@/lib/cms'
import { ArrowLeft } from 'lucide-react'
import { notFound } from 'next/navigation'

import ContentForm from '../(components)/ContentForm'

type Props = {
  params: { contentType: string, id: string }
}

export const dynamic = 'force-dynamic'

export default async function ContentEditPage({ params }: Props) {
  const { contentType, id } = params
  const isNew = id === 'create'
  const cms = await getCMS()

  const schemasMap = await cms.getSchemaEngine().loadAllSchemas()
  const allSchemas = Array.from(schemasMap.values())

  let schema;
  try {
    schema = await cms.getSchemaEngine().loadSchema(contentType)
  } catch (error) {
    return notFound()
  }

  let entry = null
  if (!isNew) {
    entry = await cms.getContentEngine().findOne(contentType, id, {})
    if (!entry) {
      return (
        <div className="p-8 text-center">
          <h2 className="text-xl font-bold">Entry Not Found</h2>
          <p className="text-muted-foreground mt-2">The entry with ID &quot;{id}&quot; could not be found.</p>
          <Link href={`/content-manager/${contentType}`} className="text-primary hover:underline mt-4 inline-block">Back</Link>
        </div>
      )
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/content-manager/${contentType}`} className="p-2 border border-border rounded-md hover:bg-accent transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {isNew ? `Create ${schema.singularName}` : `Edit ${schema.singularName}`}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isNew ? 'API ID: New' : `API ID: ${entry?.id}`}
            </p>
          </div>
        </div>
      </div>
        
      <ContentForm 
        contentType={contentType}
        schema={schema}
        allSchemas={allSchemas}
        initialEntry={entry}
        isNew={isNew}
      />
    </div>
  )
}
