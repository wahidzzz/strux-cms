'use client'

import { useState, useEffect } from 'react'
import { Plus, Key, Copy, Trash2, Calendar, Shield, Loader2, Check, AlertCircle, Eye, EyeOff } from 'lucide-react'

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [error, setError] = useState('')
  const [createdKey, setCreatedKey] = useState<any>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchKeys()
  }, [])

  const fetchKeys = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/settings/api-keys')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || data.message || `Failed to fetch API keys (${res.status})`)
      }
      const data = await res.json()
      setKeys(data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKeyName) return

    setIsCreating(true)
    setError('')
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName, permissions: ['*'] })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Failed to create API key')
      }
      const data = await res.json()
      setCreatedKey(data)
      setNewKeyName('')
      fetchKeys()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsCreating(false)
    }
  }

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) return

    try {
      const res = await fetch(`/api/settings/api-keys/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to revoke API key')
      setKeys(prev => prev.filter(k => k.id !== id))
    } catch (err: any) {
      setError(err.message)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading && keys.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
        <p className="text-muted-foreground mt-2">
          Manage API keys for external access to your CMS content.
        </p>
      </div>

      {error && (
        <div className="bg-destructive/15 text-destructive p-4 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* New Key Success Modal/Alert */}
      {createdKey && (
        <div className="bg-emerald-500/10 border-2 border-emerald-500/20 p-6 rounded-2xl space-y-4">
          <div className="flex items-center gap-3 text-emerald-600">
            <div className="bg-emerald-500 text-white p-1 rounded-full">
              <Check className="w-4 h-4" />
            </div>
            <h3 className="text-lg font-bold">API Key Created Successfully!</h3>
          </div>
          <p className="text-sm text-emerald-700/80">
            Please copy this key now. For your security, it will not be shown again.
          </p>
          <div className="flex items-center gap-2 bg-background border-2 border-border p-3 rounded-xl font-mono text-sm group">
            <span className="flex-1 truncate">{createdKey.key}</span>
            <button
              onClick={() => copyToClipboard(createdKey.key)}
              className="p-2 hover:bg-muted rounded-md transition-colors"
              title="Copy to clipboard"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={() => setCreatedKey(null)}
            className="text-sm font-semibold text-emerald-600 hover:underline"
          >
            I&apos;ve saved my key
          </button>
        </div>
      )}

      {/* Create Form */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border bg-muted/30">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            Create New API Key
          </h2>
        </div>
        <form onSubmit={handleCreate} className="p-6 flex items-end gap-4">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-semibold">Key Name</label>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. Production Web Frontend"
              className="w-full bg-background border border-input rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isCreating || !newKeyName}
            className="bg-primary text-primary-foreground h-[46px] px-6 rounded-xl font-bold hover:bg-primary/90 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:scale-100"
          >
            {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Generate Key'}
          </button>
        </form>
      </div>

      {/* Keys Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border bg-muted/30 flex items-center justify-between">
          <h2 className="font-bold text-lg">Active API Keys</h2>
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground bg-muted px-3 py-1 rounded-full">
            {keys.length} Keys
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Key Name</th>
                <th className="px-6 py-4">Identifier / Prefix</th>
                <th className="px-6 py-4">Scopes</th>
                <th className="px-6 py-4">Created</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {keys.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground italic">
                    No active API keys found.
                  </td>
                </tr>
              ) : (
                keys.map((key) => (
                  <tr key={key.id} className="hover:bg-muted/10 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold text-foreground">{key.name}</div>
                      <div className="text-[10px] uppercase font-bold text-muted-foreground/60 flex items-center gap-1 mt-1">
                        <Shield className="w-3 h-3" /> ID: {key.id}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <code className="bg-muted px-2.5 py-1 rounded-lg text-sm font-mono tracking-tight">
                        {key.prefix || 'jayson_••••'}
                      </code>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {key.permissions.map((p: string) => (
                          <span key={p} className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase tracking-tighter">
                            {p === '*' ? 'Full Access' : p}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-foreground/80 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                        {new Date(key.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleRevoke(key.id)}
                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        title="Revoke Key"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
