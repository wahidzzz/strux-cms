'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, CheckCircle, Clock, Trash2 } from 'lucide-react'

type ContentFormProps = {
  contentType: string
  schema: any
  initialEntry: any | null
  isNew: boolean
}

export default function ContentForm({ contentType, schema, initialEntry, isNew }: ContentFormProps) {
  const router = useRouter()
  const [formData, setFormData] = useState<any>(initialEntry || {})
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }))
  }

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
                
                return (
                  <div key={fieldName}>
                    <label className="block text-sm font-medium mb-1.5 capitalize">
                      {fieldName} {def.required && <span className="text-destructive">*</span>}
                    </label>
                    
                    {def.type === 'string' || def.type === 'email' || def.type === 'uid' ? (
                      <input 
                        type={def.type === 'email' ? 'email' : 'text'}
                        value={value}
                        onChange={(e) => handleChange(fieldName, e.target.value)}
                        className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        placeholder={`Enter ${fieldName}...`}
                        required={def.required}
                      />
                    ) : def.type === 'number' ? (
                      <input 
                        type="number"
                        value={value}
                        onChange={(e) => handleChange(fieldName, parseFloat(e.target.value))}
                        className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        required={def.required}
                      />
                    ) : def.type === 'text' || def.type === 'richtext' ? (
                      <textarea 
                        value={value}
                        onChange={(e) => handleChange(fieldName, e.target.value)}
                        rows={5}
                        className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        placeholder={`Enter ${fieldName}...`}
                        required={def.required}
                      />
                    ) : def.type === 'boolean' ? (
                      <div className="flex items-center gap-2 mt-2">
                        <input 
                          type="checkbox"
                          checked={value === true}
                          onChange={(e) => handleChange(fieldName, e.target.checked)}
                          className="h-4 w-4 rounded border-input text-primary focus:ring-primary/50"
                        />
                        <span className="text-sm">True / False</span>
                      </div>
                    ) : def.type === 'enumeration' ? (
                       <select 
                        value={value} 
                        onChange={(e) => handleChange(fieldName, e.target.value)}
                        className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-background"
                        required={def.required}
                       >
                        <option value="">Select...</option>
                        {def.enum?.map((e: string) => (
                          <option key={e} value={e}>{e}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="p-3 border border-border rounded-md bg-muted/30 text-sm text-muted-foreground flex items-center justify-center">
                        Complex field type [{def.type}] UI pending
                      </div>
                    )}
                    
                    {def.description && (
                      <p className="text-xs text-muted-foreground mt-1.5">{def.description}</p>
                    )}
                  </div>
                )
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
