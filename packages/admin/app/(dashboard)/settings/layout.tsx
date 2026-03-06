import Link from 'next/link'
import { Shield, Users, Sliders, Key } from 'lucide-react'

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage system configuration, roles, and users
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Settings Navigation */}
        <div className="w-full md:w-64 shrink-0 space-y-1">
          <Link 
            href="/settings/roles" 
            className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md text-foreground hover:bg-muted/50 transition-colors"
          >
            <Shield className="w-4 h-4 text-primary" />
            Roles & Permissions
          </Link>
          <Link 
            href="/settings/users" 
            className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md text-foreground hover:bg-muted/50 transition-colors"
          >
            <Users className="w-4 h-4 text-primary" />
            Users
          </Link>
          <Link 
            href="/settings/api-keys"
            className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md text-foreground hover:bg-muted/50 transition-colors"
          >
            <Key className="w-4 h-4 text-primary" />
            API Keys
          </Link>
          <Link
            href="/settings/security"
            className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md text-foreground hover:bg-muted/50 transition-colors"
          >
            <Shield className="w-4 h-4 text-primary" />
            Security
          </Link>
        </div>

        {/* Settings Content */}
        <div className="flex-1 bg-card border border-border rounded-xl p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  )
}
