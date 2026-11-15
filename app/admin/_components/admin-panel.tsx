'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutDashboard, ShieldAlert, CalendarClock, Users, Cog, Loader2, Database, GitCompare, RefreshCw, Play, FileCheck2, BadgeCheck, MailPlus, ScrollText, Ban, RotateCcw, Vote, CheckCircle2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ROLE_LABEL, VERIFICATION_LABEL, JOB_TYPE_LABEL } from '@/lib/constants'
import { fmtDateTime, roundLabel } from '@/lib/format'
import { usePaged, Paginator } from '@/components/pagination'
import { assignableRoles, canActOn, rankOf } from '@/lib/roles'
import { IncidentsAdmin, EventsAdmin, callApi, type AdminIncident, type AdminEvent } from './admin-sections'
import { VerificationAdmin, InvitesAdmin, AuditAdmin } from './admin-staff'

interface Overview {
  election?: { year: number; round: number; electionDate: string; status: string } | null
  officialBUs: number
  citizenBUs: number
  concordantBUs: number
  divergenceSections: number
  activeIncidents: number
  totalSections: number
  verifiedSections: number
  coveragePct: number
  contributors: { verifiedAccounts: number; visitors: number }
}

interface CollectorRow {
  id: string
  displayName: string
  email: string
  role: string
  verificationLevel: string
  organization: string | null
  evidences: number
  createdAt: string
  suspendedAt: string | null
  suspendedReason: string | null
}

interface Job {
  id: number
  type: string
  status: string
  attempts: number
  createdAt: string
  errorMessage: string | null
}

const OPS = [
  { key: 'cand', label: 'Ingerir candidatos (TSE)', url: '/api/internal/ingest/tse-candidates', icon: Database, desc: 'Carrega a lista oficial de candidatos da eleição corrente (nome, número, cargo, partido). É a base para identificar os votos de cada BU.' },
  { key: 'secs', label: 'Ingerir seções (TSE)', url: '/api/internal/ingest/tse-sections', icon: Database, desc: 'Carrega o catálogo geográfico de seções eleitorais (UF, município, zona, seção, local e eleitorado apto). Define o universo que será auditado.' },
  { key: 'cal', label: 'Importar calendário (TSE)', url: '/api/internal/ingest/tse-calendar', icon: CalendarClock, desc: 'Importa a agenda oficial do pleito (testes, lacração, votação, totalização), derivada da data da eleição. Alimenta a página de Eventos.' },
  { key: 'bus', label: 'Ingerir BUs oficiais', url: '/api/internal/ingest/tse-bus', icon: FileCheck2, desc: 'Carrega os Boletins de Urna oficiais publicados pelo TSE — a referência contra a qual os BUs cidadãos são cruzados.' },
  { key: 'xv', label: 'Cross-validate de tudo', url: '/api/internal/cross-validate-all', icon: GitCompare, desc: 'Reexecuta o cruzamento de todas as seções: compara BUs cidadãos com o oficial, recalcula o status (verificado/divergência) e abre incidentes quando há diferença.' },
  { key: 'seed', label: 'Re-seed de demonstração', url: '/api/internal/ingest/seed', icon: RefreshCw, desc: 'Recria os dados fictícios de demonstração (candidatos A–E, seções e BUs de exemplo). Não apaga dados reais; serve para testar a plataforma.' },
]

const selectCls = 'h-9 rounded-md bg-background px-2 text-sm shadow-sm ring-1 ring-input focus:outline-none focus:ring-2 focus:ring-ring'

interface ElectionRow { id: string; year: number; round: number; status: string; electionDate: string; label: string | null; sections: number }

