'use client'

import React, { useState, useEffect } from 'react'
import { Save, Loader2, Check } from 'lucide-react'
import { useSettings, CMSSettings } from '@/components/settings-provider'

export default function GeneralSettings() {
  const { settings, isLoading, refreshSettings } = useSettings()
  const [formData, setFormData] = useState<Partial<CMSSettings>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (settings) {
      setFormData(settings)
    }
  }, [settings])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.message || 'Failed to save settings')
      }

      setSuccess('Settings saved successfully!')
      await refreshSettings()
      
      setTimeout(() => {
        setSuccess('')
      }, 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">General Settings</h1>
        <p className="text-muted-foreground mt-1">
          Customize Strux CMS branding and configuration.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-md text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-500/10 text-green-600 border border-green-500/20 rounded-md text-sm flex items-center gap-2">
          <Check className="h-4 w-4" />
          {success}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-card border border-border rounded-xl shadow-sm p-6 space-y-6">
          <h2 className="text-lg font-semibold border-b border-border pb-2">Branding (Whitelabel)</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="brandName" className="text-sm font-medium">Brand Name</label>
              <input
                id="brandName"
                type="text"
                value={formData.brandName || ''}
                onChange={(e) => setFormData({ ...formData, brandName: e.target.value })}
                className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="e.g., Acme Corp CMS"
              />
              <p className="text-xs text-muted-foreground">This will replace &quot;Strux CMS&quot; in the sidebar and titles.</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="logoUrl" className="text-sm font-medium">Logo URL</label>
              <input
                id="logoUrl"
                type="text"
                value={formData.logoUrl || ''}
                onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="e.g., https://example.com/logo.png"
              />
              <p className="text-xs text-muted-foreground">A square logo works best (absolute URL).</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 px-4 rounded-md font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Settings
          </button>
        </div>
      </form>
    </div>
  )
}
