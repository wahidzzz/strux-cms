import Link from 'next/link'
import { getCMS } from '@/lib/cms'
import { ArrowLeft, Database, FileX } from 'lucide-react'

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
    return (
      <div className="border border-border border-dashed rounded-xl bg-muted/10 flex flex-col items-center justify-center p-12 min-h-[400px]">
        <Database className="w-16 h-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Content Type Not Found</h2>
        <p className="text-muted-foreground text-center max-w-sm mb-6">
          The associated content type &quot;{contentType}&quot; does not exist.
        </p>
        <Link
          href="/"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors font-medium text-sm"
        >
          Back to Dashboard
        </Link>
      </div>
    )
  }

  let entry = null
  if (!isNew) {
    entry = await cms.getContentEngine().findOne(contentType, id, {})
    if (!entry) {
      return (
        <div className="border border-border border-dashed rounded-xl bg-muted/10 flex flex-col items-center justify-center p-12 min-h-[400px]">
          <FileX className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Entry Not Found</h2>
          <p className="text-muted-foreground text-center max-w-sm mb-6">
            The entry with ID &quot;{id}&quot; could not be found. It may have been deleted.
          </p>
          <div className="flex gap-4">
            <Link
              href={`/content-manager/${contentType}`}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors font-medium text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to {schema.displayName}
            </Link>
          </div>
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
