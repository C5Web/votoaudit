import Link from 'next/link'
import { Suspense } from 'react'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { Container } from '@/components/layouts/container'
import { QueryFilters } from '@/components/query-filters'
import { StatusMessage } from '@/components/status-message'
import { SeverityBadge, IncidentStatusBadge } from '@/components/status'
import { SEVERITY_LABEL, INCIDENT_STATUS_LABEL, INCIDENT_CATEGORY_LABEL } from '@/lib/constants'
import { listIncidents } from '@/lib/queries'
import { fmtDateTime } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Incidentes — VotoAudit' }

export default async function IncidentesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = (await searchParams) ?? {}
  const severity = typeof sp.severidade === 'string' ? sp.severidade : ''
  const status = typeof sp.status === 'string' ? sp.status : ''
  let rows: Awaited<ReturnType<typeof listIncidents>> | null = null
  try {
    rows = await listIncidents({ severity, status })
  } catch (e) {
    console.error('incidentes', e)
  }

  return (
    <Container className="py-10">
      <h1 className="flex items-center gap-2 font-display text-3xl font-bold tracking-tight"><AlertTriangle className="h-7 w-7 text-divergence" /> Incidentes</h1>
      <p className="mt-1 max-w-3xl text-muted-foreground">
        Divergências detectadas automaticamente entre evidências. Um incidente é um ponto de atenção para revisão técnica — não é uma conclusão.
      </p>

      <div className="mt-6">
        <Suspense fallback={<div className="h-24 rounded-lg bg-muted" />}>
          <QueryFilters
            filters={[
              { name: 'severidade', label: 'Severidade', options: Object.entries(SEVERITY_LABEL).map(([value, label]) => ({ value, label })) },
              {
                name: 'status',
                label: 'Status',
                options: [{ value: 'OPEN', label: 'Em aberto (todos)' }, ...Object.entries(INCIDENT_STATUS_LABEL).map(([value, label]) => ({ value, label }))],
              },
            ]}
          />
        </Suspense>
      </div>

      {!rows ? (
        <StatusMessage />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg bg-card shadow-sm">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Severidade</th>
                <th className="px-4 py-2 text-left font-medium">Categoria</th>
                <th className="px-4 py-2 text-left font-medium">Seção</th>
                <th className="px-4 py-2 text-left font-medium">Detectado em</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Nenhum incidente com esses filtros.</td></tr>
              )}
              {rows.map((i) => (
                <tr key={i.id} className="border-t border-border/50 hover:bg-muted/40">
                  <td className="px-4 py-3"><SeverityBadge severity={i.severity} /></td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{INCIDENT_CATEGORY_LABEL[i.category] ?? i.category}</p>
                    {i.summary && <p className="line-clamp-1 text-xs text-muted-foreground">{i.summary}</p>}
                  </td>
                  <td className="px-4 py-3">{i.section ? `${i.section.uf} · ${i.section.municipality} · Z${i.section.zone}/S${i.section.section}` : '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(i.detectedAt)}</td>
                  <td className="px-4 py-3"><IncidentStatusBadge status={i.status} /></td>
                  <td className="px-2 py-3">
                    <Link href={`/incidentes/${i.id}`} className="inline-flex items-center rounded-md px-2 py-1 text-primary hover:bg-primary/10">Ver <ChevronRight className="h-4 w-4" /></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  )
}
