'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { LayoutDashboard, ListChecks, CalendarClock, AlertTriangle, Camera, LogIn, Menu, X, User, ShieldCheck, LogOut } from 'lucide-react'
import { Logo } from './logo'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/secoes', label: 'Seções', icon: ListChecks },
  { href: '/eventos', label: 'Eventos', icon: CalendarClock },
  { href: '/incidentes', label: 'Incidentes', icon: AlertTriangle },
]

export function SiteHeader() {
  const pathname = usePathname() ?? '/'
  const { data: session, status } = useSession() ?? {}
  const [open, setOpen] = useState(false)
  const logged = status === 'authenticated'
  const isAdmin = ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(session?.user?.role ?? '')

  const linkCls = (href: string) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
      pathname.startsWith(href) ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
    )

  return (
    <header className="sticky top-0 z-[1000] w-full bg-background/85 backdrop-blur-md" style={{ boxShadow: 'var(--shadow-sm)', paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mx-auto flex h-14 md:h-16 max-w-[1200px] items-center justify-between gap-4 px-4">
        <Link href="/" aria-label="VotoAudit — início">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={linkCls(n.href)}>
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {logged ? (
            <>
              {isAdmin && (
                <Link href="/admin" className={linkCls('/admin')}>
                  <ShieldCheck className="h-4 w-4" /> Admin
                </Link>
              )}
              <Link href="/meu-perfil" className={linkCls('/meu-perfil')}>
                <User className="h-4 w-4" /> Perfil
              </Link>
              <Button asChild size="sm">
                <Link href="/coletar">
                  <Camera className="h-4 w-4" /> Coletar
                </Link>
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Sair" onClick={() => signOut({ redirectTo: '/' })}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/login">
                <LogIn className="h-4 w-4" /> Entrar
              </Link>
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1 md:hidden">
          {!logged && (
            <Button asChild size="sm">
              <Link href="/login">
                <LogIn className="h-4 w-4" /> Entrar
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label={open ? 'Fechar menu' : 'Abrir menu'} onClick={() => setOpen((v) => !v)}>
            {open ? <X className="h-5 w-5" /> : logged ? <User className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      {open && (
        <nav className="border-t bg-background px-4 pb-4 pt-2 md:hidden" aria-label="Menu móvel">
          <div className="flex flex-col gap-1">
            {logged ? (
              <>
                <Link href="/meu-perfil" className={linkCls('/meu-perfil')} onClick={() => setOpen(false)}>
                  <User className="h-4 w-4" /> Meu perfil
                </Link>
                {isAdmin && (
                  <Link href="/admin" className={linkCls('/admin')} onClick={() => setOpen(false)}>
                    <ShieldCheck className="h-4 w-4" /> Admin
                  </Link>
                )}
                <Button variant="outline" className="mt-2" onClick={() => signOut({ redirectTo: '/' })}>
                  <LogOut className="h-4 w-4" /> Sair
                </Button>
              </>
            ) : (
              <>
                <Link href="/" className={linkCls('/__inicio')} onClick={() => setOpen(false)}>
                  <ShieldCheck className="h-4 w-4" /> Sobre o VotoAudit
                </Link>
                <Link href="/signup" className={linkCls('/signup')} onClick={() => setOpen(false)}>
                  <User className="h-4 w-4" /> Criar conta de coletor
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  )
}
