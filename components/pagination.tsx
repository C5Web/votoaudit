'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Paginação client-side sobre um array já carregado. Reinicia para a primeira
 * página sempre que o total de itens muda (ex.: troca de filtro/aba).
 */
export function usePaged<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1)
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pageCount)

  useEffect(() => {
    setPage(1)
  }, [total])

  const slice = useMemo(() => items.slice((current - 1) * pageSize, current * pageSize), [items, current, pageSize])

  return { slice, page: current, pageCount, total, pageSize, setPage }
}

interface PaginatorProps {
  page: number
  pageCount: number
  total: number
  pageSize: number
  onPage: (p: number) => void
  /** Palavra para o rótulo de contagem, ex.: "registros", "incidentes". */
  noun?: string
  className?: string
}

/** Controle de paginação acessível (Anterior / Próxima) com contagem de itens. */
export function Paginator({ page, pageCount, total, pageSize, onPage, noun = 'registros', className = '' }: PaginatorProps) {
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 border-t border-border/50 px-1 py-3 text-sm ${className}`}>
      <p className="text-muted-foreground">
        {from}–{to} de <span className="font-medium tabular-nums">{total}</span> {noun}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior">
          <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
        </Button>
        <span className="text-muted-foreground" aria-live="polite">Página {page} de {pageCount}</span>
        <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)} aria-label="Próxima página">
          Próxima <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
