'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, Plus, Trash2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

type RoleFormProps = {
  initialRole: any | null
  isNew: boolean
}

export default function RoleForm({ initialRole, isNew }: RoleFormProps) {
  const router = useRouter()
  const [role, setRole] = useState(initialRole || {
    id: '',
    name: '',
    description: '',
    permissions: []
  })
  
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Quick helper to add a blank permission row
  const addPermission = () => {
    setRole((prev: any) => ({
      ...prev,
      permissions: [
         ...prev.permissions, 
         { effect: 'allow', action: 'content.read', resource: '*', conditions: [] }
      ]
    }))
  }

  const updatePermission = (index: number, field: string, value: string) => {
    setRole((prev: any) => {
       const updated = [...prev.permissions]
       updated[index] = { ...updated[index], [field]: value }
       return { ...prev, permissions: updated }
    })
  }

  const removePermission = (index: number) => {
    setRole((prev: any) => {
       const updated = [...prev.permissions]
       updated.splice(index, 1)
       return { ...prev, permissions: updated }
    })
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)

    try {
      const url = isNew ? '/api/settings/roles' : `/api/settings/roles/${role.id}`
      const method = isNew ? 'POST' : 'PUT'
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: role })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save role')

      router.push('/settings/roles')
      router.refresh()
    } catch (err: any) {
      setError(err.message)
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-border">
        <div className="flex items-center gap-4">
          <Link href="/settings/roles" className="p-2 border border-border rounded-md hover:bg-accent text-muted-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h2 className="text-xl font-semibold">{isNew ? 'Create New Role' : `Edit details: ${role.name}`}</h2>
            <p className="text-sm text-muted-foreground">{isNew ? 'Configure a new access profile' : `Role ID: ${role.id}`}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {error && <span className="text-sm text-destructive">{error}</span>}
          <button 
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors font-medium text-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Role'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         {/* Main Details */}
         <div className="md:col-span-1 space-y-6">
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
               <h3 className="font-semibold text-lg border-b border-border pb-2 mb-4">Role Details</h3>
               
               <div>
                 <label className="block text-sm font-medium mb-1">Role Name</label>
                 <input 
                   type="text" 
                   value={role.name}
                   onChange={e => setRole({...role, name: e.target.value})}
                   disabled={role.id === 'admin' && !isNew}
                   className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm disabled:opacity-50"
                   required
                 />
               </div>
               
               {isNew && (
                 <div>
                   <label className="block text-sm font-medium mb-1">Role ID (Internal)</label>
                   <input 
                     type="text" 
                     value={role.id}
                     onChange={e => setRole({...role, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '')})}
                     className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                     placeholder="e.g. content_editor"
                     required
                   />
                 </div>
               )}

               <div>
                 <label className="block text-sm font-medium mb-1">Description</label>
                 <textarea 
                   value={role.description}
                   onChange={e => setRole({...role, description: e.target.value})}
                   rows={3}
                   className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                 />
               </div>
            </div>
         </div>
         
         {/* Permissions Matrix Layout */}
         <div className="md:col-span-2">
            <div className="bg-card border border-border rounded-xl p-5">
               <div className="flex justify-between items-center border-b border-border pb-2 mb-4">
                 <h3 className="font-semibold text-lg">Permissions</h3>
                 {role.id !== 'admin' && (
                    <button 
                       type="button" 
                       onClick={addPermission}
                       className="text-primary text-sm font-medium flex items-center gap-1 hover:underline"
                    >
                       <Plus className="w-4 h-4" /> Add Rule
                    </button>
                 )}
               </div>
               
               {role.id === 'admin' ? (
                 <div className="p-6 text-center text-muted-foreground bg-muted/20 border border-border rounded-lg">
                    The Super Admin role inherently has full wildcard permissions `{"{ effect: 'allow', action: '*', resource: '*' }"}`. It cannot be restricted.
                 </div>
               ) : (
                 <div className="space-y-3">
                    {role.permissions?.length === 0 ? (
                       <div className="p-6 text-center text-muted-foreground">
                          No specific permissions defined. Users in this role will have no access.
                       </div>
                    ) : (
                       role.permissions?.map((perm: any, i: number) => (
                          <div key={i} className="flex gap-2 items-start bg-muted/20 p-3 rounded-lg border border-border">
                             <div className="flex-1 grid grid-cols-3 gap-3">
                                <div>
                                   <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Effect</label>
                                   <select 
                                     value={perm.effect}
                                     onChange={e => updatePermission(i, 'effect', e.target.value)}
                                     className="w-full text-sm border-input rounded bg-background p-1.5 focus:ring-primary focus:border-primary"
                                   >
                                      <option value="allow">Allow</option>
                                      <option value="deny">Deny</option>
                                   </select>
                                </div>
                                <div>
                                   <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Action</label>
                                   <input 
                                     type="text" 
                                     value={perm.action}
                                     onChange={e => updatePermission(i, 'action', e.target.value)}
                                     placeholder="e.g. content.read"
                                     className="w-full text-sm border border-input rounded bg-background p-1.5 focus:ring-1 focus:ring-primary"
                                     title="content.read, content.write, schema.manage, etc."
                                   />
                                </div>
                                <div>
                                   <label className="block text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Resource</label>
                                   <input 
                                     type="text" 
                                     value={perm.resource}
                                     onChange={e => updatePermission(i, 'resource', e.target.value)}
                                     placeholder="e.g. content::article"
                                     className="w-full text-sm border border-input rounded bg-background p-1.5 focus:ring-1 focus:ring-primary"
                                   />
                                </div>
                             </div>
                             <button 
                               type="button"
                               onClick={() => removePermission(i)}
                               className="p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded mt-5 transition-colors"
                             >
                                <Trash2 className="w-4 h-4" />
                             </button>
                          </div>
                       ))
                    )}
                 </div>
               )}
            </div>
         </div>
      </div>
    </form>
  )
}
