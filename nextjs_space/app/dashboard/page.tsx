import Link from 'next/link'
import { FileCheck2, Users, CheckCircle2, AlertTriangle, ShieldAlert, ArrowRight, UserCheck, Clock } from 'lucide-react'
import { Container } from '@/components/layouts/container'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { CountUp } from '@/components/count-up'
import { StatusMessage } from '@/components/status-message'
import { SeverityBadge, IncidentStatusBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { UF_INFO, INCIDENT_CATEGORY_LABEL } from '@/lib/constants'
import { getOverview, getCoverageByUf, getTimeline, listIncidents } from '@/lib/queries'
import { fmtDateTime } from '@/lib/format'
import { MapWidget, TimelineWidget } from './_components/dashboard-widgets'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Dashboard — VotoAudit' }

export default async function DashboardPage() {
  let data: {
    o: Awaited<ReturnType<typeof getOverview>>
    ufs: Awaited<ReturnType<typeof getCoverageByUf>>
    timeline: Awaited<ReturnType<typeof getTimeline>>
    incidents: Awaited<ReturnType<typeof listIncidents>>
  } | null = null
  try {
    const [o, ufs, timeline, incidents] = await Promise.all([getOverview(), getCoverageByUf(), getTimeline(), listIncidents({}, 5)])
    data = { o, ufs, timeline, incidents }
  } catch (e) {
    console.error('dashboard', e)
  }
  if (!data) return <StatusMessage />
  const { o, ufs, timeline, incidents } = data

  const cards = [
    { label: 'BUs oficiais', value: o?.officialBUs ?? 0, icon: FileCheck2, cls: 'text-primary bg-primary/10' },
    { label: 'BUs cidadãos', value: o?.citizenBUs ?? 0, icon: Users, cls: 'text-primary bg-primary/10' },
    { label: 'Cruzados concordantes', value: o?.concordantBUs ?? 0, icon: CheckCircle2, cls: 'text-verified-foreground bg-verified/15' },
    { label: 'Seções com divergência', value: o?.divergenceSections ?? 0, icon: AlertTriangle, cls: 'text-divergence-foreground bg-divergence/15' },
    { label: 'Incidentes ativos', value: o?.activeIncidents ?? 0, icon: ShieldAlert, cls: 'text-destructive bg-destructive/10' },
  ]

  return (
    <Container className="py-10">
      <FadeIn>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Painel da auditoria cidadã</h1>
            <p className="mt-1 text-muted-foreground">
              Situação consolidada das evidências coletadas e do cruzamento com os dados oficiais — Eleições {o?.election?.year ?? 2026}, {o?.election?.round ?? 1}º turno.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-card px-4 py-2 text-sm shadow-sm">
            <UserCheck className="h-4 w-4 text-primary" />
            <span>
              <strong>{o?.contributors?.verifiedAccounts ?? 0}</strong> contas verificadas + <strong>{o?.contributors?.visitors ?? 0}</strong> visitantes
            </span>
          </div>
        </div>
      </FadeIn>

      <Stagger className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <StaggerItem key={c.label}>
            <div className="h-full rounded-lg bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
              <span className={`inline-flex h-9 w-9 items-center justify-center rounded-md ${c.cls}`}>
                <c.icon className="h-5 w-5" />
              </span>
              <div className="mt-3 font-display text-3xl font-bold">
                <CountUp value={c.value} />
              </div>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      <div className="mt-6 rounded-lg bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Cobertura cidadã</span>
          <span className="text-muted-foreground">
            {o?.sectionsWithCitizen ?? 0} de {o?.totalSections ?? 0} seções monitoradas com BU cidadão ({o?.coveragePct ?? 0}%)
          </span>
        </div>
        <Progress value={o?.coveragePct ?? 0} className="mt-3" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <FadeIn className="lg:col-span-3">
          <div className="h-full rounded-lg bg-card p-5 shadow-sm">
            <h2 className="font-semibold">Mapa por UF</h2>
            <p className="mb-3 text-xs text-muted-foreground">Tamanho = seções monitoradas. Clique para ver as seções da UF.</p>
            <div className="h-[400px]">
              <MapWidget rows={ufs ?? []} />
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-full bg-verified" /> ≥ 50% com BU cidadão</span>
              <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-full bg-verified/40" /> cobertura parcial</span>
              <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-full bg-divergence" /> com divergência</span>
              <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-full bg-unverified" /> sem cobertura</span>
            </div>
          </div>
        </FadeIn>
        <FadeIn className="lg:col-span-2" delay={0.05}>
          <div className="h-full rounded-lg bg-card p-5 shadow-sm">
            <h2 className="font-semibold">Cobertura por UF</h2>
            <div className="mt-3 max-h-[440px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 text-left font-medium">UF</th>
                    <th className="py-2 text-right font-medium">Seções</th>
                    <th className="py-2 text-right font-medium">✅</th>
                    <th className="py-2 text-right font-medium">⚠️</th>
                    <th className="py-2 text-right font-medium">Cobertura</th>
                  </tr>
                </thead>
                <tbody>
                  {(ufs ?? []).map((r) => (
                    <tr key={r.key} className="border-t border-border/50 hover:bg-muted/50">
                      <td className="py-2">
                        <Link href={`/secoes?uf=${r.key}`} className="font-medium text-primary hover:underline" title={UF_INFO[r.key]?.name}>
                          {r.key}
                        </Link>
                      </td>
                      <td className="py-2 text-right tabular-nums">{r.total}</td>
                      <td className="py-2 text-right tabular-nums">{r.verified}</td>
                      <td className="py-2 text-right tabular-nums">{r.divergence}</td>
                      <td className="py-2 text-right tabular-nums">{r.coveragePct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </FadeIn>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <FadeIn className="lg:col-span-3">
          <div className="h-full rounded-lg bg-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 font-semibold"><Clock className="h-4 w-4 text-primary" /> BUs cidadãos ao longo do tempo</h2>
            <div className="mt-3 h-[300px]">
              {(timeline?.length ?? 0) > 0 ? (
                <TimelineWidget data={timeline ?? []} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Nenhum BU coletado ainda.</div>
              )}
            </div>
          </div>
        </FadeIn>
        <FadeIn className="lg:col-span-2" delay={0.05}>
          <div className="h-full rounded-lg bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Incidentes recentes</h2>
              <Button asChild variant="ghost" size="sm">
                <Link href="/incidentes">Ver todos <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </div>
            <ul className="mt-3 space-y-2">
              {(incidents ?? []).length === 0 && <li className="text-sm text-muted-foreground">Nenhum incidente registrado.</li>}
              {(incidents ?? []).map((i) => (
                <li key={i.id}>
                  <Link href={`/incidentes/${i.id}`} className="block rounded-md bg-muted/50 p-3 transition-colors hover:bg-muted">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={i.severity} />
                      <IncidentStatusBadge status={i.status} />
                    </div>
                    <p className="mt-2 text-sm font-medium">{INCIDENT_CATEGORY_LABEL[i.category] ?? i.category}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.section ? `${i.section.uf} · ${i.section.municipality} · Zona ${i.section.zone} · Seção ${i.section.section}` : '—'} · {fmtDateTime(i.detectedAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </FadeIn>
      </div>
    </Container>
  )
}
