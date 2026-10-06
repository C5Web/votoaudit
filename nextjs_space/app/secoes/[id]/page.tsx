import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MapPin, FileCheck2, Users, GitCompare, ShieldAlert, Hash, QrCode, CheckCircle2, XCircle, Camera, ListChecks, ScrollText, AlertTriangle } from 'lucide-react'
import { Container } from '@/components/layouts/container'
import { Button } from '@/components/ui/button'
import { SectionStatusBadge, SeverityBadge, IncidentStatusBadge } from '@/components/status'
import { DiffTable, type DiffRowView } from '@/components/diff-table'
import { DEMO_CANDIDATES, candidateName, PROVENANCE_LABEL, VALIDATION_RESULT_LABEL, CONFIDENCE_LABEL, INCIDENT_CATEGORY_LABEL, UF_INFO } from '@/lib/constants'
import { getSectionDetail } from '@/lib/queries'
import { fmtDateTime, shortHash } from '@/lib/format'

export const dynamic = 'force-dynamic'

type SectionData = NonNullable<Awaited<ReturnType<typeof getSectionDetail>>>
type BU = SectionData['citizenBUs'][number]
type RDV = SectionData['rdvs'][number]

const RECON_LABEL: Record<string, string> = { CONFERE: 'Confere com o oficial', DIVERGENCIA: 'Diverge do oficial', INSUFICIENTE: 'Sem BU oficial para conferir' }

function ReconBadge({ status }: { status: string }) {
  if (status === 'CONFERE') return <span className="inline-flex items-center gap-1 rounded-full bg-verified/15 px-2.5 py-0.5 text-xs font-medium text-verified-foreground"><CheckCircle2 className="h-3.5 w-3.5" /> {RECON_LABEL.CONFERE}</span>
  if (status === 'DIVERGENCIA') return <span className="inline-flex items-center gap-1 rounded-full bg-divergence/15 px-2.5 py-0.5 text-xs font-medium text-divergence-foreground"><AlertTriangle className="h-3.5 w-3.5" /> {RECON_LABEL.DIVERGENCIA}</span>
  return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{RECON_LABEL.INSUFICIENTE}</span>
}

