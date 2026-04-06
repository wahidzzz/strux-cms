'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { StruxLogoMark, StruxLogo } from '@/components/strux-logo'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showSetupLink, setShowSetupLink] = useState(false)
  
  const router = useRouter()
  const setAuth = useAuthStore((state) => state.setAuth)

  // Check setup status to conditionally show the "Setup Admin" link
  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/auth/setup-status')
        const data = await res.json()
        setShowSetupLink(!data.isSetupComplete)
      } catch {
        setShowSetupLink(false)
      }
    }
    check()
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/auth/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error?.message || data.message || 'Login failed')
      }

      setAuth(data.jwt, data.user)
      router.push('/content-manager')
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background px-4">
      <div className="max-w-md w-full bg-card rounded-2xl border border-border shadow-lg overflow-hidden">
        {/* Branded header */}
        <div className="relative bg-primary/[0.04] border-b border-border px-8 pt-10 pb-8">
          {/* Decorative grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='28' height='28' viewBox='0 0 28 28' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='2' y='2' width='10' height='10' rx='2' fill='currentColor'/%3E%3Crect x='16' y='2' width='10' height='10' rx='2' fill='currentColor'/%3E%3Crect x='2' y='16' width='10' height='10' rx='2' fill='currentColor'/%3E%3Crect x='16' y='16' width='10' height='10' rx='2' fill='currentColor'/%3E%3C/svg%3E")`,
            backgroundSize: '56px 56px'
          }} />
          <div className="relative text-center space-y-4">
            <div className="flex justify-center">
              <div className="bg-card p-3 rounded-2xl shadow-sm border border-border">
                <StruxLogoMark size={44} />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Sign in to <span className="text-primary">Strux</span> <span className="font-normal text-muted-foreground">CMS</span>
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Enter your credentials to access the admin dashboard
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="p-8 space-y-6">
          <form className="space-y-5" onSubmit={handleLogin}>
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-4 rounded-xl border border-destructive/20 flex items-start gap-2">
                <svg className="h-4 w-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold" htmlFor="login-email">
                  Email / Username
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="text"
                  required
                  className="w-full px-4 py-2.5 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all placeholder:text-muted-foreground/50"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold" htmlFor="login-password">
                  Password
                </label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  required
                  className="w-full px-4 py-2.5 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all placeholder:text-muted-foreground/50"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-primary text-primary-foreground font-bold rounded-xl shadow-md hover:bg-primary/90 hover:shadow-lg focus:ring-2 focus:ring-primary/50 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </>
              ) : 'Sign in'}
            </button>
          </form>

          {showSetupLink && (
            <div className="text-center pt-2 border-t border-border">
              <p className="text-sm text-muted-foreground pt-4">
                First time?{' '}
                <button
                  onClick={() => router.push('/register')}
                  className="text-primary hover:underline font-semibold"
                >
                  Setup Admin Account
                </button>
              </p>
            </div>
          )}

          <p className="text-center text-[11px] text-muted-foreground/60 font-mono">
            Strux CMS v0.1.0 — Git-native headless CMS
          </p>
        </div>
      </div>
    </div>
  )
}
