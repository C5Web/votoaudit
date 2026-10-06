import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 44" className={cn('h-8 w-8', className)} aria-hidden="true">
      <path d="M20 1.5 37 7.5v13c0 10.6-7.1 18.6-17 22-9.9-3.4-17-11.4-17-22v-13L20 1.5Z" fill="#1e3a5f" />
      <rect x="10" y="17" width="20" height="14" rx="2" fill="#ffffff" />
      <rect x="15" y="14" width="10" height="3.2" rx="1" fill="#ffffff" />
      <rect x="16.5" y="19" width="7" height="1.6" rx=".8" fill="#1e3a5f" />
      <path d="m15.5 25.2 3 3 6-6" stroke="#22c55e" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className={cn('font-display text-lg font-bold tracking-tight', light ? 'text-white' : 'text-primary')}>
        Voto<span className="text-verified">Audit</span>
      </span>
    </span>
  )
}