function FlagChip({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${on ? 'bg-verified/15 text-verified-foreground' : 'bg-muted text-muted-foreground'}`}>
      {on ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />} {label}
    </span>
  )
}

function RdvTally({ rdv }: { rdv: RDV }) {
  const t = rdv.tally
  if (!t) return null
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {DEMO_CANDIDATES.map((c) => (
        <div key={c.number} className="rounded-md bg-muted/50 p-2">
          <p className="text-xs text-muted-foreground">{c.name} ({c.number})</p>
          <p className="font-semibold tabular-nums">{t.candidateVotes?.[c.number] ?? 0}</p>
        </div>
      ))}
      <div className="rounded-md bg-muted/50 p-2"><p className="text-xs text-muted-foreground">Brancos</p><p className="font-semibold tabular-nums">{t.blankVotes ?? 0}</p></div>
      <div className="rounded-md bg-muted/50 p-2"><p className="text-xs text-muted-foreground">Nulos</p><p className="font-semibold tabular-nums">{t.nullVotes ?? 0}</p></div>
      <div className="rounded-md bg-muted/50 p-2"><p className="text-xs text-muted-foreground">Total apurado</p><p className="font-semibold tabular-nums">{t.totalVotes ?? 0}</p></div>
    </div>
  )
}

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

      <Block icon={ListChecks} title={`RDV — Registro Digital do Voto (${s.rdvs?.length ?? 0})`}>
        {(s.rdvs?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum RDV ingerido para esta seção. Quando o Registro Digital do Voto for carregado, a conferência voto a voto contra o BU oficial aparecerá aqui.</p>
        ) : (
          <div className="space-y-4">
            {(s.rdvs ?? []).map((r) => (
              <div key={r.id} className="rounded-md bg-muted/40 p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold">{r.name}</span>
                  {r.reconciliation && <ReconBadge status={r.reconciliation.status} />}
                  {r.office && <span className="rounded-full bg-background px-2 py-0.5">{r.office}</span>}
                  {r.format && <span className="rounded-full bg-background px-2 py-0.5">{r.format}</span>}
                  <span className="text-muted-foreground">{fmtDateTime(r.fetchedAt)}</span>
                </div>
                <RdvTally rdv={r} />
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>Cédulas no RDV: <strong className="tabular-nums text-foreground">{r.ballotCount}</strong></span>
                  {r.tally && <span>Total apurado: <strong className="tabular-nums text-foreground">{r.tally.totalVotes}</strong></span>}
                </div>
                {r.reconciliation?.note && <p className="mt-2 text-sm">{r.reconciliation.note}</p>}
                {(r.reconciliation?.diffs?.length ?? 0) > 0 && (
                  <div className="mt-3 overflow-hidden rounded-md border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-3 py-1.5 text-left font-medium">Candidato / categoria</th><th className="px-3 py-1.5 text-right font-medium">RDV</th><th className="px-3 py-1.5 text-right font-medium">BU oficial</th><th className="px-3 py-1.5 text-right font-medium">Diferença</th></tr></thead>
                      <tbody>
                        {(r.reconciliation?.diffs ?? []).map((d) => {
                          const label = d.key === 'blankVotes' ? 'Brancos' : d.key === 'nullVotes' ? 'Nulos' : `${candidateName(d.key)} (${d.key})`
                          return (
                            <tr key={d.key} className="border-t border-border">
                              <td className="px-3 py-1.5">{label}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{d.rdv}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{d.official}</td>
                              <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-divergence-foreground">{d.rdv - d.official > 0 ? '+' : ''}{d.rdv - d.official}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {r.warnings?.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {r.warnings.map((w, i) => (<li key={i} className="flex items-start gap-1 text-xs text-divergence-foreground"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}</li>))}
                  </ul>
                )}
                {r.sha256 && <p className="mt-2 flex items-center gap-1 font-mono text-xs text-muted-foreground"><Hash className="h-3 w-3" /> {shortHash(r.sha256, 24)}</p>}
              </div>
            ))}
          </div>
        )}
      </Block>

      <Block icon={ScrollText} title={`Log da urna (${s.urnLogs?.length ?? 0})`}>
        {(s.urnLogs?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum log de urna ingerido para esta seção. Quando o arquivo de log for carregado, os marcos da urna (zerésima, abertura e encerramento da votação, emissão do BU) aparecerão aqui.</p>
        ) : (
          <div className="space-y-4">
            {(s.urnLogs ?? []).map((l) => (
              <div key={l.id} className="rounded-md bg-muted/40 p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold">{l.name}</span>
                  {l.format && <span className="rounded-full bg-background px-2 py-0.5">{l.format}</span>}
                  <span className="text-muted-foreground">{fmtDateTime(l.fetchedAt)}</span>
                  <span className="text-muted-foreground">{l.lineCount} linhas</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <FlagChip on={l.flags.zeresimaEmitted} label="Zerésima emitida" />
                  <FlagChip on={l.flags.votingStarted} label="Votação iniciada" />
                  <FlagChip on={l.flags.votingEnded} label="Votação encerrada" />
                  <FlagChip on={l.flags.buEmitted} label="BU emitido" />
                </div>
                {l.notable?.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Eventos notáveis</p>
                    <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md bg-background/60 p-2 font-mono text-xs">
                      {l.notable.slice(0, 40).map((n, i) => (
                        <li key={i} className="flex flex-wrap gap-2">
                          {n.timestamp && <span className="text-muted-foreground">{n.timestamp}</span>}
                          {n.tag && <span className="rounded bg-primary/10 px-1.5 text-primary">{n.tag}</span>}
                          <span>{n.message}</span>
                        </li>
                      ))}
                    </ul>
                    {l.notable.length > 40 && <p className="mt-1 text-xs text-muted-foreground">+ {l.notable.length - 40} outros eventos registrados.</p>}
                  </div>
                )}
                {l.warnings?.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {l.warnings.map((w, i) => (<li key={i} className="flex items-start gap-1 text-xs text-divergence-foreground"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}</li>))}
                  </ul>
                )}
                {l.sha256 && <p className="mt-2 flex items-center gap-1 font-mono text-xs text-muted-foreground"><Hash className="h-3 w-3" /> {shortHash(l.sha256, 24)}</p>}
              </div>
            ))}
          </div>
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
