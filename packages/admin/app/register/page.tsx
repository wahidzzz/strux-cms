'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Database, UserPlus, Shield, CheckCircle } from 'lucide-react'

export default function RegisterPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  
  const router = useRouter()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setIsLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username, 
          email, 
          password,
          role: 'admin' // Force initial user to be admin
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error?.message || 'Registration failed')
      }

      setIsSuccess(true)
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <div className="max-w-md w-full space-y-8 bg-card p-8 rounded-xl border border-border shadow-md text-center">
          <div className="flex justify-center">
            <CheckCircle className="h-16 w-16 text-primary animate-bounce" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight">Admin Created!</h2>
          <p className="text-muted-foreground">
            Username <strong>{username}</strong> has been registered. Redirecting to login...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <div className="max-w-md w-full space-y-8 bg-card p-8 rounded-xl border border-border shadow-lg">
        <div className="text-center">
          <div className="flex justify-center">
            <div className="p-3 bg-primary/10 rounded-full">
              <Database className="h-10 w-10 text-primary" />
            </div>
          </div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight">
            Initial Setup
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create the first administrator account to get started
          </p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleRegister}>
          {error && (
            <div className="bg-destructive/15 text-destructive text-sm p-4 rounded-lg border border-destructive/20">
              {error}
            </div>
          )}

          <div className="grid gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold flex items-center gap-2" htmlFor="username">
                <UserPlus className="h-4 w-4" /> Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className="w-full px-4 py-2 bg-muted/20 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold flex items-center gap-2" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full px-4 py-2 bg-muted/20 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="w-full px-4 py-2 bg-muted/20 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold" htmlFor="confirm">
                  Confirm
                </label>
                <input
                  id="confirm"
                  name="confirm"
                  type="password"
                  required
                  className="w-full px-4 py-2 bg-muted/20 border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-primary text-primary-foreground font-bold rounded-lg shadow-md hover:bg-primary/90 hover:shadow-lg focus:ring-2 focus:ring-primary/50 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? (
                'Initializing System...'
              ) : (
                <>
                  <Shield className="h-4 w-4" /> Configure Admin
                </>
              )}
            </button>
          </div>
        </form>

        <div className="text-center text-xs text-muted-foreground border-t border-border pt-4">
          Git-Native JSON CMS — v0.1.0
        </div>
      </div>
    </div>
  )
}
