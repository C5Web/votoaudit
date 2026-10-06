import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MapPin, FileCheck2, Users, GitCompare, ShieldAlert, Hash, QrCode, CheckCircle2, XCircle, Camera } from 'lucide-react'
import { Container } from '@/components/layouts/container'
import { Button } from '@/components/ui/button'
import { SectionStatusBadge, SeverityBadge, IncidentStatusBadge } from '@/components/status'
import { DiffTable, type DiffRowView } from '@/components/diff-table'
import { DEMO_CANDIDATES, candidateName, PROVENANCE_LABEL, VALIDATION_RESULT_LABEL, CONFIDENCE_LABEL, INCIDENT_CATEGORY_LABEL, UF_INFO } from '@/lib/constants'
import { getSectionDetail } from '@/lib/queries'
import { fmtDateTime, shortHash } from '@/lib/format'

export const dynamic = 'force-dynamic'

type BU = NonNullable<Awaited<ReturnType<typeof getSectionDetail>>>['citizenBUs'][number]

function Block({ icon: Icon, title, children, action }: { icon: typeof MapPin; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold"><Icon className="h-5 w-5 text-primary" /> {title}</h2>
          {action}
        </div>
        {children}
    </section>
  )
}

function VotesGrid({ bu }: { bu: BU }) {
  const votes = bu?.candidateVotes ?? {}
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {DEMO_CANDIDATES.map((c) => (
        <div key={c.number} className="rounded-md bg-muted/50 p-2">
          <p className="text-xs text-muted-foreground">{c.name} ({c.number})</p>
          <p className="font-semibold tabular-nums">{votes?.[c.number] ?? 0}</p>
        </div>
      ))}
      <div className="rounded-md bg-muted/50 p-2"><p className="text-xs text-muted-foreground">Brancos</p><p className="font-semibold tabular-nums">{bu?.blankVotes ?? 0}</p></div>
      <div className="rounded-md bg-muted/50 p-2"><p className="text-xs text-muted-foreground">Nulos</p><p className="font-semibold tabular-nums">{bu?.nullVotes ?? 0}</p></div>
      <div className="rounded-md bg-muted/50 p-2"><p className="text-xs text-muted-foreground">Comparecimento</p><p className="font-semibold tabular-nums">{bu?.turnout ?? '—'}</p></div>
    </div>
  )
}

