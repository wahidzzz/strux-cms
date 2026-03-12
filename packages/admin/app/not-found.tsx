import Link from 'next/link'
import { FileX } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="border border-border rounded-xl bg-card shadow-sm flex flex-col items-center justify-center p-12 max-w-md w-full text-center">
        <div className="bg-muted/50 p-4 rounded-full mb-6">
          <FileX className="w-12 h-12 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight mb-2">Page Not Found</h2>
        <p className="text-muted-foreground mb-8">
          The page you are looking for doesn't exist or has been moved.
        </p>
        <Link 
          href="/"
          className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-md hover:bg-primary/90 transition-colors font-medium w-full"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  )
}
