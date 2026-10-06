import Link from 'next/link'
import { Logo } from './logo'

export function SiteFooter() {
  return (
    <footer className="mt-16 bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl space-y-3">
          <Logo light />
          <p className="text-sm text-primary-foreground/80">
            VotoAudit é uma iniciativa independente e apartidária de auditoria cidadã. Não é afiliado ao TSE, TREs ou
            qualquer partido político.
          </p>
        </div>
        <nav className="flex flex-wrap gap-4 text-sm" aria-label="Rodapé">
          <Link href="/dashboard" className="text-primary-foreground/80 hover:text-primary-foreground">Dashboard</Link>
          <Link href="/secoes" className="text-primary-foreground/80 hover:text-primary-foreground">Seções</Link>
          <Link href="/eventos" className="text-primary-foreground/80 hover:text-primary-foreground">Eventos</Link>
          <Link href="/incidentes" className="text-primary-foreground/80 hover:text-primary-foreground">Incidentes</Link>
        </nav>
      </div>
    </footer>
  )
}
