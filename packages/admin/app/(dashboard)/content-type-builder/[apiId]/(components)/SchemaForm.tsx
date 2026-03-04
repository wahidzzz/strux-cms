'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react'

type SchemaFormProps = {
  initialSchema: any | null
  isCreate: boolean
  allSchemas: any[]
}

export default function SchemaForm({ initialSchema, isCreate, allSchemas }: SchemaFormProps) {
  const router = useRouter()
  // Entire Schema state
  const [schema, setSchema] = useState<any>(initialSchema || {
    displayName: '',
    kind: 'collectionType',
    singularName: '',
    pluralName: '',
    description: '',
    apiId: '',
    attributes: {}
  })

  // State for Field Modal
  const [isFieldModalOpen, setIsFieldModalOpen] = useState(false)
  const [editingFieldData, setEditingFieldData] = useState<{ name: string, type: string, required: boolean, component?: string, repeatable?: boolean } | null>(null)
  const [originalFieldName, setOriginalFieldName] = useState<string | null>(null) // To track if we are renaming

  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Handlers for top level schema settings
  const handleSchemaChange = (field: string, value: string) => {
    setSchema((prev: any) => {
      const updated = { ...prev, [field]: value }
      if (isCreate && field === 'displayName' && value) {
        // Auto-generate based on display name
        const normalized = value.toLowerCase().trim().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
        updated.singularName = normalized
        updated.pluralName = `${normalized}s`
        updated.apiId = normalized
      }
      return updated
    })
  }

  // Handlers for field modal
  const openNewField = () => {
    setOriginalFieldName(null)
    setEditingFieldData({ name: '', type: 'string', required: false, component: '', repeatable: false })
    setIsFieldModalOpen(true)
  }

  const openEditField = (name: string, attr: any) => {
    setOriginalFieldName(name)
    setEditingFieldData({
      name,
      type: attr.type,
      required: !!attr.required,
      component: attr.component || '',
      repeatable: !!attr.repeatable
    })
    setIsFieldModalOpen(true)
  }

  const removeField = (name: string) => {
    setSchema((prev: any) => {
      const newAttrs = { ...prev.attributes }
      delete newAttrs[name]
      return { ...prev, attributes: newAttrs }
    })
  }

  const saveField = () => {
    if (!editingFieldData || !editingFieldData.name) return
    
    setSchema((prev: any) => {
      const newAttrs = { ...prev.attributes }
      
      // If we are renaming an existing field
      if (originalFieldName && originalFieldName !== editingFieldData.name) {
        delete newAttrs[originalFieldName]
      }
      
      newAttrs[editingFieldData.name] = {
        type: editingFieldData.type,
        required: editingFieldData.required,
        ...(editingFieldData.type === 'component' ? {
          component: editingFieldData.component,
          repeatable: editingFieldData.repeatable
        } : {})
      }
      
      return { ...prev, attributes: newAttrs }
    })
    setIsFieldModalOpen(false)
  }

  const handleSaveSchema = async () => {
    setIsSaving(true)
    setError(null)

    try {
      const method = isCreate ? 'POST' : 'PUT'
      const url = isCreate ? '/api/content-type-builder/content-types' : `/api/content-type-builder/content-types/${initialSchema.apiId}`
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: schema })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to save schema')

      router.push(`/content-type-builder/${schema.apiId}`)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteContentType = async () => {
    if (isCreate) return
    setIsDeleting(true)
    setError(null)

    try {
      const url = `/api/content-type-builder/content-types/${initialSchema.apiId}`
      const res = await fetch(url, {
        method: 'DELETE'
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Failed to delete content type')

      router.push('/content-type-builder/create')
      router.refresh()
    } catch (err: any) {
      setError(err.message)
      setIsDeleting(false)
      setIsDeleteModalOpen(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="p-6 border border-border rounded-xl bg-card shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">{isCreate ? 'New Content Type' : schema.displayName}</h2>
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider border border-primary/20">
                {schema.kind || 'collectionType'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1 font-mono">
              {isCreate ? 'API ID will be generated' : `apiId: ${schema.apiId}`}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
             {error && <span className="text-sm text-destructive">{error}</span>}
            {!isCreate && (
              <button 
                onClick={() => setIsDeleteModalOpen(true)}
                disabled={isSaving || isDeleting}
                className="flex items-center gap-2 px-4 py-2 border border-destructive text-destructive rounded-md text-sm font-medium hover:bg-destructive/10 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
            <button 
              onClick={handleSaveSchema}
              disabled={isSaving || isDeleting}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
        
        {isCreate && (
          <form className="space-y-4 max-w-md pb-6 mb-6 border-b border-border">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Display Name</label>
                <input
                  type="text"
                  value={schema.displayName}
                  onChange={(e) => handleSchemaChange('displayName', e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                  placeholder="e.g. Article"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Type Kind</label>
                <select
                  value={schema.kind || 'collectionType'}
                  onChange={(e) => handleSchemaChange('kind', e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-background"
                >
                  <option value="collectionType">Collection Type</option>
                  <option value="singleType">Single Type</option>
                  <option value="component">Component</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Singular Name</label>
                <input 
                  type="text" 
                  value={schema.singularName}
                  onChange={(e) => handleSchemaChange('singularName', e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-muted/30" 
                  placeholder="article"  
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Plural Name</label>
                <input 
                  type="text" 
                  value={schema.pluralName}
                  onChange={(e) => handleSchemaChange('pluralName', e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-muted/30" 
                  placeholder="articles" 
                />
              </div>
            </div>
          </form>
        )}

        <div className="space-y-4">
          <div className="flex justify-between items-center border-b border-border pb-2">
            <h3 className="font-semibold text-lg">{Object.keys(schema.attributes || {}).length} Fields</h3>
            <button onClick={openNewField} className="text-sm font-medium text-primary flex items-center gap-1 hover:underline text-left">
              <Plus className="w-4 h-4" />
              Add another field
            </button>
          </div>
          
          <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
            {Object.keys(schema.attributes || {}).length === 0 ? (
               <div className="p-8 text-center text-muted-foreground text-sm">
                 No fields added yet. Click &quot;Add another field&quot; to start.
               </div>
            ) : (
              Object.entries(schema.attributes || {}).map(([key, attr]: [string, any]) => (
                <div key={key} className="flex items-center justify-between p-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-mono text-xs uppercase tracking-wider font-bold">
                      {attr.type.substring(0, 3)}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{key}</p>
                      <p className="text-xs text-muted-foreground">
                        {attr.type} {attr.required ? '(Required)' : ''}
                        {attr.type === 'component' && ` [Component: ${attr.component}]${attr.repeatable ? ' (Repeatable)' : ''}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                     <button 
                       type="button"
                       onClick={() => openEditField(key, attr)}
                       className="p-1.5 text-muted-foreground hover:text-primary transition-colors"
                     >
                       <Edit2 className="w-4 h-4" />
                     </button>
                     <button 
                       type="button"
                       onClick={() => removeField(key)}
                       className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                     >
                       <Trash2 className="w-4 h-4" />
                     </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Field Editor Modal */}
      {isFieldModalOpen && editingFieldData && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-card w-full max-w-md p-6 rounded-xl border border-border shadow-lg">
                <div className="flex items-center justify-between mb-4">
                   <h3 className="text-lg font-bold">{originalFieldName ? 'Edit Field' : 'Add New Field'}</h3>
                   <button onClick={() => setIsFieldModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-5 h-5" />
                   </button>
                </div>
                
                <div className="space-y-4">
                   <div>
                       <label className="block text-sm font-medium mb-1">Field Name</label>
                       <input 
                          type="text"
                          value={editingFieldData.name}
                          onChange={(e) => setEditingFieldData({...editingFieldData, name: e.target.value})}
                          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                          autoFocus
                       />
                   </div>
                   <div>
                       <label className="block text-sm font-medium mb-1">Field Type</label>
                       <select
                          value={editingFieldData.type}
                          onChange={(e) => setEditingFieldData({...editingFieldData, type: e.target.value})}
                          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-background"
                       >
                          <option value="string">String</option>
                          <option value="text">Text (Long)</option>
                          <option value="richtext">Rich Text</option>
                          <option value="number">Number</option>
                          <option value="boolean">Boolean</option>
                          <option value="email">Email</option>
                          <option value="password">Password</option>
                  <option value="enumeration">Enumeration</option>
                  <option value="component">Component</option>
                  <option value="media">Media</option>
                  <option value="json">JSON</option>
                  <option value="dynamiczone">Dynamic Zone</option>
                  <option value="uid">UID (Slug)</option>
                </select>
              </div>

              {editingFieldData.type === 'component' && (
                <div className="space-y-4 pt-2 border-t border-border mt-2">
                  <div>
                    <label className="block text-sm font-medium mb-1">Select Component</label>
                    <select
                      value={editingFieldData.component}
                      onChange={(e) => setEditingFieldData({ ...editingFieldData, component: e.target.value })}
                      className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-background"
                    >
                      <option value="">Select a component...</option>
                      {allSchemas && allSchemas.filter(s => s.kind === 'component').map(comp => (
                        <option key={comp.apiId} value={comp.apiId}>{comp.displayName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="comp-repeatable"
                      checked={editingFieldData.repeatable}
                      onChange={(e) => setEditingFieldData({ ...editingFieldData, repeatable: e.target.checked })}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary/50"
                    />
                    <label htmlFor="comp-repeatable" className="text-sm font-medium">Repeatable component</label>
                  </div>
                </div>
              )}

                   <div className="flex items-center gap-2 pt-2">
                       <input 
                         type="checkbox" 
                         id="field-required"
                         checked={editingFieldData.required}
                         onChange={(e) => setEditingFieldData({...editingFieldData, required: e.target.checked})}
                         className="h-4 w-4 rounded border-input text-primary focus:ring-primary/50"
                       />
                       <label htmlFor="field-required" className="text-sm font-medium">Required field</label>
                   </div>
                   
                   <div className="pt-4 flex justify-end gap-2">
                       <button onClick={() => setIsFieldModalOpen(false)} className="px-4 py-2 text-sm border border-border rounded-md hover:bg-accent transition-colors">Cancel</button>
                       <button onClick={saveField} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">Save Field</button>
                   </div>
                </div>
            </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-card w-full max-w-md p-6 rounded-xl border border-border shadow-lg">
                <div className="flex items-center justify-between mb-4">
                   <h3 className="text-lg font-bold text-destructive">Delete Content Type</h3>
                   <button onClick={() => setIsDeleteModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-5 h-5" />
                   </button>
                </div>
                
                <div className="space-y-4">
                   <p className="text-sm">
                     Are you sure you want to delete the <span className="font-bold">{schema.displayName}</span> content type?
                   </p>
                   <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                     <p className="text-xs text-destructive font-medium">
                       WARNING: This will permanently delete the schema and ALL associated content entries. This action cannot be undone.
                     </p>
                   </div>
                   
                   <div className="pt-4 flex justify-end gap-2">
                       <button 
                        onClick={() => setIsDeleteModalOpen(false)} 
                        disabled={isDeleting}
                        className="px-4 py-2 text-sm border border-border rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                       >
                         Cancel
                       </button>
                       <button 
                        onClick={handleDeleteContentType} 
                        disabled={isDeleting}
                        className="px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                       >
                         {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                       </button>
                   </div>
                </div>
            </div>
        </div>
      )}
    </div>
  )
}
