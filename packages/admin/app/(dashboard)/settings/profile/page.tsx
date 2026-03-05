'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/lib/auth-store'
import { User, Mail, Shield, Save, Key, AlertCircle, CheckCircle } from 'lucide-react'

export default function ProfilePage() {
  const { user, token, setAuth } = useAuthStore()
  const [username, setUsername] = useState(user?.username || '')
  const [email, setEmail] = useState(user?.email || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    if (user) {
      setUsername(user.username)
      setEmail(user.email)
    }
  }, [user])

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setMessage(null)

    try {
      // In a real app, we'd have a PATCH /api/users/:id endpoint
      // For this simplified CMS, we'll use a placeholder or implement specific logic
      const res = await fetch(`/api/auth/me`, {
        method: 'PUT', // We need to implement this handler
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username, email }),
      })

      if (!res.ok) throw new Error('Failed to update profile')
      
      const data = await res.json()
      setAuth(token!, data.user)
      setMessage({ type: 'success', text: 'Profile updated successfully' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setIsLoading(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' })
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch(`/api/auth/me`, {
        method: 'PATCH', // We need to implement this handler
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Failed to change password')
      }
      
      setMessage({ type: 'success', text: 'Password changed successfully' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Profile Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account information and security</p>
      </div>

      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          message.type === 'success' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-destructive/10 text-destructive border border-destructive/20'
        }`}>
          {message.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          <p className="font-medium">{message.text}</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        {/* Account Information */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-border bg-muted/30">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <User className="h-5 w-5 text-primary" /> Account Details
            </h2>
          </div>
          <form onSubmit={handleUpdateProfile} className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-lg focus:ring-2 focus:ring-primary/40 outline-none"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-lg focus:ring-2 focus:ring-primary/40 outline-none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Role</label>
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg text-sm">
                <Shield className="h-4 w-4" />
                <span className="capitalize">{user?.role}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> Save Changes
            </button>
          </form>
        </div>

        {/* Security / Password */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-border bg-muted/30">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" /> Change Password
            </h2>
          </div>
          <form onSubmit={handleChangePassword} className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Current Password</label>
              <input
                type="password"
                className="w-full px-4 py-2 bg-background border border-input rounded-lg focus:ring-2 focus:ring-primary/40 outline-none"
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>

            <hr className="my-2 border-border" />

            <div className="space-y-1.5">
              <label className="text-sm font-medium">New Password</label>
              <input
                type="password"
                className="w-full px-4 py-2 bg-background border border-input rounded-lg focus:ring-2 focus:ring-primary/40 outline-none"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Confirm New Password</label>
              <input
                type="password"
                className="w-full px-4 py-2 bg-background border border-input rounded-lg focus:ring-2 focus:ring-primary/40 outline-none"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-secondary text-secondary-foreground font-bold rounded-lg hover:bg-secondary/80 transition-all disabled:opacity-50"
            >
              Update Password
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
