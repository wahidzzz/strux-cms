'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Edit2, Trash2, Save, X, ChevronRight, ArrowLeft } from 'lucide-react'

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
  const [fieldWizardStep, setFieldWizardStep] = useState<'select' | 'configure'>('select')
  const [activeTab, setActiveTab] = useState<'fields' | 'settings'>('fields')

  const [editingFieldData, setEditingFieldData] = useState<{
    name: string,
    type: string,
    required: boolean,
    component?: string,
    repeatable?: boolean,
    relation?: { target: string, relation: string },
    allowedComponents?: string[]
  } | null>(null)
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
    setFieldWizardStep('select')
    setIsFieldModalOpen(true)
  }

  const openEditField = (name: string, attr: any) => {
    setOriginalFieldName(name)
    setEditingFieldData({
      name,
      type: attr.type,
      required: !!attr.required,
      component: attr.component || '',
      repeatable: !!attr.repeatable,
      relation: attr.relation || undefined,
      allowedComponents: attr.allowedComponents || undefined
    })
    setFieldWizardStep('configure')
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
        } : {}),
        ...(editingFieldData.type === 'relation' ? {
          relation: editingFieldData.relation
        } : {}),
        ...(editingFieldData.type === 'dynamiczone' ? {
          allowedComponents: editingFieldData.allowedComponents || []
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

      // Trigger sidebar refresh
      window.dispatchEvent(new Event('cms-schema-changed'))

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

      // Trigger sidebar refresh
      window.dispatchEvent(new Event('cms-schema-changed'))

      router.push('/content-type-builder/create')
      router.refresh()
    } catch (err: any) {
      setError(err.message)
      setIsDeleting(false)
      setIsDeleteModalOpen(false)
    }
  }

  if (isCreate) {
    return (
      <div className="max-w-3xl mx-auto mt-8">
        <div className="p-8 border border-border rounded-xl bg-card shadow-sm">
          <div className="mb-8 text-center">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight">Create a Content Type</h2>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">
              Define the name and type of your new content structure to start building your schema.
            </p>
          </div>
          
          <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); handleSaveSchema(); }}>
            {error && <div className="p-4 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20 text-center">{error}</div>}
            
            <div className="space-y-6 max-w-xl mx-auto">
              <div>
                <label className="block text-sm font-semibold mb-2">Display Name <span className="text-destructive">*</span></label>
                <input
                  type="text"
                  value={schema.displayName}
                  onChange={(e) => handleSchemaChange('displayName', e.target.value)}
                  className="w-full px-4 py-3 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-base bg-background transition-all shadow-sm"
                  placeholder="e.g. Article, Settings, Product"
                  autoFocus
                  required
                />
                <p className="text-xs text-muted-foreground mt-2 flex justify-between">
                  <span>This will automatically generate the API IDs.</span>
                  {schema.apiId && <span className="font-mono bg-muted/50 px-2 py-0.5 rounded">apiId: {schema.apiId}</span>}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Type Kind <span className="text-destructive">*</span></label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'collectionType', label: 'Collection Type', desc: 'Multiple entries' },
                    { id: 'singleType', label: 'Single Type', desc: 'One entry (e.g. settings)' },
                    { id: 'component', label: 'Component', desc: 'Reusable fields' }
                  ].map(kind => (
                    <button
                      key={kind.id}
                      type="button"
                      onClick={() => handleSchemaChange('kind', kind.id)}
                      className={`text-left p-4 rounded-xl border transition-all ${schema.kind === kind.id
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20 shadow-sm'
                        : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30'
                        }`}
                    >
                      <div className="font-medium text-sm mb-1">{kind.label}</div>
                      <div className="text-xs text-muted-foreground">{kind.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-8 border-t border-border">
               <button
                 type="button"
                 onClick={() => router.push('/content-type-builder')}
                 className="px-6 py-2.5 text-sm font-medium hover:bg-muted/50 rounded-lg transition-colors border border-transparent hover:border-border"
               >
                 Cancel
               </button>
              <button 
                type="submit"
                disabled={isSaving || !schema.displayName}
                className="px-8 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
              >
                {isSaving ? 'Creating...' : 'Continue to Schema Builder'} <ChevronRight className="w-4 h-4 hidden sm:block"/>
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // Edit Mode Return
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold tracking-tight">{schema.displayName}</h2>
            <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider border border-primary/20">
              {schema.kind || 'collectionType'}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1 font-mono">
            apiId: {schema.apiId}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {error && <span className="text-sm text-destructive">{error}</span>}
          <button 
            onClick={() => setIsDeleteModalOpen(true)}
            disabled={isSaving || isDeleting}
            className="flex items-center gap-2 px-4 py-2 text-destructive bg-destructive/5 hover:bg-destructive/15 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          <button 
            onClick={handleSaveSchema}
            disabled={isSaving || isDeleting}
            className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 shadow-sm transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Schema'}
          </button>
        </div>
      </div>

      <div className="border border-border rounded-xl bg-card shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center border-b border-border bg-muted/10 px-4">
          <button
            onClick={() => setActiveTab('fields')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'fields' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Fields ({Object.keys(schema.attributes || {}).length})
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'settings' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            Settings
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'settings' ? (
            <div className="max-w-2xl space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold mb-1.5">Display Name</label>
                  <input
                    type="text"
                    value={schema.displayName}
                    onChange={(e) => handleSchemaChange('displayName', e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5 text-muted-foreground">API ID (Immutable)</label>
                  <input
                    type="text"
                    value={schema.apiId}
                    disabled
                    className="w-full px-3 py-2 border border-input/50 rounded-md text-sm bg-muted/30 text-muted-foreground cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5">Singular Name</label>
                  <input 
                    type="text" 
                    value={schema.singularName}
                    onChange={(e) => handleSchemaChange('singularName', e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-background" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5">Plural Name</label>
                  <input 
                    type="text" 
                    value={schema.pluralName}
                    onChange={(e) => handleSchemaChange('pluralName', e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-background" 
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-muted-foreground">Define the fields for this content type.</p>
                <button onClick={openNewField} className="text-sm font-semibold text-primary flex items-center gap-1.5 hover:underline bg-primary/5 px-3 py-1.5 rounded-md transition-colors">
                  <Plus className="w-4 h-4" />
                  Add another field
                </button>
              </div>
              
              <div className="border border-border rounded-lg overflow-hidden bg-background shadow-sm">
                {Object.keys(schema.attributes || {}).length === 0 ? (
                   <div className="p-12 text-center flex flex-col items-center justify-center border-t border-border">
                     <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3 text-muted-foreground/50 border border-border/50">
                        <Plus className="w-6 h-6" />
                     </div>
                     <h3 className="text-base font-semibold mb-1">No fields yet</h3>
                     <p className="text-muted-foreground text-sm max-w-sm">Start building your schema by adding fields like text, media, or relations.</p>
                     <button onClick={openNewField} className="mt-4 text-sm font-medium text-primary-foreground bg-primary px-4 py-2 rounded-md hover:bg-primary/90 transition-colors shadow-sm">
                       Add first field
                     </button>
                   </div>
                ) : (
                  <div className="divide-y divide-border">
                    {Object.entries(schema.attributes || {}).map(([key, attr]: [string, any]) => {
                       const relTarget = attr.relation ? allSchemas.find(s => s.apiId === attr.relation.target)?.displayName : null;
                       return (
                      <div key={key} className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors group">
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col items-center justify-center text-muted-foreground/30 px-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-ns-resize">
                            <div className="w-4 h-1 border-t-2 border-current rounded-sm mb-0.5" />
                            <div className="w-4 h-1 border-t-2 border-current rounded-sm" />
                          </div>
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-mono text-xs uppercase tracking-wider font-bold shadow-sm border border-primary/20">
                            {attr.type.substring(0, 3)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                               <p className="font-semibold text-sm">{key}</p>
                               {attr.required && <span className="w-1.5 h-1.5 rounded-full bg-destructive" title="Required field" />}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs text-muted-foreground font-medium">{attr.type}</span>
                              
                              {attr.type === 'component' && (
                                <>
                                  <span className="text-[10px] text-muted-foreground/40">•</span>
                                  <span className="text-xs text-amber-600 dark:text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded font-mono">
                                    {allSchemas.find(s => s.apiId === attr.component)?.displayName || attr.component}
                                  </span>
                                  {attr.repeatable && <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wide bg-muted px-1 rounded">Array</span>}
                                </>
                              )}

                              {attr.type === 'relation' && attr.relation && (
                                <>
                                  <span className="text-[10px] text-muted-foreground/40">•</span>
                                  <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400">
                                    {attr.relation.relation.replace(/([A-Z])/g, ' $1').trim()}
                                  </span>
                                  <span className="text-xs text-muted-foreground">with</span>
                                  <span className="text-xs text-foreground font-medium bg-muted px-1.5 py-0.5 rounded border border-border/50 shadow-sm">
                                    {relTarget || attr.relation.target}
                                  </span>
                                </>
                              )}

                              {attr.type === 'dynamiczone' && attr.allowedComponents && (
                                <>
                                  <span className="text-[10px] text-muted-foreground/40">•</span>
                                  <span className="text-xs text-muted-foreground">
                                    {attr.allowedComponents.length} component(s) allowed
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           <button 
                             type="button"
                             onClick={() => openEditField(key, attr)}
                             className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                           >
                             <Edit2 className="w-4 h-4" />
                           </button>
                           <button 
                             type="button"
                             onClick={() => removeField(key)}
                             className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                           >
                             <Trash2 className="w-4 h-4" />
                           </button>
                        </div>
                      </div>
                    )})}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Field Editor Modal */}
      {isFieldModalOpen && editingFieldData && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-xl border border-border shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-border bg-card z-10">
              <div className="flex items-center gap-3">
                {fieldWizardStep === 'configure' && !originalFieldName && (
                  <button onClick={() => setFieldWizardStep('select')} className="text-muted-foreground hover:text-foreground transition-colors p-1.5 hover:bg-muted rounded-md">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                )}
                <div>
                  <h3 className="text-xl font-bold">
                    {originalFieldName ? 'Edit Field' : (fieldWizardStep === 'select' ? 'Select Field Type' : 'Configure Field')}
                  </h3>
                  {fieldWizardStep === 'configure' && (
                    <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 mt-1">
                      Type: <span className="uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded">{editingFieldData.type}</span>
                    </p>
                  )}
                </div>
              </div>
              <button 
                onClick={() => setIsFieldModalOpen(false)} 
                className="text-muted-foreground hover:text-foreground bg-muted/20 hover:bg-muted/50 p-2 rounded-full transition-colors"
               >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-muted/5">
              {fieldWizardStep === 'select' ? (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Basic Types</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        { id: 'string', label: 'String', desc: 'Short text (titles, names)' },
                        { id: 'text', label: 'Text', desc: 'Long text (descriptions)' },
                        { id: 'number', label: 'Number', desc: 'Integers or decimals' },
                        { id: 'boolean', label: 'Boolean', desc: 'True or False' },
                        { id: 'email', label: 'Email', desc: 'Email address format' },
                        { id: 'uid', label: 'UID', desc: 'Unique identifier / slug' }
                      ].map(type => (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => {
                            setEditingFieldData({ ...editingFieldData, type: type.id })
                            setFieldWizardStep('configure')
                          }}
                          className="text-left p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-md transition-all group"
                        >
                          <div className="font-semibold text-sm mb-1 text-foreground group-hover:text-primary transition-colors">{type.label}</div>
                          <div className="text-xs text-muted-foreground leading-snug">{type.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Advanced Types</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        { id: 'richtext', label: 'Rich Text', desc: 'Markdown formatting' },
                        { id: 'media', label: 'Media', desc: 'Images, videos, files' },
                        { id: 'json', label: 'JSON', desc: 'Raw JSON data' },
                        { id: 'enumeration', label: 'Enumeration', desc: 'List of specific values' }
                      ].map(type => (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => {
                            setEditingFieldData({ ...editingFieldData, type: type.id })
                            setFieldWizardStep('configure')
                          }}
                          className="text-left p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-md transition-all group"
                        >
                          <div className="font-semibold text-sm mb-1 text-foreground group-hover:text-primary transition-colors">{type.label}</div>
                          <div className="text-xs text-muted-foreground leading-snug">{type.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Relational</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[
                        { id: 'relation', label: 'Relation', desc: 'Link to other entries' },
                        { id: 'component', label: 'Component', desc: 'Reusable field group' },
                        { id: 'dynamiczone', label: 'Dynamic Zone', desc: 'Flexible nested blocks' }
                      ].map(type => (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => {
                            setEditingFieldData({ ...editingFieldData, type: type.id })
                            setFieldWizardStep('configure')
                          }}
                          className="text-left p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-md transition-all group"
                        >
                          <div className="font-semibold text-sm mb-1 text-primary group-hover:text-primary/80 transition-colors">{type.label}</div>
                          <div className="text-xs text-muted-foreground leading-snug">{type.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                  {/* Basic Field Info */}
                  <div className="grid grid-cols-1 gap-6 p-5 bg-card border border-border rounded-xl shadow-sm">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold flex items-center gap-2">
                          Field Name
                          <span className="text-destructive">*</span>
                        </label>
                        <input
                          type="text"
                          value={editingFieldData.name}
                          onChange={(e) => setEditingFieldData({ ...editingFieldData, name: e.target.value })}
                          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-background transition-shadow"
                          placeholder="e.g. title, coverImage"
                          autoFocus
                        />
                        <p className="text-xs text-muted-foreground">The API identifier for this field.</p>
                      </div>

                      <div className="space-y-3">
                        <label className="text-sm font-semibold">Base Settings</label>
                        <label className="flex items-center gap-3 p-3 border border-border rounded-lg bg-muted/10 cursor-pointer hover:bg-muted/30 transition-colors">
                          <input
                            type="checkbox"
                            checked={editingFieldData.required}
                            onChange={(e) => setEditingFieldData({ ...editingFieldData, required: e.target.checked })}
                            className="h-4 w-4 rounded border-input text-primary focus:ring-primary/50"
                          />
                          <span className="text-sm font-medium">Required field</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Advanced Configuration Sections based on Type */}
                  {(editingFieldData.type === 'component' || editingFieldData.type === 'relation' || editingFieldData.type === 'dynamiczone') && (
                    <div className="space-y-4 p-5 bg-card border border-indigo-100 dark:border-indigo-900/50 rounded-xl shadow-sm">
                      {editingFieldData.type === 'component' && (
                        <div className="space-y-4">
                          <h4 className="text-sm font-bold text-indigo-600 dark:text-indigo-400">Component Configuration</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <label className="block text-sm font-medium mb-1.5">Select Component</label>
                              <select
                                value={editingFieldData.component || ''}
                                onChange={(e) => setEditingFieldData({ ...editingFieldData, component: e.target.value })}
                                className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-background shadow-sm"
                              >
                                <option value="">Select a component...</option>
                                {allSchemas && allSchemas.filter(s => s.kind === 'component').map(comp => (
                                  <option key={comp.apiId} value={comp.apiId}>{comp.displayName}</option>
                                ))}
                              </select>
                            </div>
                            <div className="flex items-end pb-1">
                              <label className="flex items-center gap-3 p-2.5 border border-border/50 rounded-md cursor-pointer hover:bg-muted/30 transition-colors w-full">
                                <input
                                  type="checkbox"
                                  checked={editingFieldData.repeatable || false}
                                  onChange={(e) => setEditingFieldData({ ...editingFieldData, repeatable: e.target.checked })}
                                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary/50"
                                />
                                <span className="text-sm font-medium">Repeatable (Array)</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      )}

                      {editingFieldData.type === 'relation' && (
                        <div className="space-y-4">
                          <h4 className="text-sm font-bold text-indigo-600 dark:text-indigo-400">Relation Configuration</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <label className="block text-sm font-medium mb-1.5">Target Content Type</label>
                              <select
                                value={(editingFieldData as any).relation?.target || ''}
                                onChange={(e) => setEditingFieldData({
                                  ...editingFieldData,
                                  relation: { ...(editingFieldData as any).relation, target: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-background shadow-sm"
                              >
                                <option value="">Select a target...</option>
                                {allSchemas && allSchemas.filter(s => s.kind !== 'component').map(schema => (
                                  <option key={schema.apiId} value={schema.apiId}>{schema.displayName}</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-sm font-medium mb-1.5">Relation Type</label>
                              <select
                                value={(editingFieldData as any).relation?.relation || 'oneToOne'}
                                onChange={(e) => setEditingFieldData({
                                  ...editingFieldData,
                                  relation: { ...(editingFieldData as any).relation, relation: e.target.value }
                                })}
                                className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm bg-background shadow-sm"
                              >
                                <option value="oneToOne">One-to-One</option>
                                <option value="oneToMany">One-to-Many</option>
                                <option value="manyToOne">Many-to-One</option>
                                <option value="manyToMany">Many-to-Many</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}

                      {editingFieldData.type === 'dynamiczone' && (
                        <div className="space-y-4">
                          <h4 className="text-sm font-bold text-indigo-600 dark:text-indigo-400">Dynamic Zone Configuration</h4>
                          <p className="text-xs text-muted-foreground mb-3">Select which components can be added to this dynamic zone.</p>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-60 overflow-y-auto p-3 border border-border/50 rounded-lg bg-background/50">
                            {allSchemas && allSchemas.filter(s => s.kind === 'component').length === 0 ? (
                              <p className="col-span-full text-sm text-muted-foreground text-center py-6">No components available. Create components first.</p>
                            ) : (
                              allSchemas.filter(s => s.kind === 'component').map(comp => {
                                const isSelected = ((editingFieldData as any).allowedComponents || []).includes(comp.apiId)
                                return (
                                  <label key={comp.apiId} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all shadow-sm ${isSelected ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20 shadow-indigo-500/10' : 'border-border bg-card hover:border-indigo-300'}`}>
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={(e) => {
                                        const currentAllowed = (editingFieldData as any).allowedComponents || []
                                        const newAllowed = e.target.checked
                                          ? [...currentAllowed, comp.apiId]
                                          : currentAllowed.filter((id: string) => id !== comp.apiId)
                                        setEditingFieldData({ ...editingFieldData, allowedComponents: newAllowed })
                                      }}
                                      className="mt-0.5 h-4 w-4 rounded border-input text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <div className="space-y-1">
                                      <span className="text-sm font-semibold leading-tight block">{comp.displayName}</span>
                                      {comp.description && <span className="text-[10px] text-muted-foreground block line-clamp-2 leading-snug">{comp.description}</span>}
                                    </div>
                                  </label>
                                )
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            {fieldWizardStep === 'configure' && (
              <div className="p-6 border-t border-border bg-card flex justify-end gap-3 rounded-b-xl z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <button
                  onClick={() => setIsFieldModalOpen(false)}
                  className="px-6 py-2.5 text-sm font-medium border border-input bg-background rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveField}
                  disabled={!editingFieldData.name || !editingFieldData.type || (editingFieldData.type === 'component' && !editingFieldData.component) || (editingFieldData.type === 'relation' && !(editingFieldData as any).relation?.target)}
                  className="px-8 py-2.5 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {originalFieldName ? 'Update Field' : 'Add Field'}
                </button>
              </div>
            )}
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
