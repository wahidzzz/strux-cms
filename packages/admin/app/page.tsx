'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { StruxLogoMark } from '@/components/strux-logo'

/**
 * Root page — checks setup status via API and redirects accordingly.
 */
export default function Home() {
  const router = useRouter()

  useEffect(() => {
    async function checkAndRedirect() {
      try {
        const res = await fetch('/api/auth/setup-status')
        const data = await res.json()

        if (!data.isSetupComplete) {
          router.replace('/register')
        } else {
          router.replace('/content-manager')
        }
      } catch {
        router.replace('/content-manager')
      }
    }

    checkAndRedirect()
  }, [router])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background flex flex-col items-center justify-center gap-4">
      <StruxLogoMark size={48} className="animate-pulse" />
      <p className="text-sm text-muted-foreground animate-pulse">Loading Strux CMS...</p>
    </div>
  )
}
