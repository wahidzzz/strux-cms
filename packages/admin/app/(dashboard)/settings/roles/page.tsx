'use client'

import { useState, useEffect } from 'react'
import { Shield, Plus, Edit, Trash2, Settings, Loader2, Crown } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function RolesPage() {
  const [roles, setRoles] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()

  const fetchRoles = async () => {
    setIsLoading(true)
    setError('')
    try {
      const res = await fetch('/api/roles')
      if (!res.ok) throw new Error('Failed to fetch roles')
      const data = await res.json()
      setRoles(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchRoles()
  }, [])

  const handleCreate = async () => {
    const name = prompt('Enter a name for the new role:')
    if (!name) return

    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: `Custom role for ${name}`, permissions: [] })
      })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to create role')
      }
      const newRole = await res.json()
      router.push(`/settings/roles/${newRole.id}`)
    } catch (err: any) {
      alert(`Error creating role: ${err.message}`)
    }
  }

  const handleDelete = async (role: any) => {
    if (role.type === 'system') {
      alert('System roles cannot be deleted.')
      return
    }

    if (!confirm(`Are you sure you want to delete the role "${role.name}"?`)) return

    try {
      const res = await fetch(`/api/roles/${role.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to delete role')
      }
      fetchRoles()
    } catch (err: any) {
      alert(`Error deleting role: ${err.message}`)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Roles & Permissions</h1>
          <p className="text-muted-foreground mt-1">Configure access levels and granular content permissions.</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 bg-primary text-primary-foreground py-2 px-4 rounded-md font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create New Role
        </button>
      </div>

      {error ? (
        <div className="bg-destructive/15 text-destructive p-4 rounded-md">
          {error}
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => (
            <div key={role.id} className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg ${role.type === 'super_admin' ? 'bg-amber-500/10 text-amber-600' : 'bg-primary/10 text-primary'}`}>
                    {role.type === 'super_admin' ? <Crown className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{role.name}</h3>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${role.type === 'super_admin' ? 'bg-amber-500 text-white' :
                        role.type === 'admin' ? 'bg-blue-500/10 text-blue-600' :
                          'bg-emerald-500/10 text-emerald-600'
                      }`}>
                      {role.type === 'super_admin' ? 'Super Admin' :
                        role.type === 'admin' ? 'Administrator' :
                          'Custom Role'}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground mb-6 flex-grow">{role.description}</p>

              <div className="flex items-center gap-2 pt-4 border-t border-border">
                <Link
                  href={`/settings/roles/${role.id}`}
                  className="flex-1 flex justify-center items-center gap-2 py-2 px-3 bg-muted hover:bg-muted/80 rounded-md text-sm font-medium transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Configure
                </Link>
                {(role.type !== 'system' && role.type !== 'super_admin' && role.type !== 'admin') && (
                  <button
                    onClick={() => handleDelete(role)}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                    title="Delete Role"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
