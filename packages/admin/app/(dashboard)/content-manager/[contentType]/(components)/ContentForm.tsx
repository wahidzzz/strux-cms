'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Save, CheckCircle, Clock, Trash2, Image as ImageIcon, Link as LinkIcon, FileText, Eye, EyeOff, Search, ChevronRight } from 'lucide-react'

type ContentFormProps = {
  contentType: string
  schema: any
  allSchemas: any[]
  initialEntry: any | null
  isNew: boolean
}

export default function ContentForm({ contentType, schema, allSchemas, initialEntry, isNew }: ContentFormProps) {
  const router = useRouter()
  const [formData, setFormData] = useState<any>(initialEntry || {})
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [relationEntries, setRelationEntries] = useState<Record<string, any[]>>({})
  const [showMarkdownPreview, setShowMarkdownPreview] = useState<Record<string, boolean>>({})

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }))
  }

  // Fetch relation entries
  useEffect(() => {
    const fetchRelations = async () => {
      const relationFields = Object.entries(schema.attributes)
        .filter(([_, def]: [string, any]) => def.type === 'relation' && def.relation?.target)

      for (const [fieldName, def] of relationFields) {
        const target = (def as any).relation.target
        try {
          const res = await fetch(`/api/content/${target}`)
          if (res.ok) {
            const result = await res.json()
            setRelationEntries(prev => ({ ...prev, [target]: result.data || [] }))
          }
        } catch (err) {
          console.error(`Failed to fetch relations for ${target}:`, err)
        }
      }
    }

    fetchRelations()
  }, [schema, contentType])

  const handleSave = async (publish: boolean = false) => {
    setIsSaving(true)
    setError(null)

    try {
      const url = `/api/content/${contentType}${!isNew ? `/${initialEntry.id}` : ''}`
      const method = isNew ? 'POST' : 'PUT'
      
      const payload = { ...formData }
      if (publish) {
        payload.publishedAt = typeof payload.publishedAt !== 'undefined' && initialEntry?.publishedAt 
            ? initialEntry.publishedAt 
            : new Date().toISOString()
      } else if (!isNew && !initialEntry?.publishedAt && typeof payload.publishedAt === 'undefined') {
          // keep as is
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: payload })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.message || 'Failed to save entry')
      }

      router.push(`/content-manager/${contentType}`)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this entry?')) return
    
    setIsSaving(true)
    try {
      const res = await fetch(`/api/content/${contentType}/${initialEntry.id}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error('Failed to delete')
      
      router.push(`/content-manager/${contentType}`)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
      setIsSaving(false)
    }
  }

  const handlePublishToggle = async () => {
    setIsSaving(true)
    try {
      const action = initialEntry?.publishedAt ? 'unpublish' : 'publish'
      const res = await fetch(`/api/content/${contentType}/${initialEntry.id}/${action}`, {
        method: 'POST'
      })
      if (!res.ok) throw new Error(`Failed to ${action}`)
      
      router.refresh()
    } catch(err: any){
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const renderField = (fieldName: string, def: any, value: any, onChange: (val: any) => void) => {
    if (def.type === 'component') {
      return (
        <div key={fieldName} className="border border-border rounded-md p-4 bg-muted/10">
          <label className="block text-sm font-medium mb-1.5 capitalize">
            {fieldName} {def.required && <span className="text-destructive">*</span>}
          </label>
          {renderComponentField(fieldName, def, value, onChange)}
          {def.description && <p className="text-xs text-muted-foreground mt-1.5">{def.description}</p>}
        </div>
      )
    }

    return (
      <div key={fieldName}>
        <label className="block text-sm font-medium mb-1.5 capitalize">
          {fieldName} {def.required && <span className="text-destructive">*</span>}
        </label>

        {def.type === 'string' || def.type === 'email' || def.type === 'uid' ? (
          <input
            type={def.type === 'email' ? 'email' : 'text'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
            placeholder={`Enter ${fieldName}...`}
            required={def.required}
          />
        ) : def.type === 'number' ? (
          <input
            type="number"
            value={value}
              onChange={(e) => onChange(parseFloat(e.target.value))}
              className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              required={def.required}
            />
          ) : def.type === 'text' ? (
            <textarea
              value={value}
                onChange={(e) => onChange(e.target.value)}
                rows={5}
                className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                placeholder={`Enter ${fieldName}...`}
                required={def.required}
              />
            ) : def.type === 'richtext' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between bg-muted/30 p-1 rounded-t-md border border-b-0 border-input">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setShowMarkdownPreview(prev => ({ ...prev, [fieldName]: false }))}
                      className={`px-2 py-1 text-xs rounded transition-colors ${!showMarkdownPreview[fieldName] ? 'bg-background shadow-sm font-medium' : 'hover:bg-background/50'}`}
                    >
                      Write
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMarkdownPreview(prev => ({ ...prev, [fieldName]: true }))}
                      className={`px-2 py-1 text-xs rounded transition-colors ${showMarkdownPreview[fieldName] ? 'bg-background shadow-sm font-medium' : 'hover:bg-background/50'}`}
                    >
                      Preview
                    </button>
                  </div>
                  <FileText className="w-3 h-3 text-muted-foreground mr-2" />
                </div>
                {showMarkdownPreview[fieldName] ? (
                  <div className="w-full min-h-[200px] p-4 border border-input rounded-b-md bg-background text-sm prose prose-sm dark:prose-invert max-w-none overflow-auto">
                    {value ? (
                      <div dangerouslySetInnerHTML={{
                        __html: value
                          .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mb-4">$1</h1>')
                          .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold mb-3">$1</h2>')
                          .replace(/^### (.*$)/gm, '<h3 class="text-lg font-bold mb-2">$1</h3>')
                          .replace(/\*\*(.*)\*\*/g, '<strong>$1</strong>')
                          .replace(/\*(.*)\*/g, '<em>$1</em>')
                          .replace(/- (.*$)/gm, '<li class="ml-4">$1</li>')
                          .replace(/\n\n/g, '<br/>')
                      }} />
                    ) : (
                      <p className="text-muted-foreground italic">Nothing to preview</p>
                    )}
                  </div>
                ) : (
                  <textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    rows={8}
                    className="w-full px-3 py-2 border border-input rounded-b-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-mono"
                    placeholder="Markdown supported..."
                    required={def.required}
                  />
                )}
              </div>
            ) : def.type === 'boolean' ? (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={value === true}
                    onChange={(e) => onChange(e.target.checked)}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary/50"
                  />
                  <span className="text-sm">True / False</span>
                </div>
                ) : def.type === 'enumeration' ? (
                  <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-background"
                    required={def.required}
                  >
                    <option value="">Select...</option>
                    {def.enum?.map((e: string) => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                  ) : def.type === 'relation' ? (
                    <div className="space-y-2">
                        {def.relation?.relation?.includes('ToMany') ? (
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-2 mb-2">
                              {(Array.isArray(value) ? value : []).map((id: string) => {
                                const entry = relationEntries[def.relation!.target]?.find(e => (e.documentId || e.id) === id)
                                return (
                                  <div key={id} className="flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-full border border-primary/20">
                                    <span className="truncate max-w-[150px]">{entry ? (entry.title || entry.name || entry.displayName || entry.documentId || `Entry #${entry.id}`) : id}</span>
                                    <button
                                      type="button"
                                      onClick={() => onChange((Array.isArray(value) ? value : []).filter(v => v !== id))}
                                      className="hover:text-destructive transition-colors ml-1"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )
                              })}
                            </div>
                            <div className="relative">
                              <select
                                value=""
                                onChange={(e) => {
                                  if (e.target.value) {
                                    const current = Array.isArray(value) ? value : []
                                    if (!current.includes(e.target.value)) {
                                      onChange([...current, e.target.value])
                                    }
                                  }
                                }}
                                className="w-full px-3 py-2 pl-9 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-background appearance-none"
                              >
                                <option value="">Select an entry from {def.relation?.target} to add...</option>
                                {relationEntries[def.relation?.target]
                                  ?.filter(entry => !(Array.isArray(value) ? value : []).includes(entry.documentId || entry.id))
                                  .map((entry: any) => (
                                    <option key={entry.id} value={entry.documentId || entry.id}>
                                      {entry.title || entry.name || entry.displayName || entry.documentId || `Entry #${entry.id}`}
                                    </option>
                                  ))}
                              </select>
                              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <ChevronRight className="w-4 h-4 text-muted-foreground rotate-90" />
                              </div>
                            </div>
                          </div>
                        ) : (
                            <div className="relative">
                              <select
                                value={value || ''}
                                onChange={(e) => onChange(e.target.value)}
                                className="w-full px-3 py-2 pl-9 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-background appearance-none"
                                required={def.required}
                              >
                                <option value="">Select an entry from {def.relation?.target}...</option>
                                {relationEntries[def.relation?.target]?.map((entry: any) => (
                                  <option key={entry.id} value={entry.documentId || entry.id}>
                                    {entry.title || entry.name || entry.displayName || entry.documentId || `Entry #${entry.id}`}
                                  </option>
                                ))}
                              </select>
                              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <ChevronRight className="w-4 h-4 text-muted-foreground rotate-90" />
                              </div>
                            </div>
                        )}
                        {value && !def.relation?.relation?.includes('ToMany') && (
                        <p className="text-[10px] text-muted-foreground px-1">
                          Selected ID: <span className="font-mono">{value}</span>
                        </p>
                      )}
                    </div>
                  ) : def.type === 'media' ? (
                    <div className="space-y-3 font-outfit">
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        placeholder="Paste image URL here..."
                      />
                      {value && (
                        <div className="relative aspect-video w-full max-w-sm rounded-lg overflow-hidden border border-border bg-muted/20 flex items-center justify-center group">
                          <img
                            src={value}
                            alt="Preview"
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button type="button" onClick={() => onChange('')} className="p-2 bg-destructive text-destructive-foreground rounded-full shadow-lg">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                      {!value && (
                        <div className="border border-dashed rounded-lg p-6 flex flex-col items-center justify-center bg-muted/5 text-muted-foreground transition-colors hover:bg-muted/10">
                          <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                          <p className="text-xs">Paste an image URL in the field above to preview</p>
                        </div>
                      )}
                    </div>
                      ) : def.type === 'dynamiczone' ? (
                        <div className="space-y-4 rounded-xl">
                          {/* Render existing components in the dynamic zone */}
                          {(Array.isArray(value) ? value : []).map((zoneItem: any, index: number) => {
                            const compName = zoneItem.__component
                            const compDef = allSchemas.find(s => s.apiId === compName)

                            return (
                              <div key={`${compName}-${index}`} className="border border-border/60 rounded-lg bg-card/50 overflow-hidden group">
                                <div className="flex items-center justify-between p-3 bg-muted/20 border-b border-border/40">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase tracking-wider">
                                      {compDef?.displayName || compName}
                                    </span>
                                  </div>
                                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newZone = [...(value || [])]
                                        newZone.splice(index, 1)
                                        onChange(newZone)
                                      }}
                                      className="p-1 text-muted-foreground hover:text-destructive transition-colors ml-2"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                                <div className="p-4 space-y-4">
                                  {compDef ? Object.entries(compDef.attributes).map(([subFieldName, subDef]: [string, any]) => (
                                    <div key={subFieldName} className="space-y-1">
                                      <label className="text-sm font-medium">{subFieldName}{subDef.required ? ' *' : ''}</label>
                                      {renderField(subFieldName, subDef, zoneItem[subFieldName], (newVal) => {
                                        const newZone = [...(value || [])]
                                        newZone[index] = { ...newZone[index], [subFieldName]: newVal }
                                        onChange(newZone)
                                      })}
                                    </div>
                                  )) : <p className="text-sm text-destructive px-2">Component schema not found.</p>}
                                </div>
                              </div>
                            )
                          })}

                          {/* Add Component Menu */}
                          <div className="relative pt-2">
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  onChange([...(value || []), { __component: e.target.value }])
                                }
                              }}
                              className="w-full px-3 py-2.5 border-2 border-dashed border-primary/30 rounded-lg focus:outline-none focus:border-primary/60 text-sm bg-primary/5 hover:bg-primary/10 transition-colors appearance-none text-center font-medium text-primary cursor-pointer"
                            >
                              <option value="" disabled hidden>+ Add a Component to {fieldName}</option>
                              <option value="">+ Add a Component to {fieldName}</option>
                              {def.allowedComponents?.map((compId: string) => {
                                const cschema = allSchemas.find(s => s.apiId === compId)
                                return <option key={compId} value={compId}>{cschema?.displayName || compId}</option>
                              })}
                            </select>
                          </div>
                        </div>
                  ) : def.type === 'json' ? (
                    <textarea
                      value={typeof value === 'object' ? JSON.stringify(value, null, 2) : value}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value)
                          onChange(parsed)
                        } catch {
                          onChange(e.target.value)
                        }
                      }}
                      rows={8}
                      className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-mono"
                      placeholder='{ "key": "value" }'
                    />
                  ) : def.type === 'uid' ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className="flex-1 px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-muted/20"
                        placeholder={`Generating ${fieldName}...`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          // Simple slugify fallback
                          const sourceField = def.targetField || 'title'
                          const sourceVal = formData[sourceField] || ''
                          const slug = sourceVal.toLowerCase().replace(/[^\w ]+/g, '').replace(/ +/g, '-')
                          onChange(slug)
                        }}
                        className="px-3 py-2 border border-border rounded-md hover:bg-accent text-xs font-medium"
                      >
                        Regenerate
                      </button>
                    </div>
        ) : (
          <div className="p-3 border border-border rounded-md bg-muted/30 text-sm text-muted-foreground flex items-center justify-center">
                                Specialized field type [{def.type}] logic coming soon
          </div>
        )}

        {def.description && (
          <p className="text-xs text-muted-foreground mt-1.5">{def.description}</p>
        )}
      </div>
    )
  }

  const renderComponentField = (fieldName: string, def: any, value: any, onChange: (val: any) => void) => {
    const compSchema = allSchemas.find(s => s.apiId === def.component)
    if (!compSchema) return <div className="text-sm text-destructive">Component schema not found for {def.component}</div>

    if (def.repeatable) {
      const items = Array.isArray(value) ? value : []
      return (
        <div className="space-y-4">
          <div className="font-medium text-sm border-b pb-2 mb-2 flex justify-between items-center">
            <span className="text-muted-foreground">{compSchema.displayName} (Repeatable)</span>
            <button
              type="button"
              onClick={() => {
                const newItems = [...items, {}]
                onChange(newItems)
              }}
              className="text-primary hover:underline text-xs"
            >
              + Add Item
            </button>
          </div>
          {items.map((item: any, index: number) => (
            <div key={index} className="border border-border/50 rounded p-4 relative bg-card shadow-sm">
              <button
                type="button"
                onClick={() => {
                  const newItems = items.filter((_: any, i: number) => i !== index)
                  onChange(newItems)
                }}
                className="absolute top-2 right-2 p-1 bg-background rounded border text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="space-y-4 mt-2">
                {Object.entries(compSchema.attributes).map(([subFieldName, subDef]: [string, any]) => {
                  const subValue = item[subFieldName] !== undefined ? item[subFieldName] : (subDef.default || '')
                  return renderField(
                    `${fieldName}.${index}.${subFieldName}`,
                    subDef,
                    subValue,
                    (newSubVal) => {
                      const newItems = [...items]
                      newItems[index] = { ...newItems[index], [subFieldName]: newSubVal }
                      onChange(newItems)
                    }
                  )
                })}
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="text-xs text-muted-foreground p-2 border border-dashed rounded text-center">No items added yet.</p>}
        </div>
      )
    }

    // Single Component
    const item = value || {}
    return (
      <div className="space-y-4">
        <div className="font-medium text-sm text-muted-foreground border-b pb-2 mb-2">{compSchema.displayName}</div>
        <div className="space-y-4">
          {Object.entries(compSchema.attributes).map(([subFieldName, subDef]: [string, any]) => {
            const subValue = item[subFieldName] !== undefined ? item[subFieldName] : (subDef.default || '')
            return renderField(
              `${fieldName}.${subFieldName}`,
              subDef,
              subValue,
              (newSubVal) => {
                const newItem = { ...item, [subFieldName]: newSubVal }
                onChange(newItem)
              }
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-end gap-3 mb-6">
        {error && <span className="text-sm text-destructive font-medium mr-4">{error}</span>}
        {!isNew && (
          <button
            onClick={handleDelete}
            disabled={isSaving}
            className="px-4 py-2 border border-destructive/30 text-destructive rounded-md text-sm font-medium hover:bg-destructive/10 transition-colors flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        )}
        <button
          onClick={() => handleSave(false)}
          disabled={isSaving}
          className="px-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-accent transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          Save {initialEntry?.publishedAt ? 'Changes' : 'Draft'}
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={isSaving}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <CheckCircle className="w-4 h-4" />
          {initialEntry?.publishedAt ? 'Saved & Published' : 'Publish'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 bg-card border border-border rounded-xl shadow-sm">
            <h2 className="text-lg font-semibold mb-6">Content</h2>

            <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
              {Object.entries(schema.attributes).map(([fieldName, def]: [string, any]) => {
                const value = formData[fieldName] !== undefined ? formData[fieldName] : (def.default || '')
                return renderField(fieldName, def, value, (newVal) => handleChange(fieldName, newVal))
              })}
            </form>
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="p-6 bg-card border border-border rounded-xl shadow-sm space-y-4">
            <h2 className="text-lg font-semibold border-b border-border pb-3">Information</h2>
            
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">State</span>
                {initialEntry && initialEntry.publishedAt ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    Published
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500">
                    Draft
                  </span>
                )}
              </div>
              
              {!isNew && initialEntry && (
                <>
                  <div className="flex justify-between items-center text-sm mt-4">
                      <span className="text-muted-foreground">Toggle Publish</span>
                      <button 
                        onClick={handlePublishToggle}
                        disabled={isSaving}
                        className="text-xs text-primary hover:underline"
                      >
                          {initialEntry.publishedAt ? 'Unpublish' : 'Publish Now'}
                      </button>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Last update</span>
                    <span className="flex items-center gap-1 font-mono text-xs">
                      <Clock className="w-3 h-3" />
                      {new Date(initialEntry.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Created at</span>
                    <span className="flex items-center gap-1 font-mono text-xs">
                      <Clock className="w-3 h-3" />
                      {new Date(initialEntry.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
