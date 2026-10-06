'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FilterOptions {
  ufs: string[]
  municipalities: string[]
  zones: string[]
}

const STATUS = [
  { v: 'VERIFIED', l: '✅ Verificado' },
  { v: 'DIVERGENCE', l: '⚠️ Divergência' },
  { v: 'PENDING', l: '○ Não verificado' },
  { v: 'NO_EVIDENCE', l: 'Sem evidência' },
]

const selectCls = 'h-10 w-full rounded-md bg-background px-3 text-sm shadow-sm ring-1 ring-input focus:outline-none focus:ring-2 focus:ring-ring'

export function SectionFilters({ options }: { options: FilterOptions }) {
  const router = useRouter()
  const sp = useSearchParams()
  const uf = sp?.get('uf') ?? ''
  const municipality = sp?.get('municipio') ?? ''
  const zone = sp?.get('zona') ?? ''
  const status = sp?.get('status') ?? ''

  const ufs = options?.ufs ?? []
  const munis = options?.municipalities ?? []
  const zones = options?.zones ?? []

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp?.toString() ?? '')
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    next.delete('page')
    router.push(`/secoes?${next.toString()}`)
  }

  return (
    <div className="rounded-lg bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Filter className="h-4 w-4 text-primary" /> Filtros
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <select aria-label="UF" className={selectCls} value={uf} onChange={(e) => update({ uf: e.target.value, municipio: '', zona: '' })}>
          <option value="">Todas as UFs</option>
          {ufs.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <select aria-label="Município" className={selectCls} value={municipality} onChange={(e) => update({ municipio: e.target.value, zona: '' })}>
          <option value="">Todos os municípios</option>
          {munis.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select aria-label="Zona" className={selectCls} value={zone} onChange={(e) => update({ zona: e.target.value })}>
          <option value="">Todas as zonas</option>
          {zones.map((z) => (
            <option key={z} value={z}>Zona {z}</option>
          ))}
        </select>
        <select aria-label="Status" className={selectCls} value={status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">Todos os status</option>
          {STATUS.map((s) => (
            <option key={s.v} value={s.v}>{s.l}</option>
          ))}
        </select>
        {uf || municipality || zone || status ? (
          <Button asChild variant="outline">
            <Link href="/secoes"><X className="mr-1 h-4 w-4" /> Limpar</Link>
          </Button>
        ) : (
          <Button variant="outline" disabled>
            <X className="mr-1 h-4 w-4" /> Limpar
          </Button>
        )}
      </div>
    </div>
  )
}