/** Seleciona a eleição corrente. A aplicação inteira passa a exibir apenas os dados dela; as demais eleições continuam no banco para comparação. */
function ElectionSwitcher() {
  const router = useRouter()
  const [rows, setRows] = useState<ElectionRow[] | null>(null)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      const j = (await callApi('/api/admin/elections', 'GET')) as unknown as ElectionRow[]
      setRows(Array.isArray(j) ? j : [])
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Falha.')
    }
  }, [])
  useEffect(() => { load() }, [load])

  const activate = async (r: ElectionRow) => {
    if (r.status === 'ACTIVE') return
    if (!window.confirm(`Tornar “Eleições ${r.year} — ${roundLabel(r.round)}” a eleição corrente? A plataforma passará a exibir apenas os dados dela. Nenhum dado é apagado.`)) return
    setBusy(r.id)
    try {
      await callApi('/api/admin/elections', 'POST', { id: r.id })
      toast.success('Eleição corrente atualizada.')
      await load()
      router.refresh()
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Falha.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="rounded-lg bg-card p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-semibold"><Vote className="h-4 w-4 text-primary" /> Eleição corrente</h2>
      <p className="mb-4 text-sm text-muted-foreground">A plataforma exibe os dados de uma única eleição por vez — a corrente. Ao trocar, os dados das outras eleições permanecem no banco para comparação histórica; nada é apagado. Todos os rótulos (ano e turno) se ajustam automaticamente.</p>
      {rows === null ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma eleição cadastrada. Use “Ingerir seções (TSE)” para criar o ciclo.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div>
                <p className="font-medium">Eleições {r.year} — {roundLabel(r.round)} {r.status === 'ACTIVE' && <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-verified/15 px-2 py-0.5 text-xs font-medium text-verified-foreground"><CheckCircle2 className="h-3 w-3" /> corrente</span>}</p>
                <p className="text-xs text-muted-foreground">{r.sections.toLocaleString('pt-BR')} seções · {fmtDateTime(r.electionDate)}</p>
              </div>
              {r.status === 'ACTIVE' ? (
                <span className="text-xs text-muted-foreground">Em exibição</span>
              ) : (
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => activate(r)}>{busy === r.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Vote className="mr-1 h-4 w-4" />} Tornar corrente</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function AdminPanel({ overview, incidents, events, collectors, viewerRole, viewerId }: { overview: Overview; incidents: AdminIncident[]; events: AdminEvent[]; collectors: CollectorRow[]; viewerRole: string; viewerId: string }) {
  const router = useRouter()
  const isAdmin = rankOf(viewerRole) >= 2
  const roles = assignableRoles(viewerRole)
  const [busy, setBusy] = useState('')
  const [lastResult, setLastResult] = useState('')
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const pagedCollectors = usePaged(collectors ?? [], 10)
  const pagedJobs = usePaged(jobs ?? [], 10)

  const runOp = async (key: string, url: string, body?: unknown) => {
    setBusy(key)
    try {
      const j = await callApi(url, 'POST', body ?? {})
      setLastResult(JSON.stringify(j, null, 2))
      toast.success('Operação concluída.')
      router.refresh()
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Falha.')
    } finally {
      setBusy('')
    }
  }

  const runClearDemo = async () => {
    const ok = window.confirm(
      'Remover TODOS os dados de demonstração da eleição corrente?\n\n' +
        'Serão apagados apenas os dados fictícios de teste: seções de demonstração, ' +
        'boletins, evidências, zerésimas e incidentes dessas seções, artefatos ilustrativos ' +
        '(candidatos fictícios, RDV, logs de urna, hashes de exemplo), achados de anomalia e ' +
        'substituições de urna de teste, eventos de demonstração e contas de coletores de ' +
        'demonstração.\n\n' +
        'Serão PRESERVADOS: a geografia real das seções, o calendário oficial do TSE e as contas ' +
        'administrativas reais.\n\nEsta ação não pode ser desfeita. Deseja continuar?',
    )
    if (!ok) return
    await runOp('clear-demo', '/api/internal/ingest/clear-demo')
  }

  const loadJobs = async () => {
    setBusy('jobs')
    try {
      const j = (await callApi('/api/internal/jobs', 'GET')) as { items?: Job[] }
      setJobs(j?.items ?? [])
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Falha.')
    } finally {
      setBusy('')
    }
  }

  const suspend = (c: CollectorRow) => {
    const reason = window.prompt(`Motivo da suspensão de ${c.displayName} (obrigatório, fica na auditoria):`)?.trim()
    if (!reason) return
    patchCollector(c.id, { action: 'suspend', reason }, 'Conta suspensa.')
  }

  const patchCollector = async (id: string, data: Record<string, string>, msg = 'Coletor atualizado.') => {
    try {
      await callApi(`/api/admin/collectors/${id}`, 'PATCH', data)
      toast.success(msg)
      router.refresh()
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Falha.')
    }
  }

  const stats = [
    ['BUs oficiais', overview?.officialBUs],
    ['BUs cidadãos', overview?.citizenBUs],
    ['Concordantes', overview?.concordantBUs],
    ['Seções com divergência', overview?.divergenceSections],
    ['Incidentes ativos', overview?.activeIncidents],
    ['Seções monitoradas', overview?.totalSections],
    ['Seções verificadas', overview?.verifiedSections],
    ['Cobertura cidadã (%)', overview?.coveragePct],
  ] as const

  return (
    <Tabs defaultValue="overview">
      <TabsList className="flex h-auto flex-wrap justify-start">
        <TabsTrigger value="overview"><LayoutDashboard className="mr-1 h-4 w-4" /> Visão geral</TabsTrigger>
        <TabsTrigger value="incidents"><ShieldAlert className="mr-1 h-4 w-4" /> Incidentes</TabsTrigger>
        <TabsTrigger value="verification"><BadgeCheck className="mr-1 h-4 w-4" /> Solicitações</TabsTrigger>
        {isAdmin && <TabsTrigger value="invites"><MailPlus className="mr-1 h-4 w-4" /> Convites</TabsTrigger>}
        {isAdmin && <TabsTrigger value="collectors"><Users className="mr-1 h-4 w-4" /> Equipe e coletores</TabsTrigger>}
        {isAdmin && <TabsTrigger value="audit"><ScrollText className="mr-1 h-4 w-4" /> Auditoria</TabsTrigger>}
        {isAdmin && <TabsTrigger value="events"><CalendarClock className="mr-1 h-4 w-4" /> Eventos</TabsTrigger>}
        {isAdmin && <TabsTrigger value="ops"><Cog className="mr-1 h-4 w-4" /> Ingestão e jobs</TabsTrigger>}
      </TabsList>

      <TabsContent value="overview" className="mt-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map(([l, v]) => (
            <div key={l} className="rounded-lg bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-bold tabular-nums">{v ?? 0}</p></div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Contribuintes: {overview?.contributors?.verifiedAccounts ?? 0} contas verificadas + {overview?.contributors?.visitors ?? 0} visitantes.</p>
      </TabsContent>

      <TabsContent value="incidents" className="mt-4"><IncidentsAdmin incidents={incidents ?? []} /></TabsContent>
      {isAdmin && <TabsContent value="events" className="mt-4"><EventsAdmin events={events ?? []} /></TabsContent>}

      {isAdmin && (
      <TabsContent value="ops" className="mt-4 space-y-6">
        <ElectionSwitcher />
        <div className="rounded-lg bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Ingestão e processamento</h2>
          <p className="mb-4 text-sm text-muted-foreground">Candidatos e BUs oficiais são simulados enquanto o TSE não publica os dados de {overview?.election?.year ?? 'cada eleição'}. As operações são idempotentes.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {OPS.map((o) => (
              <div key={o.key} className="flex flex-col gap-2 rounded-md border border-border/60 p-3">
                <Button variant={o.key === 'seed' ? 'outline' : 'default'} className="w-full justify-start" disabled={!!busy} onClick={() => runOp(o.key, o.url)}>
                  {busy === o.key ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <o.icon className="mr-2 h-4 w-4" />} {o.label}
                </Button>
                <p className="text-xs leading-relaxed text-muted-foreground">{o.desc}</p>
              </div>
            ))}
          </div>
          {lastResult && <pre className="mt-4 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{lastResult}</pre>}
        </div>
        <div className="rounded-lg border border-destructive/30 bg-card p-5 shadow-sm">
          <h2 className="font-semibold text-destructive">Limpar dados de demonstração</h2>
          <p className="mb-4 text-sm text-muted-foreground">Remove automaticamente apenas os dados fictícios de teste da eleição corrente, deixando o banco limpo para receber somente os dados reais. Preserva a geografia real das seções, o calendário oficial do TSE e as contas administrativas. Equivale ao inverso do Re-seed de demonstração.</p>
          <Button variant="destructive" disabled={!!busy} onClick={runClearDemo}>
            {busy === 'clear-demo' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Limpar dados de demonstração
          </Button>
        </div>
        <div className="rounded-lg bg-card p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Fila de jobs</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!!busy} onClick={loadJobs}>{busy === 'jobs' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />} Atualizar</Button>
              <Button size="sm" disabled={!!busy} onClick={async () => { await runOp('process', '/api/internal/jobs', { action: 'process' }); await loadJobs() }}><Play className="mr-1 h-4 w-4" /> Processar pendentes</Button>
            </div>
          </div>
          {jobs === null ? (
            <p className="text-sm text-muted-foreground">Clique em “Atualizar” para carregar a fila.</p>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Fila vazia.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Tipo</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Tentativas</th><th className="px-3 py-2 text-left">Criado</th><th className="px-3 py-2 text-left">Erro</th></tr></thead>
                <tbody>
                  {pagedJobs.slice.map((j) => (
                    <tr key={j.id} className="border-t border-border/50"><td className="px-3 py-2">{j.id}</td><td className="px-3 py-2">{JOB_TYPE_LABEL[j.type] ?? j.type}</td><td className="px-3 py-2">{j.status}</td><td className="px-3 py-2">{j.attempts}</td><td className="px-3 py-2 text-muted-foreground">{fmtDateTime(j.createdAt)}</td><td className="max-w-[200px] truncate px-3 py-2 text-xs text-destructive">{j.errorMessage ?? ''}</td></tr>
                  ))}
                </tbody>
              </table>
              <Paginator page={pagedJobs.page} pageCount={pagedJobs.pageCount} total={pagedJobs.total} pageSize={pagedJobs.pageSize} onPage={pagedJobs.setPage} noun="jobs" />
            </div>
          )}
        </div>
      </TabsContent>
      )}

      <TabsContent value="verification" className="mt-4"><VerificationAdmin viewerId={viewerId} /></TabsContent>
      {isAdmin && <TabsContent value="invites" className="mt-4"><InvitesAdmin viewerRole={viewerRole} /></TabsContent>}
      {isAdmin && <TabsContent value="audit" className="mt-4"><AuditAdmin /></TabsContent>}

      {isAdmin && (
      <TabsContent value="collectors" className="mt-4">
        <p className="mb-3 text-sm text-muted-foreground">Você só altera contas abaixo do seu nível. Contas são suspensas, nunca excluídas; toda alteração fica no registro de auditoria.</p>
        <div className="overflow-x-auto rounded-lg bg-card shadow-sm">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left">Conta</th><th className="px-3 py-2 text-left">E-mail</th><th className="px-3 py-2 text-left">Evidências</th><th className="px-3 py-2 text-left">Papel</th><th className="px-3 py-2 text-left">Verificação</th><th className="px-3 py-2 text-left">Desde</th><th className="px-3 py-2 text-left">Situação</th></tr></thead>
            <tbody>
              {pagedCollectors.slice.map((c) => {
                const editable = c.id !== viewerId && canActOn(viewerRole, c.role)
                const roleOptions = roles.includes(c.role as never) ? roles : [c.role, ...roles]
                return (
                <tr key={c.id} className={`border-t border-border/50 ${c.suspendedAt ? 'opacity-60' : ''}`}>
                  <td className="px-3 py-2"><p className="font-medium">{c.displayName}</p>{c.organization && <p className="text-xs text-muted-foreground">{c.organization}</p>}</td>
                  <td className="px-3 py-2 text-muted-foreground"><span suppressHydrationWarning>{c.email}</span></td>
                  <td className="px-3 py-2 tabular-nums">{c.evidences}</td>
                  <td className="px-3 py-2">
                    {editable ? (
                      <select aria-label="Papel" className={selectCls} defaultValue={c.role} onChange={(e) => patchCollector(c.id, { role: e.target.value })}>
                        {roleOptions.map((v) => <option key={v} value={v}>{ROLE_LABEL[v] ?? v}</option>)}
                      </select>
                    ) : (
                      <span>{ROLE_LABEL[c.role] ?? c.role}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <select aria-label="Nível de verificação" className={selectCls} defaultValue={c.verificationLevel} disabled={!editable} onChange={(e) => patchCollector(c.id, { verificationLevel: e.target.value })}>
                      {Object.entries(VERIFICATION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDateTime(c.createdAt)}</td>
                  <td className="px-3 py-2">
                    {c.suspendedAt ? (
                      <div className="space-y-1">
                        <p className="text-xs text-amber-600" title={c.suspendedReason ?? ''}>Suspensa em {fmtDateTime(c.suspendedAt)}</p>
                        {editable && <Button size="sm" variant="outline" onClick={() => patchCollector(c.id, { action: 'reactivate' }, 'Conta reativada.')}><RotateCcw className="mr-1 h-4 w-4" /> Reativar</Button>}
                      </div>
                    ) : editable ? (
                      <Button size="sm" variant="outline" onClick={() => suspend(c)}><Ban className="mr-1 h-4 w-4" /> Suspender</Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Ativa</span>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Paginator page={pagedCollectors.page} pageCount={pagedCollectors.pageCount} total={pagedCollectors.total} pageSize={pagedCollectors.pageSize} onPage={pagedCollectors.setPage} noun="contas" />
      </TabsContent>
      )}
    </Tabs>
  )
}
