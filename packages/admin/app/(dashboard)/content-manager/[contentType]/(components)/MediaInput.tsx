import React, { useState, useRef } from 'react'
import { Upload, ImageIcon, Trash2, Loader2 } from 'lucide-react'

export function MediaInput({ value, onChange, fieldName }: { value: any, onChange: (val: string) => void, fieldName: string }) {
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false)
  const [mediaList, setMediaList] = useState<any[]>([])

  const fetchMedia = async () => {
    try {
      const res = await fetch('/api/upload')
      const json = await res.json()
      if (json.data) setMediaList(json.data)
    } catch (err) {
      console.error('Failed to fetch media:', err)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    // Pass the File object directly so the parent can upload it
    onChange(files[0] as any)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const files = e.dataTransfer.files
    if (!files || files.length === 0) return
    // Pass the File object directly so the parent can upload it
    onChange(files[0] as any)
  }

  const handleOpenLibrary = () => {
    fetchMedia()
    setMediaLibraryOpen(true)
  }

  const handleSelectExisting = (mediaUrl: string) => {
    onChange(mediaUrl)
    setMediaLibraryOpen(false)
  }

  const previewUrl = value instanceof File ? URL.createObjectURL(value) : (value ? `/api${value}` : null)
  const isFileObject = value instanceof File

  return (
    <div className="space-y-3 font-outfit mt-2">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileSelect} 
        className="hidden" 
        accept="image/*,video/*,audio/*,application/pdf"
      />
      
      {value ? (
        <div className="relative aspect-video w-full max-w-sm rounded-lg overflow-hidden border border-border bg-muted/20 flex items-center justify-center group shadow-sm transition-all hover:shadow-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl!} 
            alt="Preview"
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            onError={(e) => {
                // If the preview errors out (e.g. not an image), fallback to the value as a link
                (e.target as HTMLElement).style.display = 'none'
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
             <div className="bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded text-xs font-mono border border-border shadow-sm truncate max-w-[80%] opacity-0 group-hover:opacity-100 transition-opacity">
              {isFileObject ? value.name : value.split('/').pop()}
             </div>
          </div>
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
            <button 
              type="button" 
              onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onChange('')
              }} 
              className="p-2 bg-destructive text-destructive-foreground rounded-full shadow-lg hover:scale-110 transition-transform pointer-events-auto"
              title="Remove media"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div 
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center bg-muted/5 text-muted-foreground transition-colors hover:bg-muted/20 hover:border-primary/50 cursor-pointer ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
        >
          {isUploading ? (
            <>
               <Loader2 className="w-8 h-8 mb-2 animate-spin text-primary" />
               <p className="text-xs font-medium">Uploading...</p>
            </>
          ) : (
            <>
              <Upload className="w-8 h-8 mb-3 opacity-50" />
              <p className="text-sm font-medium mb-1">Click to browse or drag a file here</p>
              <p className="text-xs opacity-70 mb-4">Supports images, videos, audio, PDF</p>
              
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                 <div className="h-px w-8 bg-border"></div>
                    <span className="uppercase text-[10px] font-semibold tracking-wider">OR</span>
                 <div className="h-px w-8 bg-border"></div>
              </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleOpenLibrary(); }}
                    className="mt-4 px-4 py-2 border border-border rounded-md hover:bg-muted text-sm font-medium transition-colors"
                  >
                    Select from Library
                  </button>
            </>
          )}
        </div>
      )}
      
      {!isUploading && !value && (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
          placeholder="Or paste an external media URL..."
          onClick={(e) => e.stopPropagation()} // Prevent triggering the file browser on click
        />
      )}

      {mediaLibraryOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-xl border border-border shadow-2xl flex flex-col">
            <div className="p-4 border-b border-border flex justify-between items-center">
              <h3 className="text-lg font-bold">Media Library</h3>
              <button type="button" onClick={() => setMediaLibraryOpen(false)} className="p-2 hover:bg-muted rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-wrap gap-4">
              {mediaList.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center text-sm">
                  <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
                  <p>No media found.</p>
                </div>
              ) : (
                mediaList.map((media) => (
                  <div key={media.id} className="relative group w-40 h-40 border border-border rounded-xl overflow-hidden cursor-pointer hover:ring-2 ring-primary transition-all" onClick={() => handleSelectExisting(media.url)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api${media.formats?.small?.url || media.url}`} alt={media.name} className="object-cover w-full h-full" />
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] p-2 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                      {media.name}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
