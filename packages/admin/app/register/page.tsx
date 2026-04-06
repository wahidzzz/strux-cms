'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { StruxLogoMark, StruxLogo } from '@/components/strux-logo'
import { UserPlus, Shield, CheckCircle, ArrowRight, Sparkles, Lock, GitBranch, FileJson, Key } from 'lucide-react'

export default function RegisterPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<'welcome' | 'form' | 'success'>('welcome')
  const [isSetupComplete, setIsSetupComplete] = useState<boolean | null>(null)

  const router = useRouter()
  const setAuth = useAuthStore((state) => state.setAuth)

  // Check setup status — block access if already set up
  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/auth/setup-status')
        const data = await res.json()
        if (data.isSetupComplete) {
          setIsSetupComplete(true)
          setTimeout(() => router.push('/login'), 1500)
        } else {
          setIsSetupComplete(false)
        }
      } catch {
        setIsSetupComplete(false)
      }
    }
    check()
  }, [router])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setIsLoading(true)

    try {
      const registerRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          email,
          password,
          role: 'admin'
        }),
      })

      const registerData = await registerRes.json()

      if (!registerRes.ok) {
        throw new Error(registerData.message || registerData.error?.message || 'Registration failed')
      }

      const loginRes = await fetch('/api/auth/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: email,
          password,
        }),
      })

      const loginData = await loginRes.json()

      if (!loginRes.ok) {
        setStep('success')
        setTimeout(() => router.push('/login'), 2000)
        return
      }

      setAuth(loginData.jwt, loginData.user)
      setStep('success')

      setTimeout(() => {
        router.push('/content-manager')
        router.refresh()
      }, 2000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // Loading state
  if (isSetupComplete === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background">
        <div className="flex flex-col items-center gap-4">
          <StruxLogoMark size={48} className="animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">Checking setup status...</p>
        </div>
      </div>
    )
  }

  // Already set up — redirect
  if (isSetupComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background px-4">
        <div className="max-w-md w-full space-y-6 bg-card p-8 rounded-2xl border border-border shadow-lg text-center">
          <StruxLogo size={36} textSize="text-xl" className="justify-center" />
          <div className="pt-2">
            <div className="flex justify-center">
              <div className="p-3 bg-primary/10 rounded-full">
                <Lock className="h-8 w-8 text-primary" />
              </div>
            </div>
            <h2 className="mt-4 text-2xl font-bold">Setup Already Complete</h2>
            <p className="mt-2 text-muted-foreground">
              An administrator account already exists. Redirecting to login...
            </p>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full animate-[progress_1.5s_ease-in-out]" style={{ width: '100%' }} />
          </div>
        </div>
      </div>
    )
  }

  // Success state
  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background px-4">
        <div className="max-w-md w-full space-y-6 bg-card p-8 rounded-2xl border border-border shadow-lg text-center">
          <div className="flex justify-center">
            <div className="relative">
              <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-full">
                <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
              </div>
              <Sparkles className="h-5 w-5 text-yellow-500 absolute -top-1 -right-1 animate-bounce" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">You&apos;re all set!</h2>
            <p className="text-muted-foreground">
              Welcome, <strong>{username}</strong>. Your admin account has been created.
            </p>
          </div>
          <div className="pt-2 flex flex-col items-center gap-3">
            <StruxLogoMark size={28} className="animate-pulse" />
            <p className="text-sm text-muted-foreground animate-pulse">
              Launching dashboard...
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Welcome step
  if (step === 'welcome') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background px-4 py-12">
        <div className="max-w-lg w-full bg-card rounded-2xl border border-border shadow-lg overflow-hidden">
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
                  <StruxLogoMark size={48} />
                </div>
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Welcome to <span className="text-primary">Strux</span>
                </h1>
                <p className="mt-2 text-muted-foreground text-base max-w-sm mx-auto">
                  Your Git-native JSON CMS is ready. Let&apos;s create your first administrator account.
                </p>
              </div>
            </div>
          </div>

          {/* Feature cards */}
          <div className="p-8 space-y-8">
            <div className="grid gap-3">
              <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-muted/40 border border-border/50 hover:border-border transition-colors">
                <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                  <Key className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Secure by default</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Passwords hashed with bcrypt. Sessions secured with JWT tokens.</p>
                </div>
              </div>
              <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-muted/40 border border-border/50 hover:border-border transition-colors">
                <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                  <FileJson className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">No database required</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Content stored as JSON files, fully portable and human-readable.</p>
                </div>
              </div>
              <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-muted/40 border border-border/50 hover:border-border transition-colors">
                <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                  <GitBranch className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Git-versioned content</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Every change tracked automatically. Branch, diff, and rollback at will.</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep('form')}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 bg-primary text-primary-foreground font-bold rounded-xl shadow-md hover:bg-primary/90 hover:shadow-lg focus:ring-2 focus:ring-primary/50 transition-all active:scale-[0.98]"
            >
              Create Admin Account
              <ArrowRight className="h-4 w-4" />
            </button>

            <p className="text-center text-[11px] text-muted-foreground/60 font-mono">
              Strux CMS v0.1.0 — Git-native headless CMS
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Registration form step
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background px-4 py-12">
      <div className="max-w-md w-full bg-card rounded-2xl border border-border shadow-lg overflow-hidden">
        {/* Branded header bar */}
        <div className="bg-primary/[0.04] border-b border-border px-6 py-4 flex items-center justify-between">
          <StruxLogo size={28} textSize="text-base" />
          {/* Step indicator */}
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-6 rounded-full bg-primary" />
            <div className="h-1.5 w-6 rounded-full bg-primary" />
            <div className="h-1.5 w-6 rounded-full bg-muted" />
          </div>
        </div>

        <div className="p-8 space-y-6">
          <div className="text-center">
            <div className="flex justify-center">
              <div className="p-3 bg-primary/10 rounded-xl">
                <UserPlus className="h-7 w-7 text-primary" />
              </div>
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-tight">
              Create Admin Account
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              This account will have <span className="font-medium text-foreground">Super Admin</span> privileges with full system access.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleRegister}>
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

            <div className="grid gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold" htmlFor="setup-username">
                  Username
                </label>
                <input
                  id="setup-username"
                  name="username"
                  type="text"
                  required
                  className="w-full px-4 py-2.5 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all placeholder:text-muted-foreground/50"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold" htmlFor="setup-email">
                  Email Address
                </label>
                <input
                  id="setup-email"
                  name="email"
                  type="email"
                  required
                  className="w-full px-4 py-2.5 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all placeholder:text-muted-foreground/50"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold" htmlFor="setup-password">
                    Password
                  </label>
                  <input
                    id="setup-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    className="w-full px-4 py-2.5 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all placeholder:text-muted-foreground/50"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold" htmlFor="setup-confirm">
                    Confirm
                  </label>
                  <input
                    id="setup-confirm"
                    name="confirm"
                    type="password"
                    required
                    minLength={8}
                    className="w-full px-4 py-2.5 bg-background border border-input rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all placeholder:text-muted-foreground/50"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setStep('welcome')}
                className="px-5 py-3 border border-input rounded-xl text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-primary text-primary-foreground font-bold rounded-xl shadow-md hover:bg-primary/90 hover:shadow-lg focus:ring-2 focus:ring-primary/50 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Setting up...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4" /> Complete Setup
                  </>
                )}
              </button>
            </div>
          </form>

          <p className="text-center text-[11px] text-muted-foreground/60 font-mono border-t border-border pt-4">
            Strux CMS v0.1.0
          </p>
        </div>
      </div>
    </div>
  )
}
