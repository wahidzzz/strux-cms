'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Settings, Search, Edit2, Trash2, Image as ImageIcon, Box, Filter, X, ChevronDown, ListFilter } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'

type Props = {
  params: { contentType: string }
  schema: any
  initialData: any[]
  initialMeta: any
}

export default function ContentList({ params, schema, initialData, initialMeta }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { contentType } = params
  
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '')
  const [entries, setEntries] = useState(initialData)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  
  // Parse active filters from URL
  const [activeFilters, setActiveFilters] = useState<any[]>([])

  useEffect(() => {
    const filtersParam = searchParams.get('filters')
    if (filtersParam) {
      try {
        const parsed = JSON.parse(filtersParam)
        // Convert Strapi format to internal array format [{field, operator, value}]
        const flattened = Object.entries(parsed).flatMap(([field, ops]: [string, any]) => 
          Object.entries(ops).map(([operator, value]) => ({ field, operator, value }))
        )
        setActiveFilters(flattened)
      } catch (e) {
        console.error('Failed to parse filters', e)
        setActiveFilters([])
      }
    } else {
      setActiveFilters([])
    }
  }, [searchParams])

  // Update entries when initialData changes (e.g. on navigation)
  useEffect(() => {
    setEntries(initialData)
  }, [initialData])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const p = new URLSearchParams(searchParams.toString())
    if (searchTerm) {
      p.set('q', searchTerm)
    } else {
      p.delete('q')
    }
    p.set('page', '1')
    router.push(`?${p.toString()}`)
  }

  const applyFilters = (filters: any[]) => {
    const p = new URLSearchParams(searchParams.toString())
    if (filters.length > 0) {
      // Build Strapi-style filter object: { field: { operator: value } }
      const filterObj: any = {}
      filters.forEach(f => {
        if (!filterObj[f.field]) filterObj[f.field] = {}
        filterObj[f.field][f.operator] = f.value
      })
      p.set('filters', JSON.stringify(filterObj))
    } else {
      p.delete('filters')
    }
    p.set('page', '1')
    router.push(`?${p.toString()}`)
  }

  const addFilter = () => {
    const defaultField = Object.keys(schema.attributes)[0] || 'id'
    setActiveFilters([...activeFilters, { field: defaultField, operator: '$eq', value: '' }])
  }

  const removeFilter = (index: number) => {
    const newFilters = [...activeFilters]
    newFilters.splice(index, 1)
    applyFilters(newFilters)
  }

  const updateFilter = (index: number, updates: any) => {
    const newFilters = [...activeFilters]
    newFilters[index] = { ...newFilters[index], ...updates }
    setActiveFilters(newFilters)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this entry?')) return

    setIsDeleting(id)
    try {
      const res = await fetch(`/api/content/${contentType}/${id}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setEntries(prev => prev.filter(e => (e.documentId || e.id) !== id))
        router.refresh()
      } else {
        alert('Failed to delete entry')
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('An error occurred while deleting')
    } finally {
      setIsDeleting(null)
    }
  }

  const renderCellValue = (key: string, value: any, attr: any) => {
    if (value === null || value === undefined) return <span className="text-muted-foreground/30">-</span>

    if (attr.type === 'media' && typeof value === 'string' && value.startsWith('http')) {
      return (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded border border-border overflow-hidden bg-muted flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="Preview" className="w-full h-full object-cover" />
          </div>
          <span className="truncate text-xs text-muted-foreground">Image</span>
        </div>
      )
    }

    if (attr.type === 'component') {
      const count = Array.isArray(value) ? value.length : (value ? 1 : 0)
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 text-[10px] font-medium border border-blue-100 dark:border-blue-800">
          <Box className="w-3 h-3" />
          {count} component{count !== 1 ? 's' : ''}
        </span>
      )
    }

    if (attr.type === 'relation') {
      const count = Array.isArray(value) ? value.length : (value ? 1 : 0)
      return <span className="text-xs">{count} item{count !== 1 ? 's' : ''}</span>
    }

    if (typeof value === 'object') {
      return <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[150px] inline-block">{JSON.stringify(value)}</span>
    }

    if (typeof value === 'boolean') {
      return (
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${value ? 'bg-green-500' : 'bg-gray-300'}`} />
      )
    }

    return <span className="truncate max-w-[200px] inline-block">{String(value)}</span>
  }

  const page = parseInt(searchParams.get('page') || '1', 10)
  const meta = initialMeta || { page: 1, pageCount: 1, total: 0 }

  // Get attributes to display (up to 5)
  const displayAttrs = schema?.attributes ? Object.entries(schema.attributes).slice(0, 5) : []

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight capitalize">{schema?.displayName || schema?.pluralName || contentType}</h1>
          <p className="text-muted-foreground">{meta.total} entries found</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Link
            href={`/content-type-builder/${contentType}`}
            title="Configure Content Type"
            className="p-2 border border-border rounded-md hover:bg-accent text-muted-foreground transition-all hover:text-foreground"
          >
            <Settings className="w-5 h-5" />
          </Link>
          <Link 
            href={`/content-manager/${contentType}/create`}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-all shadow-sm font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            Create new entry
          </Link>
        </div>
      </div>
      
      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <form onSubmit={handleSearch} className="relative w-full max-w-sm group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input 
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Search ${schema.displayName}...`}
            className="w-full pl-9 pr-4 py-2 text-sm border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-card"
          />
        </form>

        <button 
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${showFilters || activeFilters.length > 0 ? 'bg-primary/5 border-primary text-primary shadow-sm' : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
        >
          <Filter className="w-4 h-4" />
          Filters
          {activeFilters.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px]">
              {activeFilters.length}
            </span>
          )}
        </button>
      </div>

      {/* Advanced Filter UI */}
      {showFilters && (
        <div className="p-5 bg-card border border-border rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/50">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <ListFilter className="w-4 h-4 text-primary" />
              Advanced Filters
            </h3>
            <button 
              onClick={() => setShowFilters(false)}
              className="p-1 hover:bg-muted rounded-md transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          
          <div className="space-y-3">
            {activeFilters.length === 0 ? (
              <div className="py-4 text-center border-2 border-dashed border-border rounded-lg">
                <p className="text-xs text-muted-foreground">No active filters. Click add to refine your results.</p>
              </div>
            ) : (
              activeFilters.map((filter, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <select 
                    value={filter.field}
                    onChange={(e) => updateFilter(idx, { field: e.target.value })}
                    className="flex-1 bg-background border border-input rounded-md px-2 py-1.5 text-xs focus:ring-1 focus:ring-primary"
                  >
                    {Object.entries(schema.attributes).map(([key, def]: [string, any]) => (
                      <option key={key} value={key}>{def.displayName || key}</option>
                    ))}
                  </select>

                  <select 
                    value={filter.operator}
                    onChange={(e) => updateFilter(idx, { operator: e.target.value })}
                    className="w-full sm:w-32 bg-background border border-input rounded-md px-2 py-1.5 text-xs focus:ring-1 focus:ring-primary"
                  >
                    <option value="$eq">Equal to</option>
                    <option value="$ne">Not equal to</option>
                    <option value="$contains">Contains</option>
                    <option value="$containsi">Contains (Ignore case)</option>
                    <option value="$gt">Greater than</option>
                    <option value="$lt">Less than</option>
                    <option value="$null">Is null</option>
                    <option value="$notNull">Is not null</option>
                  </select>

                  <div className="flex-[2] relative">
                    <input 
                      type="text"
                      value={filter.value}
                      onChange={(e) => updateFilter(idx, { value: e.target.value })}
                      className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-xs focus:ring-1 focus:ring-primary"
                      placeholder="Value..."
                    />
                  </div>

                  <button 
                    onClick={() => removeFilter(idx)}
                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/50">
            <button 
              onClick={addFilter}
              className="text-xs font-medium text-primary hover:underline flex items-center gap-1.5"
            >
              <Plus className="w-3 h-3" />
              Add new filter
            </button>

            <div className="flex items-center gap-3">
              <button 
                onClick={() => applyFilters([])}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear all
              </button>
              <button 
                onClick={() => applyFilters(activeFilters)}
                className="bg-primary text-primary-foreground px-4 py-1.5 rounded-md text-xs font-semibold hover:bg-primary/90 transition-all shadow-sm"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Table Container */}
      <div className="relative border border-border rounded-xl shadow-sm bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-muted/30 border-b border-border text-muted-foreground select-none">
              <tr>
                <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider whitespace-nowrap">ID</th>
                {displayAttrs.map(([key, _]) => (
                  <th key={key} className="px-6 py-4 font-semibold text-xs uppercase tracking-wider whitespace-nowrap capitalize">
                    {key.replace(/_/g, ' ')}
                  </th>
                ))}
                <th className="px-6 py-4 font-semibold text-xs uppercase tracking-wider whitespace-nowrap">Status</th>
                <th className="sticky right-0 bg-background/95 backdrop-blur px-6 py-4 font-semibold text-xs uppercase tracking-wider whitespace-nowrap text-right shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.1)] border-l border-border">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Search className="w-8 h-8 opacity-20" />
                      <p className="font-medium">No entries found matching your criteria</p>
                      <Link href={`/content-manager/${contentType}`} className="text-primary text-xs hover:underline mt-2">Clear filters</Link>
                    </div>
                  </td>
                </tr>
              ) : (
                  entries.map((entry: any) => (
                  <tr key={entry.id} className="group hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-mono text-[10px] text-muted-foreground">{entry.id}</td>
                    {displayAttrs.map(([key, attr]) => (
                      <td key={key} className="px-6 py-4 whitespace-nowrap">
                        {renderCellValue(key, entry[key], attr)}
                      </td>
                    ))}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {entry.publishedAt ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                          PUBLISHED
                        </span>
                      ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-500 dark:border-amber-800">
                            DRAFT
                        </span>
                      )}
                    </td>
                    <td className="sticky right-0 bg-background/95 backdrop-blur group-hover:bg-muted/30 transition-colors px-6 py-4 text-right shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.1)] border-l border-border">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/content-manager/${contentType}/${entry.documentId || entry.id}`}
                          className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-all"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(entry.documentId || entry.id)}
                          disabled={isDeleting === (entry.documentId || entry.id)}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-all decoration-none border-none outline-none"
                          title="Delete"
                        >
                          {isDeleting === (entry.documentId || entry.id) ? (
                            <div className="w-4 h-4 border-2 border-primary border-t-transparent animate-spin rounded-full" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
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
          <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/10">
            <span className="text-xs font-medium text-muted-foreground italic">
              Showing page {meta.page} of {meta.pageCount}
            </span>
            <div className="flex items-center gap-1.5">
              <Link 
                href={`?page=${Math.max(1, page - 1)}${searchTerm ? `&q=${searchTerm}` : ''}`}
                className={`px-3 py-1.5 text-xs font-medium border border-border rounded-lg shadow-sm transition-all ${page <= 1 ? 'opacity-40 pointer-events-none' : 'hover:bg-card hover:border-primary/50'}`}
              >
                Previous
              </Link>
              <Link 
                href={`?page=${Math.min(meta.pageCount, page + 1)}${searchTerm ? `&q=${searchTerm}` : ''}`}
                className={`px-3 py-1.5 text-xs font-medium border border-border rounded-lg shadow-sm transition-all ${page >= meta.pageCount ? 'opacity-40 pointer-events-none' : 'hover:bg-card hover:border-primary/50'}`}
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
