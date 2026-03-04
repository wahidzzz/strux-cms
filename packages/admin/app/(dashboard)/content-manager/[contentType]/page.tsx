import Link from 'next/link'
import { getCMS } from '@/lib/cms'
import { Plus, Settings, Search, Edit2, Trash2 } from 'lucide-react'
import { redirect } from 'next/navigation'

// Allow dynamic params
type Props = {
  params: { contentType: string }
  searchParams: { page?: string, sort?: string }
}

export const dynamic = 'force-dynamic'

export default async function ContentList({ params, searchParams }: Props) {
  const cms = await getCMS()
  const { contentType } = params
  
  // Safe load of schema
  let schema;
  try {
    schema = await cms.getSchemaEngine().loadSchema(contentType)
  } catch (error) {
    return (
      <div className="p-8 text-center text-destructive">
        <h2 className="text-xl font-bold">Content Type Not Found</h2>
        <p>The schema for &quot;{contentType}&quot; does not exist.</p>
        <Link href="/content-manager" className="text-primary hover:underline mt-4 inline-block">Back to Content Manager</Link>
      </div>
    )
  }

  // If it's a single type, redirect to its entry
  if (schema.kind === 'singleType') {
    const result = await cms.getContentEngine().findMany(contentType, { pagination: { pageSize: 1 } })
    const entry = result.data?.[0]
    if (entry) {
      redirect(`/content-manager/${contentType}/${entry.id}`)
    } else {
      redirect(`/content-manager/${contentType}/create`)
    }
  }

  const page = parseInt(searchParams.page || '1', 10)
  const pageSize = 10
  
  // Run Query
  const result = await cms.getContentEngine().findMany(contentType, {
    pagination: { page, pageSize }
  })
  
  const entries = result.data || []
  const meta = result.meta?.pagination || { page: 1, pageCount: 1, total: 0 }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{schema.pluralName}</h1>
          <p className="text-muted-foreground">{meta.total} entries found</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Link href={`/content-manager/${contentType}/settings`} className="p-2 border border-border rounded-md hover:bg-accent text-muted-foreground transition-colors">
            <Settings className="w-5 h-5" />
          </Link>
          <Link 
            href={`/content-manager/${contentType}/create`}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            Create new entry
          </Link>
        </div>
      </div>
      
      {/* Filters & Search */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input 
            type="text"
            placeholder={`Search ${schema.pluralName}...`}
            className="w-full pl-9 pr-4 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>
      
      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 border-b border-border text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">ID</th>
                {Object.entries(schema.attributes).slice(0, 4).map(([key, attr]) => (
                  <th key={key} className="px-6 py-3 font-medium cursor-pointer hover:text-foreground">
                    {key}
                  </th>
                ))}
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-muted-foreground">
                    No entries found
                  </td>
                </tr>
              ) : (
                  entries.map((entry: any) => (
                  <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs">{entry.id}</td>
                    {Object.keys(schema.attributes).slice(0, 4).map((key) => {
                      const value = entry[key] as any
                      const displayValue = typeof value === 'object' ? JSON.stringify(value).slice(0, 30) : String(value || '')
                      return (
                        <td key={key} className="px-6 py-4 truncate max-w-[200px]">
                          {displayValue}
                        </td>
                      )
                    })}
                    <td className="px-6 py-4">
                      {entry.publishedAt ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          Published
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500">
                          Draft
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/content-manager/${contentType}/${entry.id}`} className="p-1 text-muted-foreground hover:text-primary transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </Link>
                        <button className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {meta.pageCount > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-muted/20">
            <span className="text-sm text-muted-foreground">
              Showing page {meta.page} of {meta.pageCount}
            </span>
            <div className="flex items-center gap-2">
              <Link 
                href={`?page=${Math.max(1, page - 1)}`} 
                className={`px-3 py-1 text-sm border border-border rounded-md ${page <= 1 ? 'opacity-50 pointer-events-none' : 'hover:bg-accent'}`}
              >
                Previous
              </Link>
              <Link 
                href={`?page=${Math.min(meta.pageCount, page + 1)}`}
                className={`px-3 py-1 text-sm border border-border rounded-md ${page >= meta.pageCount ? 'opacity-50 pointer-events-none' : 'hover:bg-accent'}`}
              >
                Next
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
