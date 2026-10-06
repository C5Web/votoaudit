import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Pager({ page, totalPages, basePath, params }: { page: number; totalPages: number; basePath: string; params: Record<string, string> }) {
  const href = (p: number) => {
    const sp = new URLSearchParams(params ?? {})
    sp.set('page', String(p))
    return `${basePath}?${sp.toString()}`
  }
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">Página {page} de {totalPages}</span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm"><Link href={href(page - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Link></Button>
        ) : (
          <Button variant="outline" size="sm" disabled><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button>
        )}
        {page < totalPages ? (
          <Button asChild variant="outline" size="sm"><Link href={href(page + 1)}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Link></Button>
        ) : (
          <Button variant="outline" size="sm" disabled>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button>
        )}
      </div>
    </div>
  )
}
