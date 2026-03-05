'use client'

import { useState, useEffect } from 'react'
import { X, Save, KeyRound } from 'lucide-react'

type UserModalProps = {
  isOpen: boolean
  onClose: () => void
  user: any | null
  onSaved: () => void
}

export function UserModal({ isOpen, onClose, user, onSaved }: UserModalProps) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('authenticated')
  const [roles, setRoles] = useState<any[]>([])
  
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const isEditMode = !!user

  useEffect(() => {
    if (isOpen) {
      if (isEditMode) {
        setUsername(user.username || '')
        setEmail(user.email || '')
        setRole(user.role || 'authenticated')
        setPassword('')
      } else {
        setUsername('')
        setEmail('')
        setPassword('')
        setRole('authenticated')
      }
      setError('')
      fetchRoles()
    }
  }, [isOpen, user, isEditMode])

  const fetchRoles = async () => {
    try {
      const res = await fetch('/api/roles')
      if (res.ok) {
        const data = await res.json()
        setRoles(data)
      }
    } catch (err) {
      console.error('Failed to fetch roles', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const payload: any = { username, email, role }
      if (password) {
        payload.password = password
      }

      const url = isEditMode ? `/api/users/${user.id}` : '/api/users'
      const method = isEditMode ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to save user')
      }

      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card w-full max-w-md rounded-xl shadow-xl border border-border flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">{isEditMode ? 'Edit User' : 'Create New User'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto">
          {error && (
            <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm mb-4">
              {error}
            </div>
          )}

          <form id="userForm" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                required
              >
                {roles.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
                {roles.length === 0 && (
                   <option value="authenticated">Authenticated</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 flex items-center justify-between">
                <span>Password</span>
                {isEditMode && <span className="text-xs text-muted-foreground font-normal">(Leave blank to keep unchanged)</span>}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  required={!isEditMode}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder={isEditMode ? '••••••••' : 'Enter password'}
                />
              </div>
            </div>
          </form>
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-3 bg-muted/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-input rounded-md text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="userForm"
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isLoading ? 'Saving...' : 'Save User'}
          </button>
        </div>
      </div>
    </div>
  )
}
