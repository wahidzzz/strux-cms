'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    const isAuthRoute = pathname === '/login'

    if (!token && !isAuthRoute) {
      router.push('/login')
    } else if (token && isAuthRoute) {
      router.push('/content-manager')
    }
  }, [token, pathname, router, mounted])

  // Prevent hydration mismatch by returning null until mounted on client
  if (!mounted) {
    return null
  }

  // If we're on a protected route and don't have a token, don't render children
  // (the useEffect above will redirect)
  if (!token && pathname !== '/login') {
    return <div className="min-h-screen bg-background flex items-center justify-center">Loading...</div>
  }

  return <>{children}</>
}
