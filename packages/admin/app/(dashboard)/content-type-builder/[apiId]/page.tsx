import Link from 'next/link'
import SchemaForm from './(components)/SchemaForm'
import { getCMS } from '@/lib/cms'
import { Database, Plus, Settings, ChevronRight, Edit2, Trash2 } from 'lucide-react'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ContentTypeDetailPage({ params }: { params: { apiId: string } }) {
  const cms = await getCMS()
  const schemasMap = await cms.getSchemaEngine().loadAllSchemas()
  const contentTypes = Array.from(schemasMap.values())
  
  const currentSchema = contentTypes.find(s => s.apiId === params.apiId)
  
  if (!currentSchema && params.apiId !== 'create') {
    return notFound()
  }

  const isCreate = params.apiId === 'create'

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content-Type Builder</h1>
          <p className="text-muted-foreground">
            {isCreate ? 'Create a new content type' : `Manage ${currentSchema?.displayName} fields`}
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
        <div className="col-span-1 border border-border rounded-xl bg-card overflow-hidden h-fit flex flex-col gap-4 pb-4">
          <div>
            <div className="p-4 border-b border-border bg-muted/20">
              <h3 className="font-semibold text-sm">Collection Types</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{contentTypes.filter(s => s.kind !== 'component' && s.kind !== 'singleType').length} types</p>
            </div>
            <ul className="p-2 space-y-1">
              {contentTypes.filter(s => s.kind !== 'component' && s.kind !== 'singleType').map(type => (
                <li key={type.apiId}>
                  <Link
                    href={`/content-type-builder/${type.apiId}`}
                    className={`flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${type.apiId === params.apiId
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-muted/50 text-foreground'
                      }`}
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

          <div>
            <div className="p-4 border-b border-border bg-muted/20 border-t">
              <h3 className="font-semibold text-sm">Single Types</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{contentTypes.filter(s => s.kind === 'singleType').length} types</p>
            </div>
            <ul className="p-2 space-y-1">
              {contentTypes.filter(s => s.kind === 'singleType').map(type => (
                <li key={type.apiId}>
                  <Link
                    href={`/content-type-builder/${type.apiId}`}
                    className={`flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${type.apiId === params.apiId
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-muted/50 text-foreground'
                      }`}
                  >
                    <span className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-amber-600 dark:text-amber-500" />
                      {type.singularName}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="p-4 border-b border-border bg-muted/20 border-t">
              <h3 className="font-semibold text-sm">Components</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{contentTypes.filter(s => s.kind === 'component').length} components</p>
            </div>
            <ul className="p-2 space-y-1">
              {contentTypes.filter(s => s.kind === 'component').map(type => (
                <li key={type.apiId}>
                  <Link
                    href={`/content-type-builder/${type.apiId}`}
                    className={`flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${type.apiId === params.apiId
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-muted/50 text-foreground'
                      }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Settings className="w-4 h-4 text-primary" />
                      <span className="truncate">{type.displayName}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        {/* Main Content Area */}
        <div className="col-span-1 md:col-span-3 space-y-6">
          <SchemaForm initialSchema={isCreate ? null : currentSchema} isCreate={isCreate} allSchemas={contentTypes} />
        </div>
      </div>
    </div>
  )
}
