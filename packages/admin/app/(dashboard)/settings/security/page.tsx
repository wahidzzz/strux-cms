'use client'

import { useState, useEffect } from 'react'
import { Shield, Lock, Globe, Save, Loader2, Check, AlertCircle, Ban, Plus, Trash2 } from 'lucide-react'

export default function SecurityPage() {
  const [config, setConfig] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/settings/security')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to fetch security settings')
      }
      const data = await res.json()
      setConfig(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError('')
    setSuccess(false)
    try {
      const res = await fetch('/api/settings/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      if (!res.ok) throw new Error('Failed to save security settings')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const addListItem = (type: 'blacklist' | 'whitelist' | 'origins') => {
    const value = prompt(`Enter ${type.slice(0, -1)}:`)
    if (!value) return

    if (type === 'origins') {
        setConfig((prev: any) => ({
            ...prev,
            cors: { ...prev.cors, origins: [...prev.cors.origins, value] }
        }))
    } else {
        setConfig((prev: any) => ({
            ...prev,
            ipBlocking: { ...prev.ipBlocking, [type]: [...prev.ipBlocking[type], value] }
        }))
    }
  }

  const removeListItem = (type: 'blacklist' | 'whitelist' | 'origins', index: number) => {
    if (type === 'origins') {
        setConfig((prev: any) => ({
            ...prev,
            cors: { ...prev.cors, origins: prev.cors.origins.filter((_: any, i: number) => i !== index) }
        }))
    } else {
        setConfig((prev: any) => ({
            ...prev,
            ipBlocking: { ...prev.ipBlocking, [type]: prev.ipBlocking[type].filter((_: any, i: number) => i !== index) }
        }))
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!config) return null

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Security Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure security policies, rate limiting, and access control.
        </p>
      </div>

      {error && (
        <div className="bg-destructive/15 text-destructive p-4 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/15 text-emerald-600 p-4 rounded-xl flex items-center gap-3 border border-emerald-500/20">
          <Check className="w-5 h-5" />
          <p className="text-sm font-bold">Settings saved successfully!</p>
        </div>
      )}

      {/* Rate Limiting */}
      <section className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-lg">Rate Limiting</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{config.rateLimit.enabled ? 'Enabled' : 'Disabled'}</span>
            <button
               onClick={() => setConfig({ ...config, rateLimit: { ...config.rateLimit, enabled: !config.rateLimit.enabled }})}
               className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${config.rateLimit.enabled ? 'bg-primary' : 'bg-muted'}`}
            >
              <span 
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.rateLimit.enabled ? 'translate-x-6' : 'translate-x-1'}`} 
              />
            </button>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Max Requests</label>
              <input
                type="number"
                value={config.rateLimit.maxRequests}
                onChange={(e) => setConfig({ ...config, rateLimit: { ...config.rateLimit, maxRequests: parseInt(e.target.value) }})}
                className="w-full bg-background border border-input rounded-xl px-4 py-2"
                placeholder="e.g. 60"
              />
              <p className="text-xs text-muted-foreground">Number of requests allowed per window.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Window (ms)</label>
              <input
                type="number"
                value={config.rateLimit.windowMs}
                onChange={(e) => setConfig({ ...config, rateLimit: { ...config.rateLimit, windowMs: parseInt(e.target.value) }})}
                className="w-full bg-background border border-input rounded-xl px-4 py-2"
                placeholder="e.g. 60000"
              />
              <p className="text-xs text-muted-foreground">Time window in milliseconds.</p>
            </div>
          </div>
        </div>
      </section>

      {/* IP Blocking */}
      <section className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ban className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-lg">IP Access Control</h2>
          </div>
          <div className="flex items-center gap-3">
             <span className="text-sm font-medium">{config.ipBlocking.enabled ? 'Enabled' : 'Disabled'}</span>
             <button
                onClick={() => setConfig({ ...config, ipBlocking: { ...config.ipBlocking, enabled: !config.ipBlocking.enabled }})}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${config.ipBlocking.enabled ? 'bg-primary' : 'bg-muted'}`}
             >
               <span 
                 className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.ipBlocking.enabled ? 'translate-x-6' : 'translate-x-1'}`} 
               />
             </button>
          </div>
        </div>
        <div className="p-6 space-y-8">
          {/* Blacklist */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Blacklist</h3>
                <button 
                  onClick={() => addListItem('blacklist')}
                  className="text-primary hover:bg-primary/10 p-1.5 rounded-lg transition-colors"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>
            <div className="space-y-2">
                {config.ipBlocking.blacklist.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No IPs blacklisted.</p>
                ) : (
                    config.ipBlocking.blacklist.map((ip: string, i: number) => (
                        <div key={i} className="flex items-center justify-between bg-muted/50 px-4 py-2 rounded-xl border border-border">
                            <code className="text-sm font-mono">{ip}</code>
                            <button onClick={() => removeListItem('blacklist', i)} className="text-destructive hover:bg-destructive/10 p-1 rounded-md">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))
                )}
            </div>
          </div>

          {/* Whitelist */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Whitelist (Always Allowed)</h3>
                <button 
                  onClick={() => addListItem('whitelist')}
                  className="text-primary hover:bg-primary/10 p-1.5 rounded-lg transition-colors"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>
            <div className="space-y-2">
                {config.ipBlocking.whitelist.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No IPs whitelisted.</p>
                ) : (
                    config.ipBlocking.whitelist.map((ip: string, i: number) => (
                        <div key={i} className="flex items-center justify-between bg-muted/50 px-4 py-2 rounded-xl border border-border">
                            <code className="text-sm font-mono">{ip}</code>
                            <button onClick={() => removeListItem('whitelist', i)} className="text-destructive hover:bg-destructive/10 p-1 rounded-md">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))
                )}
            </div>
          </div>
        </div>
      </section>

      {/* CORS */}
      <section className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-lg">CORS Configuration</h2>
          </div>
          <div className="flex items-center gap-3">
             <span className="text-sm font-medium">{config.cors.enabled ? 'Enabled' : 'Disabled'}</span>
             <button
                onClick={() => setConfig({ ...config, cors: { ...config.cors, enabled: !config.cors.enabled }})}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${config.cors.enabled ? 'bg-primary' : 'bg-muted'}`}
             >
               <span 
                 className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.cors.enabled ? 'translate-x-6' : 'translate-x-1'}`} 
               />
             </button>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Allowed Origins</h3>
                <button 
                  onClick={() => addListItem('origins')}
                  className="text-primary hover:bg-primary/10 p-1.5 rounded-lg transition-colors"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {config.cors.origins.map((origin: string, i: number) => (
                    <div key={i} className="flex items-center justify-between bg-muted/50 px-4 py-2 rounded-xl border border-border">
                        <code className="text-sm truncate">{origin}</code>
                        <button onClick={() => removeListItem('origins', i)} className="text-destructive hover:bg-destructive/10 p-1 rounded-md shrink-0">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
          </div>
        </div>
      </section>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-border">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-primary text-primary-foreground flex items-center gap-2 px-8 py-3 rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:scale-100"
        >
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {isSaving ? 'Saving Changes...' : 'Save Security Policies'}
        </button>
      </div>
    </div>
  )
}
