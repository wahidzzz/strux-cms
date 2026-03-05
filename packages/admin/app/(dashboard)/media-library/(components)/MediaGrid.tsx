'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Folder, Upload, Search, Image as ImageIcon, FileText, Video, Settings, Trash2 } from 'lucide-react'

export default function MediaGrid({ initialMediaFiles }: { initialMediaFiles: any[] }) {
  const router = useRouter()
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    
    await uploadFiles(Array.from(files))
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    
    const files = e.dataTransfer.files
    if (!files || files.length === 0) return
    
    await uploadFiles(Array.from(files))
  }

  const uploadFiles = async (files: File[]) => {
    setIsUploading(true)
    setError(null)
    
    try {
      const formData = new FormData()
      files.forEach(file => {
        formData.append('files', file)
      })

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'Upload failed')

      // Refresh to get new items from server
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this asset?')) return

    try {
      const res = await fetch(`/api/upload/files/${id}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error('Failed to delete')
      
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Media Library</h1>
          <p className="text-muted-foreground">
            Manage your images, videos, and documents
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
            className="hidden" 
            multiple 
          />
          <button className="flex items-center gap-2 border border-border px-4 py-2 rounded-md hover:bg-accent transition-colors font-medium text-sm">
            <Folder className="w-4 h-4" />
            New folder
          </button>
          <button 
             onClick={() => fileInputRef.current?.click()}
             disabled={isUploading}
             className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors font-medium text-sm disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {isUploading ? 'Uploading...' : 'Add new assets'}
          </button>
        </div>
      </div>
      
      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-md text-sm font-medium">
          {error}
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input 
            type="text"
            placeholder="Search assets..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="text-sm text-muted-foreground hidden sm:block">
          {initialMediaFiles.length} assets
        </div>
      </div>
      
      <div 
         onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
         onDrop={handleDrop}
         className={`relative min-h-[400px] ${initialMediaFiles.length === 0 ? 'flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-xl border-border bg-muted/20 pb-20 pt-20' : ''}`}
      >
        {initialMediaFiles.length === 0 ? (
          <>
            <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No assets yet</h3>
            <p className="text-muted-foreground mb-6 max-w-sm text-center">
              Drag and drop files here, or click to browse.
            </p>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-md hover:bg-primary/20 transition-colors font-medium text-sm"
            >
              <Upload className="w-4 h-4" />
              Click to browse files
            </button>
          </>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
             {/* Drop Zone overlay for grid mode */}
             {isUploading && (
                <div className="absolute inset-0 z-10 bg-background/50 backdrop-blur-sm rounded-xl flex items-center justify-center">
                   <div className="bg-card p-4 rounded-lg shadow-lg border border-border flex items-center gap-3">
                      <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
                      <span className="text-sm font-medium">Uploading...</span>
                   </div>
                </div>
             )}

            {/* Default mock folder */}
            <div className="group border border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors aspect-square text-center">
              <Folder className="w-10 h-10 text-muted-foreground group-hover:text-primary transition-colors" />
              <div>
                <p className="font-medium text-sm">Documents</p>
                <p className="text-xs text-muted-foreground">0 assets</p>
              </div>
            </div>
            
            {initialMediaFiles.map((file: any) => (
              <div key={file.id} className="group relative border border-border rounded-xl overflow-hidden bg-card hover:shadow-md transition-all cursor-pointer aspect-square flex flex-col">
                <div className="h-3/4 bg-muted/30 flex items-center justify-center p-4 relative">
                  {file.mime?.startsWith('image/') ? (
                     // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api${file.url}`} alt={file.name} className="w-full h-full object-contain" />
                  ) : file.mime?.startsWith('video/') ? (
                    <Video className="w-12 h-12 text-muted-foreground" />
                  ) : (
                    <FileText className="w-12 h-12 text-muted-foreground" />
                  )}
                  
                  {/* Overlay actions */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                    <button className="p-1.5 bg-background border border-border rounded shadow-sm text-foreground hover:bg-accent -translate-y-1 group-hover:translate-y-0 transition-all duration-200">
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                    <button 
                       onClick={(e) => handleDelete(file.id, e)}
                       className="p-1.5 bg-background border border-destructive/20 rounded shadow-sm text-destructive hover:bg-destructive/10 translate-y-1 group-hover:translate-y-0 transition-all duration-200 delay-75"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="h-1/4 p-2 border-t border-border flex flex-col justify-center">
                  <p className="font-medium text-xs truncate" title={file.name}>{file.name}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">{file.ext?.replace('.', '') || 'FILE'} • {(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
