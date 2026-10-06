import { Suspense } from 'react'
import { CalendarClock, MapPin, Building2, ExternalLink, Lock, Unlock, FileText } from 'lucide-react'
import { Container } from '@/components/layouts/container'
import { QueryFilters } from '@/components/query-filters'
import { StatusMessage } from '@/components/status-message'
import { EVENT_TYPE_LABEL, EVENT_STATUS_LABEL, UF_INFO } from '@/lib/constants'
import { listEvents } from '@/lib/queries'
import { ensureCalendarFresh, TSE_CALENDAR_URL } from '@/lib/tse-calendar'
import { fmtDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Eventos de auditoria — VotoAudit' }

const STATUS_CLS: Record<string, string> = {
  SCHEDULED: 'bg-primary/10 text-primary',
  IN_PROGRESS: 'bg-divergence/15 text-divergence-foreground',
  COMPLETED: 'bg-verified/15 text-verified-foreground',
  CANCELLED: 'bg-muted text-muted-foreground',
}

export default async function EventosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = (await searchParams) ?? {}
  const uf = typeof sp.uf === 'string' ? sp.uf : ''
  const type = typeof sp.tipo === 'string' ? sp.tipo : ''
  let events: Awaited<ReturnType<typeof listEvents>> | null = null
  try {
    await ensureCalendarFresh().catch((e) => console.error('calendário TSE', e))
    events = await listEvents({ uf, type })
  } catch (e) {
    console.error('eventos', e)
  }

  return (
    <Container className="py-10">
      <h1 className="flex items-center gap-2 font-display text-3xl font-bold tracking-tight"><CalendarClock className="h-7 w-7 text-primary" /> Eventos de auditoria</h1>
      <p className="mt-1 text-muted-foreground">Agenda pública de testes de integridade, preparação de urnas e demais atos fiscalizáveis — compareça e registre evidências.</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Importado automaticamente do <a href={TSE_CALENDAR_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">calendário eleitoral do TSE</a> (Res. 23.760/2026) e atualizado a cada 6 horas. Horários de Brasília; locais exatos de cada zona saem nos editais dos TREs.
      </p>

      <div className="mt-6">
        <Suspense fallback={<div className="h-24 rounded-lg bg-muted" />}>
          <QueryFilters
            filters={[
              { name: 'uf', label: 'UF', options: Object.keys(UF_INFO).sort().map((u) => ({ value: u, label: `${u} — ${UF_INFO[u]?.name}` })) },
              { name: 'tipo', label: 'Tipo', options: Object.entries(EVENT_TYPE_LABEL).map(([value, label]) => ({ value, label })) },
            ]}
          />
        </Suspense>
      </div>

      {!events ? (
        <StatusMessage />
      ) : events.length === 0 ? (
        <p className="mt-10 text-center text-muted-foreground">Nenhum evento encontrado com esses filtros.</p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {events.map((e) => (
            <div key={e.id}>
              <article className="flex h-full flex-col rounded-lg bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">{e.national ? 'Nacional' : e.uf}</span>
                  <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', STATUS_CLS[e.status] ?? STATUS_CLS.SCHEDULED)}>{EVENT_STATUS_LABEL[e.status] ?? e.status}</span>
                  <span className="text-xs text-muted-foreground">{e.round}º turno</span>
                  {e.fromCalendar && <span className="text-xs text-muted-foreground">· Calendário TSE</span>}
                </div>
                <h2 className="mt-3 text-lg font-semibold">{EVENT_TYPE_LABEL[e.type] ?? e.type}</h2>
                <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><CalendarClock className="h-4 w-4 shrink-0" /> {fmtDateTime(e.scheduledStart)}{e.scheduledEnd ? ` – ${fmtDateTime(e.scheduledEnd)}` : ''}</li>
                  {e.officialOrganizer && <li className="flex items-center gap-2"><Building2 className="h-4 w-4 shrink-0" /> {e.officialOrganizer}</li>}
                  <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {[e.venue, e.address, e.municipality].filter(Boolean).join(' · ') || 'Local a confirmar'}</li>
                  <li className="flex items-center gap-2">{e.publicAccess ? <Unlock className="h-4 w-4 shrink-0" /> : <Lock className="h-4 w-4 shrink-0" />} {e.publicAccess ? 'Aberto ao público' : 'Acesso restrito a credenciados'}</li>
                  {e.avpartCount > 0 && <li className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0" /> {e.avpartCount} relatório(s) AVPART</li>}
                </ul>
                {e.officialSourceUrl && (
                  <a href={e.officialSourceUrl} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-primary hover:underline">
                    Fonte oficial <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </article>
            </div>
          ))}
        </div>
      )}
    </Container>
  )
}
