import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MapPin, FileSearch, GitCompare, History, Info, QrCode, Hash } from 'lucide-react'
import { Container } from '@/components/layouts/container'
import { Button } from '@/components/ui/button'
import { FadeIn } from '@/components/ui/animate'
import { SeverityBadge, IncidentStatusBadge, SectionStatusBadge } from '@/components/status'
import { DiffTable, type DiffRowView } from '@/components/diff-table'
import { INCIDENT_CATEGORY_LABEL, INCIDENT_STATUS_LABEL, EVIDENCE_TYPE_LABEL, EVIDENCE_STATUS_LABEL, PROVENANCE_LABEL, ROLE_LABEL, candidateName } from '@/lib/constants'
import { getIncidentDetail } from '@/lib/queries'
import { fmtDateTime, shortHash } from '@/lib/format'

export const dynamic = 'force-dynamic'

function Block({ icon: Icon, title, children }: { icon: typeof Info; title: string; children: React.ReactNode }) {
  return (
    <FadeIn>
      <section className="rounded-lg bg-card p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 font-semibold"><Icon className="h-5 w-5 text-primary" /> {title}</h2>
        {children}
      </section>
    </FadeIn>
  )
}

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let i: Awaited<ReturnType<typeof getIncidentDetail>> = null
  try {
    i = await getIncidentDetail(id)
  } catch (e) {
    console.error('incidente', e)
  }
  if (!i) notFound()

  const f = (i.automatedFindings ?? {}) as {
    summary?: string
    comparedAgainst?: string
    sourcesCount?: number
    concordantCount?: number
    divergentCount?: number
    rows?: DiffRowView[]
    totalVotes?: number
    candidateVotes?: Record<string, number>
    blankVotes?: number
    nullVotes?: number
  }

  return (
    <Container size="md" className="space-y-6 py-10">
      <Button asChild variant="ghost" size="sm"><Link href="/incidentes"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar para incidentes</Link></Button>

      <div>
        <div className="flex flex-wrap gap-2"><SeverityBadge severity={i.severity} /><IncidentStatusBadge status={i.status} /></div>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">{INCIDENT_CATEGORY_LABEL[i.category] ?? i.category}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Detectado automaticamente em {fmtDateTime(i.detectedAt)} · ID {i.id.slice(-8)}</p>
      </div>

      <div className="flex gap-3 rounded-lg bg-primary/5 p-4 text-sm">
        <Info className="h-5 w-5 shrink-0 text-primary" />
        <p>Incidentes indicam divergências entre evidências que exigem revisão. Podem ter causas técnicas ou operacionais (foto ilegível, erro de digitação, seção trocada) e são analisados antes de qualquer conclusão.</p>
      </div>

      {i.section && (
        <Block icon={MapPin} title="Seção afetada">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="font-medium">{i.section.uf} · {i.section.municipality} · Zona {i.section.zone} · Seção {i.section.section}</p>
              <p className="text-sm text-muted-foreground">{i.section.pollingPlace ?? '—'}</p>
            </div>
            <div className="flex items-center gap-2">
              <SectionStatusBadge status={i.section.status} />
              <Button asChild size="sm" variant="outline"><Link href={`/secoes/${i.section.id}`}>Ver seção</Link></Button>
            </div>
          </div>
        </Block>
      )}

      <Block icon={GitCompare} title="Diff automático">
        {f.summary && <p className="mb-4 text-sm">{f.summary}</p>}
        {(f.rows?.length ?? 0) > 0 ? (
          <>
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              {f.comparedAgainst && <span className="rounded-md bg-muted/60 px-2 py-1">Comparado com: {f.comparedAgainst}</span>}
              {f.sourcesCount !== undefined && <span className="rounded-md bg-muted/60 px-2 py-1">Fontes: {f.sourcesCount}</span>}
              {f.concordantCount !== undefined && <span className="rounded-md bg-muted/60 px-2 py-1">Concordantes: {f.concordantCount}</span>}
              {f.divergentCount !== undefined && <span className="rounded-md bg-muted/60 px-2 py-1">Divergentes: {f.divergentCount}</span>}
            </div>
            <DiffTable rows={f.rows ?? []} />
          </>
        ) : f.candidateVotes ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(f.candidateVotes ?? {}).map(([k, n]) => (
              <div key={k} className="rounded-md bg-muted/50 p-2"><p className="text-xs text-muted-foreground">{candidateName(k)}</p><p className="font-semibold tabular-nums">{n} <span className="text-xs text-muted-foreground">(esperado 0)</span></p></div>
            ))}
            <div className="rounded-md bg-muted/50 p-2"><p className="text-xs text-muted-foreground">Brancos</p><p className="font-semibold">{f.blankVotes ?? 0}</p></div>
            <div className="rounded-md bg-muted/50 p-2"><p className="text-xs text-muted-foreground">Nulos</p><p className="font-semibold">{f.nullVotes ?? 0}</p></div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sem tabela comparativa para esta categoria.</p>
        )}
      </Block>

      <Block icon={FileSearch} title={`Evidências envolvidas (${i.evidences?.length ?? 0})`}>
        {(i.evidences?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma evidência vinculada.</p>
        ) : (
          <ul className="space-y-2">
            {(i.evidences ?? []).map((e, idx) => (
              <li key={e.id} className="rounded-md bg-muted/40 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">#{idx + 1} · {EVIDENCE_TYPE_LABEL[e.type] ?? e.type}</span>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs">{PROVENANCE_LABEL[e.provenanceLevel] ?? e.provenanceLevel}</span>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs">Fonte: {e.sourceLabel}</span>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs">{EVIDENCE_STATUS_LABEL[e.validationStatus] ?? e.validationStatus}</span>
                  {e.qrSignatureValid !== null && (
                    <span className="inline-flex items-center gap-1 text-xs"><QrCode className="h-3.5 w-3.5" /> QR {e.qrSignatureValid ? 'válido' : 'inválido'}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Capturada em {fmtDateTime(e.capturedAt)} · corroborações: {e.corroborationCount}</p>
                <p className="mt-1 flex items-center gap-1 font-mono text-xs text-muted-foreground"><Hash className="h-3 w-3" /> {shortHash(e.sha256Original, 32)}</p>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block icon={History} title="Histórico de revisões">
        <ol className="relative space-y-4 border-l border-border pl-5">
          <li>
            <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
            <p className="text-sm font-medium">Detectado pelo sistema</p>
            <p className="text-xs text-muted-foreground">{fmtDateTime(i.detectedAt)}</p>
          </li>
          {(i.humanReview ?? []).map((r, idx) => (
            <li key={idx}>
              <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-verified" />
              <p className="text-sm font-medium">{INCIDENT_STATUS_LABEL[r?.status] ?? r?.status} <span className="font-normal text-muted-foreground">· {ROLE_LABEL[r?.reviewerRole] ?? 'Revisor'}</span></p>
              <p className="text-xs text-muted-foreground">{fmtDateTime(r?.at)}</p>
              {r?.note && <p className="mt-1 text-sm">{r.note}</p>}
            </li>
          ))}
        </ol>
        {i.resolution && <p className="mt-4 rounded-md bg-muted/50 p-3 text-sm"><strong>Resolução:</strong> {i.resolution}</p>}
      </Block>
    </Container>
  )
}
