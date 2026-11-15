import { Suspense } from 'react'
import { SearchCheck, Info } from 'lucide-react'
import { Container } from '@/components/layouts/container'
import { QueryFilters } from '@/components/query-filters'
import { StatusMessage } from '@/components/status-message'
import { SeverityBadge } from '@/components/status'
import {
  SEVERITY_LABEL,
  ANOMALY_TYPE_LABEL,
  ANOMALY_SCOPE_LABEL,
  ANOMALY_STATUS_LABEL,
  URN_ISSUE_LABEL,
  UF_INFO,
} from '@/lib/constants'
import { ensureAnalysisFresh, getAnomalySummary, listAnomalyFindings, listUrnReplacements } from '@/lib/electoral-analysis'
import { fmtDateTime } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Análises eleitorais — VotoAudit' }

const UF_OPTIONS = Object.keys(UF_INFO).sort().map((uf) => ({ value: uf, label: uf }))

export default async function AnalisesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = (await searchParams) ?? {}
  const str = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '')

  // Mantém os achados atualizados (no máximo a cada 6h) sem travar a página.
  try {
    await ensureAnalysisFresh()
  } catch (e) {
    console.error('ensureAnalysisFresh', e)
  }

  let summary: Awaited<ReturnType<typeof getAnomalySummary>> | null = null
  let findings: Awaited<ReturnType<typeof listAnomalyFindings>> | null = null
  let urns: Awaited<ReturnType<typeof listUrnReplacements>> | null = null
  try {
    ;[summary, findings, urns] = await Promise.all([
      getAnomalySummary(),
      listAnomalyFindings({
        type: str('tipo') || undefined,
        severity: str('severidade') || undefined,
        uf: str('uf') || undefined,
        scope: str('escopo') || undefined,
      }),
      listUrnReplacements({ uf: str('uf') || undefined }),
    ])
  } catch (e) {
    console.error('analises', e)
  }

  const sevCount = (sev: string) => summary?.bySeverity.find((s) => s.severity === sev)?.count ?? 0

  return (
    <Container className="py-10">
      <h1 className="flex items-center gap-2 font-display text-3xl font-bold tracking-tight">
        <SearchCheck className="h-7 w-7 text-primary" /> Análises eleitorais
      </h1>
      <p className="mt-1 max-w-3xl text-muted-foreground">
        Detecção automática de padrões atípicos e possíveis irregularidades a partir das evidências e dados oficiais.
        Cada achado é um <strong>indicador para verificação</strong> — nunca uma conclusão de fraude.
      </p>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          As urnas brasileiras não registram o voto individual auditável. Indicadores como comparecimento quase total
          (“votos espíritas”) ou concentração atípica de votos são sinalizadores estatísticos, jamais prova de irregularidade.
        </span>
      </div>

      {/* Cartões de resumo por severidade */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => (
          <div key={sev} className="rounded-lg bg-card p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{SEVERITY_LABEL[sev]}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{sevCount(sev)}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <Suspense fallback={<div className="h-24 rounded-lg bg-muted" />}>
          <QueryFilters
            filters={[
              { name: 'tipo', label: 'Tipo', options: Object.entries(ANOMALY_TYPE_LABEL).map(([value, label]) => ({ value, label })) },
              { name: 'severidade', label: 'Severidade', options: Object.entries(SEVERITY_LABEL).map(([value, label]) => ({ value, label })) },
              { name: 'escopo', label: 'Abrangência', options: Object.entries(ANOMALY_SCOPE_LABEL).map(([value, label]) => ({ value, label })) },
              { name: 'uf', label: 'UF', options: UF_OPTIONS },
            ]}
          />
        </Suspense>
      </div>

      {!findings ? (
        <StatusMessage />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg bg-card shadow-sm">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Severidade</th>
                <th className="px-4 py-2 text-left font-medium">Tipo</th>
                <th className="px-4 py-2 text-left font-medium">Local</th>
                <th className="px-4 py-2 text-left font-medium">Achado</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Detectado em</th>
              </tr>
            </thead>
            <tbody>
              {findings.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Nenhum achado com esses filtros. À medida que dados oficiais e evidências são ingeridos, as análises aparecem aqui.</td></tr>
              )}
              {findings.map((f) => (
                <tr key={f.id} className="border-t border-border/50 align-top hover:bg-muted/40">
                  <td className="px-4 py-3"><SeverityBadge severity={f.severity} /></td>
                  <td className="px-4 py-3">{ANOMALY_TYPE_LABEL[f.type] ?? f.type}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {[f.uf, f.municipality, f.zone ? `Z${f.zone}` : null].filter(Boolean).join(' · ') || ANOMALY_SCOPE_LABEL[f.scope] || '—'}
                  </td>
                  <td className="px-4 py-3 max-w-[360px]">
                    <p className="font-medium">{f.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{f.description}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{ANOMALY_STATUS_LABEL[f.status] ?? f.status}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(f.detectedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Urnas com ocorrência */}
      <h2 className="mt-10 font-display text-xl font-bold tracking-tight">Urnas com ocorrência</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        Urnas alteradas, danificadas, com defeito ou substituídas, com a respectiva justificativa (quando disponível na fonte oficial).
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg bg-card shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Local</th>
              <th className="px-4 py-2 text-left font-medium">Ocorrência</th>
              <th className="px-4 py-2 text-left font-medium">Justificativa</th>
              <th className="px-4 py-2 text-left font-medium">Quando</th>
            </tr>
          </thead>
          <tbody>
            {(!urns || urns.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">Nenhuma ocorrência de urna registrada para os filtros atuais.</td></tr>
            )}
            {urns?.map((u) => (
              <tr key={u.id} className="border-t border-border/50 align-top hover:bg-muted/40">
                <td className="px-4 py-3">{`${u.uf} · ${u.municipality ?? ''} · Z${u.zone}/S${u.section}`}</td>
                <td className="px-4 py-3">{URN_ISSUE_LABEL[u.issueType] ?? u.issueType}</td>
                <td className="px-4 py-3 max-w-[360px] text-muted-foreground">{u.justification}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.occurredAt ? fmtDateTime(u.occurredAt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Container>
  )
}
