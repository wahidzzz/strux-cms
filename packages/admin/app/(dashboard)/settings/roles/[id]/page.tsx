'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Save, ArrowLeft, Loader2, Info, Check, CheckSquare, Square, MinusSquare, Crown } from 'lucide-react'
import Link from 'next/link'

const ACTIONS = ['create', 'read', 'update', 'delete', 'publish', 'unpublish'] as const
type ActionType = typeof ACTIONS[number]

export default function RoleDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [role, setRole] = useState<any>(null)
  const [schemas, setSchemas] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
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

  // All subjects including media
  const allSubjects = useMemo(() => {
    const subjects = schemas.map(s => ({ id: s.apiId, name: s.displayName, isMedia: false }))
    subjects.push({ id: 'media', name: 'Media Library', isMedia: true })
    return subjects
  }, [schemas])

  const isImmutable = role?.type === 'admin' || role?.type === 'super_admin'

  const hasPermission = (subject: string, action: string) => {
    if (isImmutable) return true
    return workingPermissions.some(p =>
      (p.subject === subject || p.subject === 'all') &&
      (p.action === action || p.action === '*')
    )
  }

  const isActionApplicable = (subject: string, action: string) => {
    if (subject === 'media') return !['publish', 'unpublish'].includes(action)
    return true
  }

  const togglePermission = (subject: string, action: string) => {
    if (isImmutable) return
    if (!isActionApplicable(subject, action)) return
    const hasPerm = hasPermission(subject, action)
    if (hasPerm) {
      setWorkingPermissions(prev => prev.filter(p => !(p.subject === subject && p.action === action)))
    } else {
      setWorkingPermissions(prev => [...prev, { subject, action }])
    }
  }

  // Select/deselect entire row (all actions for one content type)
  const toggleRow = (subject: string) => {
    if (isImmutable) return
    const applicableActions = ACTIONS.filter(a => isActionApplicable(subject, a))
    const allChecked = applicableActions.every(a => hasPermission(subject, a))

    if (allChecked) {
      // Uncheck all for this subject
      setWorkingPermissions(prev => prev.filter(p => p.subject !== subject))
    } else {
      // Check all applicable for this subject
      setWorkingPermissions(prev => {
        const filtered = prev.filter(p => p.subject !== subject)
        const newPerms = applicableActions.map(action => ({ subject, action }))
        return [...filtered, ...newPerms]
      })
    }
  }

  // Select/deselect entire column (one action for all content types)
  const toggleColumn = (action: string) => {
    if (isImmutable) return
    const applicableSubjects = allSubjects.filter(s => isActionApplicable(s.id, action))
    const allChecked = applicableSubjects.every(s => hasPermission(s.id, action))

    if (allChecked) {
      // Uncheck action for all subjects
      setWorkingPermissions(prev => prev.filter(p => p.action !== action))
    } else {
      // Check action for all applicable subjects
      setWorkingPermissions(prev => {
        const filtered = prev.filter(p => p.action !== action)
        const newPerms = applicableSubjects.map(s => ({ subject: s.id, action }))
        return [...filtered, ...newPerms]
      })
    }
  }

  // Select/deselect all permissions
  const toggleAll = () => {
    if (isImmutable) return
    const totalApplicable = allSubjects.reduce((sum, s) =>
      sum + ACTIONS.filter(a => isActionApplicable(s.id, a)).length, 0
    )
    const totalChecked = allSubjects.reduce((sum, s) =>
      sum + ACTIONS.filter(a => isActionApplicable(s.id, a) && hasPermission(s.id, a)).length, 0
    )

    if (totalChecked === totalApplicable) {
      // Uncheck all
      setWorkingPermissions([])
    } else {
      // Check all
      const all: any[] = []
      allSubjects.forEach(s => {
        ACTIONS.forEach(a => {
          if (isActionApplicable(s.id, a)) {
            all.push({ subject: s.id, action: a })
          }
        })
      })
      setWorkingPermissions(all)
    }
  }

  // Compute stats
  const stats = useMemo(() => {
    const totalApplicable = allSubjects.reduce((sum, s) =>
      sum + ACTIONS.filter(a => isActionApplicable(s.id, a)).length, 0
    )
    const totalChecked = allSubjects.reduce((sum, s) =>
      sum + ACTIONS.filter(a => isActionApplicable(s.id, a) && hasPermission(s.id, a)).length, 0
    )
    return { totalApplicable, totalChecked }
  }, [allSubjects, hasPermission])

  // Row check state
  const getRowState = (subject: string): 'all' | 'some' | 'none' => {
    const applicableActions = ACTIONS.filter(a => isActionApplicable(subject, a))
    const checked = applicableActions.filter(a => hasPermission(subject, a)).length
    if (checked === 0) return 'none'
    if (checked === applicableActions.length) return 'all'
    return 'some'
  }

  // Column check state
  const getColumnState = (action: string): 'all' | 'some' | 'none' => {
    const applicableSubjects = allSubjects.filter(s => isActionApplicable(s.id, action))
    const checked = applicableSubjects.filter(s => hasPermission(s.id, action)).length
    if (checked === 0) return 'none'
    if (checked === applicableSubjects.length) return 'all'
    return 'some'
  }

  const getAllState = (): 'all' | 'some' | 'none' => {
    if (stats.totalChecked === 0) return 'none'
    if (stats.totalChecked === stats.totalApplicable) return 'all'
    return 'some'
  }

  const CheckboxIcon = ({ state, disabled }: { state: 'all' | 'some' | 'none'; disabled?: boolean }) => {
    const cls = `w-5 h-5 ${disabled ? 'text-muted-foreground/40' : state === 'all' ? 'text-primary' : state === 'some' ? 'text-primary/60' : 'text-muted-foreground/40'}`
    if (state === 'all') return <CheckSquare className={cls} />
    if (state === 'some') return <MinusSquare className={cls} />
    return <Square className={cls} />
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
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/settings/roles" className="p-2 hover:bg-muted rounded-full text-muted-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-3">
          {role?.type === 'super_admin' && <Crown className="w-6 h-6 text-amber-500" />}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{role?.name}</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{role?.description}</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* Permission counter */}
          <span className="text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-full font-medium">
            {isImmutable ? 'All' : stats.totalChecked} / {stats.totalApplicable} permissions
          </span>
          {successMsg && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 bg-emerald-500/10 px-3 py-1.5 rounded-full font-medium">
              <Check className="w-4 h-4" /> {successMsg}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving || isImmutable}
            className="flex items-center gap-2 bg-primary text-primary-foreground py-2 px-4 rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Role'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/15 text-destructive p-4 rounded-md text-sm">{error}</div>
      )}

      {isImmutable && (
        <div className="bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-400 p-4 rounded-xl flex items-start gap-3">
          <Info className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <p className="text-sm">
            The <strong>{role?.name}</strong> role automatically has full superuser access to all resources and actions. Its permissions cannot be modified.
          </p>
        </div>
      )}

      {/* Permissions Matrix */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-border bg-muted/30 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-lg">Content Permissions</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure which actions this role can perform on different content types.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold">
              <tr>
                {/* Select All checkbox */}
                <th className="px-4 py-4 w-12">
                  <button
                    onClick={toggleAll}
                    disabled={isImmutable}
                    className="flex items-center justify-center hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Select All"
                  >
                    <CheckboxIcon state={isImmutable ? 'all' : getAllState()} disabled={isImmutable} />
                  </button>
                </th>
                <th className="px-4 py-4 w-1/4">Content Type</th>
                {/* Column select headers */}
                {ACTIONS.map(action => (
                  <th key={action} className="px-3 py-4 text-center">
                    <div className="flex flex-col items-center gap-1.5">
                      <button
                        onClick={() => toggleColumn(action)}
                        disabled={isImmutable}
                        className="flex items-center justify-center hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                        title={`Select all ${action}`}
                      >
                        <CheckboxIcon state={isImmutable ? 'all' : getColumnState(action)} disabled={isImmutable} />
                      </button>
                      <span className="text-[10px] tracking-wider">{action}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {allSubjects.map(subject => {
                const rowState = isImmutable ? 'all' : getRowState(subject.id)
                return (
                  <tr
                    key={subject.id}
                    className={`hover:bg-muted/20 transition-colors ${subject.isMedia ? 'bg-muted/5' : ''}`}
                  >
                    {/* Row select checkbox */}
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => toggleRow(subject.id)}
                        disabled={isImmutable}
                        className="flex items-center justify-center hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                        title={`Select all actions for ${subject.name}`}
                      >
                        <CheckboxIcon state={rowState} disabled={isImmutable} />
                      </button>
                    </td>
                    <td className="px-4 py-3.5 font-medium text-foreground">
                      {subject.name}
                    </td>
                    {ACTIONS.map(action => {
                      const isChecked = hasPermission(subject.id, action)
                      const applicable = isActionApplicable(subject.id, action)

                      return (
                        <td key={`${subject.id}-${action}`} className="px-3 py-3.5 text-center">
                          {applicable ? (
                            <label className={`inline-flex items-center justify-center cursor-pointer ${isImmutable ? 'cursor-not-allowed' : ''}`}>
                              <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={isChecked}
                                disabled={isImmutable}
                                onChange={() => togglePermission(subject.id, action)}
                              />
                              <div className={`
                                w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-all
                                ${isChecked
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'border-muted-foreground/30 hover:border-muted-foreground/50'
                                }
                                ${isImmutable ? 'opacity-60' : ''}
                              `}>
                                {isChecked && (
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            </label>
                          ) : (
                            <span className="text-muted-foreground/20">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
