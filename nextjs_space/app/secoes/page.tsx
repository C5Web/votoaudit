import Link from 'next/link'
import { Suspense } from 'react'
import { ListChecks, FileCheck2, ChevronRight } from 'lucide-react'
import { Container } from '@/components/layouts/container'
import { SectionStatusBadge } from '@/components/status'
import { StatusMessage } from '@/components/status-message'
import { Pager } from '@/components/pager'
import { listSections, getSectionFilterOptions } from '@/lib/queries'
import { SectionFilters } from './_components/section-filters'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Seções — VotoAudit' }

type SP = Promise<Record<string, string | string[] | undefined>>

export default async function SecoesPage({ searchParams }: { searchParams: SP }) {
  const raw = (await searchParams) ?? {}
  const get = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string) : '')
  const filters = { uf: get('uf'), municipio: get('municipio'), zona: get('zona'), status: get('status') }
  const page = Math.max(1, parseInt(get('page') || '1', 10) || 1)

  let res: Awaited<ReturnType<typeof listSections>> | null = null
  let options: Awaited<ReturnType<typeof getSectionFilterOptions>> = { ufs: [], municipalities: [], zones: [] }
  try {
    ;[res, options] = await Promise.all([
      listSections({ uf: filters.uf, municipality: filters.municipio, zone: filters.zona, status: filters.status, page, pageSize: 15 }),
      getSectionFilterOptions(filters.uf, filters.municipio),
    ])
  } catch (e) {
    console.error('secoes', e)
  }

  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => !!v)) as Record<string, string>

  return (
    <Container className="py-10">
      <h1 className="flex items-center gap-2 font-display text-3xl font-bold tracking-tight">
        <ListChecks className="h-7 w-7 text-primary" /> Seções eleitorais
      </h1>
      <p className="mt-1 text-muted-foreground">Consulte o estado de verificação de cada seção monitorada e abra o detalhe para ver o cruzamento completo.</p>

      <div className="mt-6">
        <Suspense fallback={<div className="h-24 rounded-lg bg-muted" />}>
          <SectionFilters options={options} />
        </Suspense>
      </div>

      {!res ? (
        <StatusMessage />
      ) : (
        <div className="mt-6 rounded-lg bg-card shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 text-sm text-muted-foreground">
            <span>{res.total} seções encontradas</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">UF</th>
                  <th className="px-4 py-2 text-left font-medium">Município</th>
                  <th className="px-4 py-2 text-left font-medium">Zona</th>
                  <th className="px-4 py-2 text-left font-medium">Seção</th>
                  <th className="px-4 py-2 text-left font-medium">Local de votação</th>
                  <th className="px-4 py-2 text-center font-medium">BUs cidadãos</th>
                  <th className="px-4 py-2 text-center font-medium">Oficial</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {(res.items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">Nenhuma seção encontrada com esses filtros.</td>
                  </tr>
                )}
                {(res.items ?? []).map((s) => (
                  <tr key={s.id} className="border-t border-border/50 transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{s.uf}</td>
                    <td className="px-4 py-3">{s.municipality}</td>
                    <td className="px-4 py-3 tabular-nums">{s.zone}</td>
                    <td className="px-4 py-3 tabular-nums">{s.section}</td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-muted-foreground">{s.pollingPlace ?? '—'}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{s.citizenBUs}</td>
                    <td className="px-4 py-3 text-center">
                      {s.hasOfficial ? <FileCheck2 className="mx-auto h-4 w-4 text-verified" aria-label="BU oficial disponível" /> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3"><SectionStatusBadge status={s.status} /></td>
                    <td className="px-2 py-3">
                      <Link href={`/secoes/${s.id}`} className="inline-flex items-center rounded-md px-2 py-1 text-primary hover:bg-primary/10" aria-label={`Detalhes da seção ${s.section}`}>
                        Ver <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3">
            <Pager page={res.page} totalPages={res.totalPages} basePath="/secoes" params={params} />
          </div>
        </div>
      )}
    </Container>
  )
}
