'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ListChecks, CalendarClock, AlertTriangle, Camera } from 'lucide-react'
import { cn } from '@/lib/utils'

const LEFT = [
  { href: '/dashboard', label: 'Painel', icon: LayoutDashboard },
  { href: '/secoes', label: 'Seções', icon: ListChecks },
]
const RIGHT = [
  { href: '/eventos', label: 'Eventos', icon: CalendarClock },
  { href: '/incidentes', label: 'Incidentes', icon: AlertTriangle },
]

export function MobileTabBar() {
  const pathname = usePathname() ?? '/'
  const active = (href: string) => pathname.startsWith(href)

  const Item = ({ href, label, icon: Icon }: (typeof LEFT)[number]) => (
    <Link
      href={href}
      aria-current={active(href) ? 'page' : undefined}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition-colors active:scale-95',
        active(href) ? 'text-primary' : 'text-muted-foreground'
      )}
    >
      <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', active(href) && 'bg-primary/10')}>
        <Icon className="h-5 w-5" strokeWidth={active(href) ? 2.4 : 2} />
      </span>
      {label}
    </Link>
  )

  return (
    <nav
      aria-label="Navegação inferior"
      className="fixed inset-x-0 bottom-0 z-[1000] bg-background/95 backdrop-blur-md md:hidden"
      style={{ boxShadow: '0 -1px 0 hsl(var(--border)), 0 -4px 16px rgba(15, 23, 42, 0.06)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex h-16 max-w-md items-stretch px-1">
        {LEFT.map((i) => <Item key={i.href} {...i} />)}
        <div className="flex flex-1 items-start justify-center">
          <Link
            href="/coletar"
            aria-label="Coletar evidência"
            aria-current={active('/coletar') ? 'page' : undefined}
            className="-mt-5 flex flex-col items-center gap-0.5 text-[11px] font-semibold text-primary active:scale-95"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-background" style={{ boxShadow: '0 6px 16px rgba(30, 58, 95, 0.35)' }}>
              <Camera className="h-6 w-6" />
            </span>
            Coletar
          </Link>
        </div>
        {RIGHT.map((i) => <Item key={i.href} {...i} />)}
      </div>
    </nav>
  )
}
