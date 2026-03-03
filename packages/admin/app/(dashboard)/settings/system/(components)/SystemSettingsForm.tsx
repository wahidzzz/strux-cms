'use client'

import React, { useState } from 'react'
import { Save } from 'lucide-react'

export default function SystemSettingsForm({ initialConfig }: { initialConfig: any }) {
  const [config, setConfig] = useState(initialConfig)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null)

  const handleChange = (section: string, field: string, value: any) => {
    setConfig((prev: any) => ({
      ...prev,
      [section]: {
        ...(prev[section] || {}),
        [field]: value
      }
    }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    setMessage(null)
    
    try {
      const res = await fetch('/api/settings/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: config })
      })
      
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'Failed to save config')
      
      setMessage({ type: 'success', text: 'Configuration saved successfully. System restart might be needed for some changes to apply.' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-border">
        <div>
          <h2 className="text-xl font-semibold">System Settings</h2>
          <p className="text-sm text-muted-foreground">Manage core system configuration and limits</p>
        </div>
        <div className="flex items-center gap-4">
          {message && (
            <span className={`text-sm ${message.type === 'error' ? 'text-destructive' : 'text-green-500'}`}>
              {message.text}
            </span>
          )}
          <button 
             onClick={handleSave}
             disabled={isSaving}
             className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors font-medium text-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="space-y-8 max-w-2xl">
        {/* Security Settings */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Security</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">JWT Expiration</label>
              <input 
                type="text" 
                value={config.jwt?.expiresIn || ''}
                onChange={(e) => handleChange('jwt', 'expiresIn', e.target.value)}
                className="w-full sm:max-w-xs px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1.5">Format: 1d, 7d, 2h, etc.</p>
            </div>
          </div>
        </div>

        {/* Upload Limits */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Media Upload Limitations</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Max File Size (Bytes)</label>
              <input 
                type="number" 
                value={config.upload?.maxFileSize || ''}
                onChange={(e) => handleChange('upload', 'maxFileSize', parseInt(e.target.value))}
                className="w-full sm:max-w-xs px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1.5">Max size per file (Default: 10485760 bytes / 10mb)</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Max Files Per Request</label>
              <input 
                type="number" 
                value={config.upload?.maxFiles || ''}
                onChange={(e) => handleChange('upload', 'maxFiles', parseInt(e.target.value))}
                className="w-full sm:max-w-xs px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
