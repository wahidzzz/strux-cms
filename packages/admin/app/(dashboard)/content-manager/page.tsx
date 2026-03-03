import Link from 'next/link'
import { getCMS } from '@/lib/cms'
import { FileText, ArrowRight, Layers } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ContentManagerPage() {
  const cms = await getCMS()
  const schemasMap = await cms.getSchemaEngine().loadAllSchemas()
  const contentTypes = Array.from(schemasMap.values())

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Content Manager</h1>
        <p className="text-muted-foreground">
          Select a content type to view, create, or edit entries.
        </p>
      </div>

      {contentTypes.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-xl border-border bg-muted/20">
          <Layers className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">No Content Types Found</h3>
          <p className="text-muted-foreground mb-6 max-w-sm text-center">
            You haven&apos;t created any content types yet. Go to the Content-Type Builder to create your first schema.
          </p>
          <Link 
            href="/content-type-builder"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          >
            Go to Content-Type Builder
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contentTypes.map((type) => (
            <Link
              key={type.apiId}
              href={`/content-manager/${type.apiId}`}
              className="group relative flex flex-col justify-between p-6 bg-card border border-border rounded-xl shadow-sm hover:shadow-md transition-all hover:border-primary/50"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <FileText className="h-6 w-6" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </div>
                <h3 className="text-xl font-semibold mb-1">{type.displayName}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  Manage {type.pluralName}.
                </p>
              </div>
              <div className="mt-6 text-sm font-medium text-primary">
                View entries →
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
