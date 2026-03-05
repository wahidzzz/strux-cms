'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Save, ArrowLeft, Loader2, Info, Check } from 'lucide-react'
import Link from 'next/link'

const ACTIONS = ['create', 'read', 'update', 'delete', 'publish', 'unpublish']

export default function RoleDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [role, setRole] = useState<any>(null)
  const [schemas, setSchemas] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // State to hold the working permissions before saving
  const [workingPermissions, setWorkingPermissions] = useState<any[]>([])

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        const [roleRes, schemasRes] = await Promise.all([
          fetch(`/api/roles/${params.id}`),
          fetch('/api/schemas')
        ])

        if (!roleRes.ok) throw new Error('Failed to fetch role')
        if (!schemasRes.ok) throw new Error('Failed to fetch schemas')

        const roleData = await roleRes.json()
        const schemasData = await schemasRes.json()

        setRole(roleData)
        setWorkingPermissions(roleData.permissions || [])

        // Filter out components for subjects, only keeping collection and single types
        // The API might return { data: [...] } or just an array depending on the response format
        const schemaArray = Array.isArray(schemasData) ? schemasData : schemasData.data || []
        setSchemas(schemaArray.filter((s: any) => s.kind !== 'component'))
      } catch (err: any) {
        setError(err.message)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [params.id])

  const hasPermission = (subject: string, action: string) => {
    // Admin has * on all
    if (role?.type === 'admin') return true

    return workingPermissions.some(p =>
      (p.subject === subject || p.subject === 'all') &&
      (p.action === action || p.action === '*')
    )
  }

  const togglePermission = (subject: string, action: string) => {
    if (role?.type === 'admin') return // Admins cannot be edited via matrix easily here

    const hasPerm = hasPermission(subject, action)

    if (hasPerm) {
      // Remove it
      setWorkingPermissions(prev => prev.filter(p => !(p.subject === subject && p.action === action)))
    } else {
      // Add it
      setWorkingPermissions(prev => [...prev, { subject, action }])
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError('')
    setSuccessMsg('')

    try {
      const res = await fetch(`/api/roles/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: role.name,
          description: role.description,
          permissions: workingPermissions
        })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Failed to update role')
      }

      setSuccessMsg('Role updated successfully')
      setTimeout(() => setSuccessMsg(''), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && !role) {
    return <div className="text-destructive bg-destructive/10 p-4 rounded-md">{error}</div>
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings/roles" className="p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{role?.name}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{role?.description}</p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {successMsg && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 bg-emerald-500/10 px-3 py-1.5 rounded-full font-medium">
              <Check className="w-4 h-4" /> {successMsg}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving || role?.type === 'admin'}
            className="flex items-center gap-2 bg-primary text-primary-foreground py-2 px-4 rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Role'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/15 text-destructive p-4 rounded-md text-sm">
          {error}
        </div>
      )}

      {role?.type === 'admin' && (
        <div className="bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-400 p-4 rounded-xl flex items-start gap-3">
          <Info className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <p className="text-sm">The <strong>Admin</strong> role automatically has full superuser access to all resources and actions in the system. Its permissions cannot be granularly modified.</p>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-border bg-muted/30">
          <h2 className="font-semibold text-lg">Content Permissions</h2>
          <p className="text-sm text-muted-foreground mt-1">Configure which actions this role can perform on different content types.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
              <tr>
                <th className="px-6 py-4 w-1/4">Content Type</th>
                {ACTIONS.map(action => (
                  <th key={action} className="px-4 py-4 text-center">
                    {action}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {schemas.map(schema => (
                <tr key={schema.apiId} className="hover:bg-muted/20 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground">
                    {schema.displayName}
                  </td>
                  {ACTIONS.map(action => {
                    const isChecked = hasPermission(schema.apiId, action)
                    const isAdmin = role?.type === 'admin'

                    return (
                      <td key={`${schema.apiId}-${action}`} className="px-4 py-4 text-center">
                        <label className={`relative inline-flex items-center cursor-pointer ${isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}>
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={isChecked}
                            disabled={isAdmin}
                            onChange={() => togglePermission(schema.apiId, action)}
                          />
                          <div className="w-9 h-5 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                      </td>
                    )
                  })}
                </tr>
              ))}

              {/* Media Library Row */}
              <tr className="hover:bg-muted/20 transition-colors bg-muted/5">
                <td className="px-6 py-4 font-medium text-foreground flex items-center gap-2">
                  Media Library
                </td>
                {ACTIONS.map(action => {
                  const isChecked = hasPermission('media', action)
                  const isAdmin = role?.type === 'admin'

                  // Media doesn't really have publish/unpublish, we can disable or hide them
                  const isApplicable = !['publish', 'unpublish'].includes(action)

                  return (
                    <td key={`media-${action}`} className="px-4 py-4 text-center">
                      {isApplicable ? (
                        <label className={`relative inline-flex items-center cursor-pointer ${isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}>
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={isChecked}
                            disabled={isAdmin}
                            onChange={() => togglePermission('media', action)}
                          />
                          <div className="w-9 h-5 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                      ) : (
                        <span className="text-muted-foreground/30">-</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
