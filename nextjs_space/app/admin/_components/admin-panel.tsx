'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutDashboard, ShieldAlert, CalendarClock, Users, Cog, Loader2, Database, GitCompare, RefreshCw, Play, FileCheck2, BadgeCheck, MailPlus, ScrollText, Ban, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ROLE_LABEL, VERIFICATION_LABEL, JOB_TYPE_LABEL } from '@/lib/constants'
import { fmtDateTime } from '@/lib/format'
import { assignableRoles, canActOn, rankOf } from '@/lib/roles'
import { IncidentsAdmin, EventsAdmin, callApi, type AdminIncident, type AdminEvent } from './admin-sections'
import { VerificationAdmin, InvitesAdmin, AuditAdmin } from './admin-staff'

interface Overview {
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
  { key: 'cand', label: 'Ingerir candidatos (TSE)', url: '/api/internal/ingest/tse-candidates', icon: Database },
  { key: 'secs', label: 'Ingerir seções (TSE)', url: '/api/internal/ingest/tse-sections', icon: Database },
  { key: 'cal', label: 'Importar calendário (TSE)', url: '/api/internal/ingest/tse-calendar', icon: CalendarClock },
  { key: 'bus', label: 'Ingerir BUs oficiais', url: '/api/internal/ingest/tse-bus', icon: FileCheck2 },
  { key: 'xv', label: 'Cross-validate de tudo', url: '/api/internal/cross-validate-all', icon: GitCompare },
  { key: 'seed', label: 'Re-seed de demonstração', url: '/api/internal/ingest/seed', icon: RefreshCw },
]

const selectCls = 'h-9 rounded-md bg-background px-2 text-sm shadow-sm ring-1 ring-input focus:outline-none focus:ring-2 focus:ring-ring'

export function AdminPanel({ overview, incidents, events, collectors, viewerRole, viewerId }: { overview: Overview; incidents: AdminIncident[]; events: AdminEvent[]; collectors: CollectorRow[]; viewerRole: string; viewerId: string }) {
  const router = useRouter()
  const isAdmin = rankOf(viewerRole) >= 2
  const roles = assignableRoles(viewerRole)
  const [busy, setBusy] = useState('')
  const [lastResult, setLastResult] = useState('')
  const [jobs, setJobs] = useState<Job[] | null>(null)

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
        <div className="rounded-lg bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Ingestão e processamento</h2>
          <p className="mb-4 text-sm text-muted-foreground">Candidatos e BUs oficiais são simulados enquanto o TSE não publica os dados de 2026. As operações são idempotentes.</p>
          <div className="flex flex-wrap gap-3">
            {OPS.map((o) => (
              <Button key={o.key} variant={o.key === 'seed' ? 'outline' : 'default'} disabled={!!busy} onClick={() => runOp(o.key, o.url)}>
                {busy === o.key ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <o.icon className="mr-2 h-4 w-4" />} {o.label}
              </Button>
            ))}
          </div>
          {lastResult && <pre className="mt-4 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{lastResult}</pre>}
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
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-t border-border/50"><td className="px-3 py-2">{j.id}</td><td className="px-3 py-2">{JOB_TYPE_LABEL[j.type] ?? j.type}</td><td className="px-3 py-2">{j.status}</td><td className="px-3 py-2">{j.attempts}</td><td className="px-3 py-2 text-muted-foreground">{fmtDateTime(j.createdAt)}</td><td className="max-w-[200px] truncate px-3 py-2 text-xs text-destructive">{j.errorMessage ?? ''}</td></tr>
                  ))}
                </tbody>
              </table>
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
              {(collectors ?? []).map((c) => {
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
      </TabsContent>
      )}
    </Tabs>
  )
}
