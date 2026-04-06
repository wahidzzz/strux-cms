'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { StruxLogoMark } from '@/components/strux-logo'

const AUTH_ROUTES = ['/login', '/register']

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [setupChecked, setSetupChecked] = useState(false)
  const [isSetupComplete, setIsSetupComplete] = useState(true) // assume complete until checked

  useEffect(() => {
    setMounted(true)
  }, [])

  // Check setup status on mount and when token changes
  // (token changes after registration, so we need to re-check)
  useEffect(() => {
    if (!mounted) return

    // If we have a token, setup is definitely complete — skip the API call
    if (token) {
      setIsSetupComplete(true)
      setSetupChecked(true)
      return
    }

    let cancelled = false

    async function checkSetup() {
      try {
        const res = await fetch('/api/auth/setup-status')
        const data = await res.json()
        if (!cancelled) {
          setIsSetupComplete(data.isSetupComplete)
          setSetupChecked(true)
        }
      } catch {
        // If the check fails, assume setup is complete (show login)
        if (!cancelled) {
          setIsSetupComplete(true)
          setSetupChecked(true)
        }
      }
    }

    checkSetup()

    return () => { cancelled = true }
  }, [mounted, token])

  // Route protection logic
  useEffect(() => {
    if (!mounted || !setupChecked) return

    const isAuthRoute = AUTH_ROUTES.includes(pathname)

    if (!isSetupComplete) {
      // Fresh install — force to register page
      if (pathname !== '/register') {
        router.push('/register')
      }
    } else if (!token && !isAuthRoute) {
      // Setup done, no token, not on auth route → login
      router.push('/login')
    } else if (token && isAuthRoute) {
      // Authenticated and on login/register → dashboard
      router.push('/content-manager')
    }
  }, [token, pathname, router, mounted, setupChecked, isSetupComplete])

  // Show loading state while checking setup status
  if (!mounted || !setupChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background flex flex-col items-center justify-center gap-4">
        <StruxLogoMark size={48} className="animate-pulse" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading Strux CMS...</p>
      </div>
    )
  }

  // If on a protected route without a token, show loading while redirect fires
  if (!token && !AUTH_ROUTES.includes(pathname)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background flex flex-col items-center justify-center gap-3">
        <StruxLogoMark size={36} className="animate-pulse" />
        <p className="text-sm text-muted-foreground animate-pulse">Redirecting...</p>
      </div>
    )
  }

  return <>{children}</>
}
