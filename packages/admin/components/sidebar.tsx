'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { 
  FileText, 
  Database, 
  Image, 
  Settings,
  Menu,
  X,
  Layers,
  ChevronRight,
  LogOut
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/auth-store'

const mainNavigation = [
  { name: 'Content-Type Builder', href: '/content-type-builder', icon: Database },
  { name: 'Media Library', href: '/media-library', icon: Image },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const logout = useAuthStore((state) => state.logout)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [schemas, setSchemas] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchSchemas() {
      try {
        const res = await fetch('/api/content-type-builder/content-types')
        const data = await res.json()
        if (data.data) {
          setSchemas(data.data)
        }
      } catch (error) {
        console.error('Failed to fetch schemas for sidebar:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchSchemas()
  }, [])

  const collectionTypes = schemas.filter(s => s.kind === 'collectionType' || !s.kind)
  const singleTypes = schemas.filter(s => s.kind === 'singleType')
  const componentTypes = schemas.filter(s => s.kind === 'component')

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const NavItem = ({ item, indent = false }: { item: any, indent?: boolean }) => {
    const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href))
    return (
      <Link
        href={item.href}
        className={cn(
          'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
          indent && 'ml-4 py-1.5 text-xs',
          isActive
            ? 'bg-primary text-primary-foreground font-semibold'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        )}
        onClick={() => setIsMobileMenuOpen(false)}
      >
        {item.icon && <item.icon className={cn('mr-3 h-4 w-4', indent && 'mr-2 h-3.5 w-3.5')} />}
        <span className="truncate">{item.name}</span>
        {isActive && !indent && <ChevronRight className="ml-auto h-4 w-4" />}
      </Link>
    )
  }

  return (
    <>
      {/* Mobile menu button */}
      <button
        type="button"
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-primary text-primary-foreground"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        {isMobileMenuOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <Menu className="h-6 w-6" />
        )}
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 bg-card border-r border-border transition-transform duration-300 ease-in-out lg:translate-x-0',
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center h-16 px-6 border-b border-border bg-muted/20">
            <Link href="/" className="flex items-center space-x-3">
              <div className="bg-primary rounded-lg p-1.5">
                <Layers className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold tracking-tight">Jayson CMS</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-8 overflow-y-auto scrollbar-hide">
            {/* Main Section */}
            <div className="space-y-1">
              {mainNavigation.map((item) => (
                <NavItem key={item.name} item={item} />
              ))}
            </div>

            {/* Collection Types */}
            {collectionTypes.length > 0 && (
              <div className="space-y-1">
                <h3 className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 border-b border-border/40 mb-1">
                  Collection Types
                </h3>
                <div className="space-y-0.5">
                  {collectionTypes.map((type) => (
                    <NavItem
                      key={type.apiId}
                      item={{
                        name: type.displayName,
                        href: `/content-manager/${type.apiId}`,
                        icon: FileText
                      }}
                      indent
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Single Types */}
            {singleTypes.length > 0 && (
              <div className="space-y-1">
                <h3 className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 border-b border-border/40 mb-1">
                  Single Types
                </h3>
                <div className="space-y-0.5">
                  {singleTypes.map((type) => (
                    <NavItem
                      key={type.apiId}
                      item={{
                        name: type.displayName,
                        href: `/content-manager/${type.apiId}`,
                        icon: Layers
                      }}
                      indent
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Components */}
            {componentTypes.length > 0 && (
              <div className="space-y-1">
                <h3 className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 border-b border-border/40 mb-1">
                  Components
                </h3>
                <div className="space-y-0.5">
                  {componentTypes.map((type) => (
                    <NavItem
                      key={type.apiId}
                      item={{
                        name: type.displayName,
                        href: `/content-type-builder/${type.apiId}`,
                        icon: Database
                      }}
                      indent
                    />
                  ))}
                </div>
              </div>
            )}
          </nav>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border bg-muted/10 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Connected
                </p>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">
                v0.1.0-alpha
              </p>
            </div>

            <button
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </>
  )
}