export default async function SectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let s: Awaited<ReturnType<typeof getSectionDetail>> = null
  try {
    s = await getSectionDetail(id)
  } catch (e) {
    console.error('secao', e)
  }
  if (!s) notFound()

  const v = s.validation
  const diff = (v?.diffDetails ?? null) as { rows?: DiffRowView[]; groups?: { count: number; anonymous: number; matchesOfficial: boolean | null }[]; citizensAgree?: boolean } | null

  return (
    <Container className="space-y-6 py-10">
      <Button asChild variant="ghost" size="sm"><Link href="/secoes"><ArrowLeft className="mr-1 h-4 w-4" /> Voltar para seções</Link></Button>

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm text-muted-foreground">{UF_INFO[s.uf]?.name ?? s.uf} · {s.municipality}</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">Zona {s.zone} · Seção {s.section}</h1>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" /> {s.pollingPlace ?? 'Local não informado'}{s.address ? ` — ${s.address}` : ''}</p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <SectionStatusBadge status={s.status} />
          <Button asChild size="sm"><Link href={`/coletar?secao=${s.id}`}><Camera className="mr-1 h-4 w-4" /> Enviar evidência desta seção</Link></Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">Eleitores aptos</p><p className="text-2xl font-bold tabular-nums">{s.eligibleVoters ?? '—'}</p></div>
        <div className="rounded-lg bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">BUs cidadãos</p><p className="text-2xl font-bold tabular-nums">{s.citizenBUs?.length ?? 0}</p></div>
        <div className="rounded-lg bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">Confiança do cruzamento</p><p className="text-2xl font-bold">{v ? CONFIDENCE_LABEL[v.confidenceLevel] ?? v.confidenceLevel : '—'}</p></div>
      </div>

      <Block icon={FileCheck2} title="BU oficial (TSE)">
        {s.officialBU ? (
          <>
            <VotesGrid bu={s.officialBU} />
            <p className="mt-3 flex items-center gap-1 font-mono text-xs text-muted-foreground"><Hash className="h-3 w-3" /> {shortHash(s.officialBU.sha256, 24)}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">O BU oficial desta seção ainda não foi publicado/ingerido.</p>
        )}
      </Block>

      <Block icon={Users} title={`BUs cidadãos (${s.citizenBUs?.length ?? 0})`}>
        {(s.citizenBUs?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum BU cidadão recebido para esta seção.</p>
        ) : (
          <div className="space-y-3">
            {(s.citizenBUs ?? []).map((b, idx) => (
              <div key={b.id} className="rounded-md bg-muted/40 p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold">Fonte #{idx + 1}</span>
                  <span className="rounded-full bg-background px-2 py-0.5">{PROVENANCE_LABEL[b.provenanceLevel] ?? b.provenanceLevel}</span>
                  <span className="rounded-full bg-background px-2 py-0.5">Fonte: {b.sourceLabel}</span>
                  <span className="text-muted-foreground">{fmtDateTime(b.capturedAt)}</span>
                  {b.qrSignatureValid === true && <span className="inline-flex items-center gap-1 text-verified-foreground"><QrCode className="h-3.5 w-3.5" /> QR válido</span>}
                  {b.qrSignatureValid === false && <span className="inline-flex items-center gap-1 text-divergence-foreground"><QrCode className="h-3.5 w-3.5" /> QR inválido</span>}
                  {b.validationResult === 'MATCH' && <span className="inline-flex items-center gap-1 text-verified-foreground"><CheckCircle2 className="h-3.5 w-3.5" /> confere com oficial</span>}
                  {b.validationResult === 'DIVERGENCE' && <span className="inline-flex items-center gap-1 text-divergence-foreground"><XCircle className="h-3.5 w-3.5" /> difere do oficial</span>}
                </div>
                <VotesGrid bu={b} />
                <p className="mt-2 font-mono text-xs text-muted-foreground">SHA-256: {shortHash(b.sha256, 24)}</p>
              </div>
            ))}
          </div>
        )}
      </Block>

      <Block icon={GitCompare} title="Cross-validation">
        {v ? (
          <>
            <div className="mb-4 flex flex-wrap gap-3 text-sm">
              <span className="rounded-md bg-muted/50 px-3 py-1">Resultado: <strong>{VALIDATION_RESULT_LABEL[v.result] ?? v.result}</strong></span>
              <span className="rounded-md bg-muted/50 px-3 py-1">Fontes: <strong>{v.sourcesCount}</strong></span>
              <span className="rounded-md bg-muted/50 px-3 py-1">Concordantes: <strong>{v.concordantCount}</strong></span>
              <span className="rounded-md bg-muted/50 px-3 py-1">Divergentes: <strong>{v.divergentCount}</strong></span>
              <span className="rounded-md bg-muted/50 px-3 py-1 text-muted-foreground">Calculado em {fmtDateTime(v.computedAt)}</span>
            </div>
            <DiffTable rows={diff?.rows ?? []} />
            {(diff?.groups?.length ?? 0) > 1 && (
              <p className="mt-3 text-sm text-divergence-foreground">Os BUs cidadãos desta seção formam {diff?.groups?.length} versões distintas de contagem.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Ainda não há cruzamento calculado para esta seção.</p>
        )}
      </Block>

      <div className="grid gap-6 md:grid-cols-2">
        <Block icon={ShieldAlert} title="Incidentes">
          {(s.incidents?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum incidente nesta seção.</p>
          ) : (
            <ul className="space-y-2">
              {(s.incidents ?? []).map((i) => (
                <li key={i.id}>
                  <Link href={`/incidentes/${i.id}`} className="block rounded-md bg-muted/40 p-3 hover:bg-muted">
                    <div className="flex flex-wrap gap-2"><SeverityBadge severity={i.severity} /><IncidentStatusBadge status={i.status} /></div>
                    <p className="mt-1 text-sm">{INCIDENT_CATEGORY_LABEL[i.category] ?? i.category} · <span className="text-muted-foreground">{fmtDateTime(i.detectedAt)}</span></p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Block>
        <Block icon={FileCheck2} title="Zerésimas">
          {(s.zeresimas?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma zerésima registrada.</p>
          ) : (
            <ul className="space-y-2">
              {(s.zeresimas ?? []).map((z) => (
                <li key={z.id} className="flex items-center justify-between rounded-md bg-muted/40 p-3 text-sm">
                  <span>{fmtDateTime(z.issuedAt)} · total {z.totalVotes}</span>
                  {z.isConsistent ? (
                    <span className="inline-flex items-center gap-1 text-verified-foreground"><CheckCircle2 className="h-4 w-4" /> Consistente</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-destructive"><XCircle className="h-4 w-4" /> Inconsistente</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Block>
      </div>

      <p className="text-xs text-muted-foreground">Candidatos exibidos são fictícios ({candidateName('91')} a {candidateName('95')}), usados apenas para demonstração.</p>
    </Container>
  )
}
