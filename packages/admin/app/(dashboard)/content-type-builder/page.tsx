import Link from 'next/link'
import { getCMS } from '@/lib/cms'
import { Database, Plus, Settings, ChevronRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ContentTypeBuilderPage() {
  const cms = await getCMS()
  const schemasMap = await cms.getSchemaEngine().loadAllSchemas()
  const contentTypes = Array.from(schemasMap.values())

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content-Type Builder</h1>
          <p className="text-muted-foreground">
            Design and configure the data structure for your content
          </p>
        </div>
        
        <Link 
          href="/content-type-builder/create"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          Create new content type
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="col-span-1 border border-border rounded-xl bg-card overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/20">
            <h3 className="font-semibold text-sm">Collection Types</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{contentTypes.length} types</p>
          </div>
          <ul className="p-2 space-y-1">
            {contentTypes.map(type => (
              <li key={type.apiId}>
                <Link 
                  href={`/content-type-builder/${type.apiId}`}
                  className="flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-muted/50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-primary" />
                    {type.singularName}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
        
        {/* Main Content Area empty state */}
        <div className="col-span-1 md:col-span-3 border border-border border-dashed rounded-xl bg-muted/10 flex flex-col items-center justify-center p-12 min-h-[400px]">
          <Database className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Select a Content Type</h2>
          <p className="text-muted-foreground text-center max-w-sm mb-6">
            Choose a content type from the sidebar to view its structure or create a new one to get started.
          </p>
          <Link 
            href="/content-type-builder/create"
            className="flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-md hover:bg-primary/20 transition-colors font-medium text-sm"
          >
            Create new content type
          </Link>
        </div>
      </div>
    </div>
  )
}
