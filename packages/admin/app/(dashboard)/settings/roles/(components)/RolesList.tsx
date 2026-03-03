'use client'

import React, { useEffect, useState } from 'react'
import { Plus, Shield, Edit2, Trash2 } from 'lucide-react'
import Link from 'next/link'

export default function RolesList() {
  const [roles, setRoles] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchRoles()
  }, [])

  const fetchRoles = async () => {
    try {
      const res = await fetch('/api/settings/roles')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch roles')
      
      setRoles(data.data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this role? This might break access for some users.')) return
    
    try {
      const res = await fetch(`/api/settings/roles/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete role')
      
      setRoles(prev => prev.filter(r => r.id !== id))
    } catch(err: any) {
      alert(err.message)
    }
  }

  if (isLoading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Loading roles...</div>
  if (error) return <div className="p-4 bg-destructive/10 text-destructive rounded-md">{error}</div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-border">
        <div>
          <h2 className="text-xl font-semibold">Roles</h2>
          <p className="text-sm text-muted-foreground">Configure access control levels and permissions</p>
        </div>
        <Link 
          href="/settings/roles/new"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Role
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roles.map(role => (
          <div key={role.id} className="border border-border rounded-lg p-5 flex items-start justify-between hover:border-primary/50 transition-colors bg-background">
            <div className="flex gap-4">
              <div className="p-2 border border-border rounded-md bg-muted/30 shrink-0">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-base flex items-center gap-2">
                   {role.name}
                   {role.id === 'admin' && <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-sm uppercase tracking-wider">System</span>}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">{role.description || 'No description provided'}</p>
                <div className="mt-3 flex gap-2 flex-wrap">
                   <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-md">
                      {role.permissions?.length || 0} permissions
                   </span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col gap-2">
               <Link 
                  href={`/settings/roles/${role.id}`}
                  className="p-2 text-muted-foreground hover:text-primary transition-colors border border-transparent rounded-md hover:bg-accent shrink-0 flex items-center justify-center"
               >
                 <Edit2 className="w-4 h-4" />
               </Link>
               {role.id !== 'admin' && role.id !== 'public' && (
                  <button 
                     onClick={() => handleDelete(role.id)}
                     className="p-2 text-muted-foreground hover:text-destructive transition-colors border border-transparent rounded-md hover:bg-destructive/10 shrink-0 flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
               )}
            </div>
          </div>
        ))}
        {roles.length === 0 && (
           <div className="col-span-full p-8 text-center text-muted-foreground border border-dashed border-border rounded-xl">
              No roles found.
           </div>
        )}
      </div>
    </div>
  )
}
