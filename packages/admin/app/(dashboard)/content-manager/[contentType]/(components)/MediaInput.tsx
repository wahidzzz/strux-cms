import React, { useState, useRef } from 'react'
import { Upload, ImageIcon, Trash2, Loader2 } from 'lucide-react'

export function MediaInput({ value, onChange, fieldName }: { value: any, onChange: (val: string) => void, fieldName: string }) {
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    await uploadFile(files[0])
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const files = e.dataTransfer.files
    if (!files || files.length === 0) return
    await uploadFile(files[0])
  }

  const uploadFile = async (file: File) => {
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('files', file)

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      
      if (!res.ok) throw new Error(data.error?.message || 'Upload failed')
      
      // Assume returning single uploaded file details
      const uploadedFile = Array.isArray(data.data) ? data.data[0] : data.data
      onChange(uploadedFile.url) // Set the value to the file's remote URL
      
    } catch (err: any) {
      console.error("Upload error:", err.message)
      alert("Failed to upload media: " + err.message)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

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
            src={`/api${value}`} // Proxying through the /api/uploads/ route
            alt="Preview"
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            onError={(e) => {
                // If the preview errors out (e.g. not an image), fallback to the value as a link
                (e.target as HTMLElement).style.display = 'none'
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
             <div className="bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded text-xs font-mono border border-border shadow-sm truncate max-w-[80%] opacity-0 group-hover:opacity-100 transition-opacity">
               {value.split('/').pop()}
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
                 <span className="uppercase text-[10px] font-semibold tracking-wider">OR PASTE URL</span>
                 <div className="h-px w-8 bg-border"></div>
              </div>
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
           placeholder="https://example.com/image.jpg"
           onClick={(e) => e.stopPropagation()} // Prevent triggering the file browser on click
         />
      )}
    </div>
  )
}
