'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface FilterDef {
  name: string
  label: string
  options: { value: string; label: string }[]
}

const selectCls = 'h-10 w-full rounded-md bg-background px-3 text-sm shadow-sm ring-1 ring-input focus:outline-none focus:ring-2 focus:ring-ring'

/** Filtros genéricos sincronizados com a query string. */
export function QueryFilters({ filters }: { filters: FilterDef[] }) {
  const router = useRouter()
  const pathname = usePathname() ?? '/'
  const sp = useSearchParams()
  const active = (filters ?? []).some((f: FilterDef) => !!sp?.get(f.name))

  const set = (name: string, value: string) => {
    const next = new URLSearchParams(sp?.toString() ?? '')
    if (value) next.set(name, value)
    else next.delete(name)
    next.delete('page')
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <div className="rounded-lg bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Filter className="h-4 w-4 text-primary" /> Filtros</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(filters ?? []).map((f: FilterDef) => (
          <select key={f.name} aria-label={f.label} className={selectCls} value={sp?.get(f.name) ?? ''} onChange={(e) => set(f.name, e.target.value)}>
            <option value="">{f.label}: todos</option>
            {(f.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ))}
        <Button variant="outline" onClick={() => router.push(pathname)} disabled={!active}>
          <X className="mr-1 h-4 w-4" /> Limpar
        </Button>
      </div>
    </div>
  )
}
