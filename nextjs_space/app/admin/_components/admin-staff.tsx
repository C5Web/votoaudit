'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Eye, Check, X, Copy, Plus, Ban, ShieldCheck, ShieldAlert, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ROLE_LABEL, VERIFICATION_LABEL } from '@/lib/constants'
import { assignableRoles } from '@/lib/roles'
import { fmtDateTime } from '@/lib/format'
import { callApi } from './admin-sections'

const selectCls = 'h-9 rounded-md bg-background px-2 text-sm shadow-sm ring-1 ring-input focus:outline-none focus:ring-2 focus:ring-ring'
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Falha.')
const card = 'rounded-lg bg-card p-4 shadow-sm'

interface QueueItem {
  id: string
  kind: 'IDENTITY' | 'CREDENTIAL'
  status: string
  requestedRoleLabel: string | null
  fullName: string | null
  organization: string | null
  uf: string | null
  details: Record<string, string>
  fieldLabels: Record<string, string>
  documents: { key: string; contentType: string; name: string | null }[]
  documentsPurged: boolean
  howToVerify: string
  officialSource: { label: string; url: string } | null
  emailHint: { tone: string; text: string } | null
  decisionReason: string | null
  reviewedAt: string | null
  reviewedBy: string | null
  createdAt: string
  collector: { id: string; displayName: string; role: string; verificationLevel: string; uf: string | null; email: string; emailVerified: boolean }
}

const DOC_LABEL: Record<string, string> = { document: 'Documento com foto', selfie: 'Selfie com documento', credential: 'Credencial' }
const STATUS_LABEL: Record<string, string> = { PENDING: 'Pendente', APPROVED: 'Aprovada', REJECTED: 'Recusada', CANCELLED: 'Cancelada' }

export function VerificationAdmin({ viewerId }: { viewerId: string }) {
  const [status, setStatus] = useState<'PENDING' | 'DECIDED'>('PENDING')
  const [items, setItems] = useState<QueueItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [decide, setDecide] = useState<{ item: QueueItem; decision: 'APPROVE' | 'REJECT' } | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (s: 'PENDING' | 'DECIDED') => {
    setLoading(true)
    try {
      const j = (await callApi(`/api/admin/verification?status=${s}`, 'GET')) as unknown as QueueItem[]
      setItems(Array.isArray(j) ? j : [])
    } catch (e) {
      console.error(e)
      toast.error(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(status) }, [status, load])

  const viewDoc = async (id: string, i: number) => {
    try {
      const j = (await callApi(`/api/admin/verification/${id}/document?i=${i}`, 'GET')) as { url?: string }
      if (j?.url) window.open(j.url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      console.error(e)
      toast.error(errMsg(e))
    }
  }

  const submit = async () => {
    if (!decide) return
    if (decide.decision === 'REJECT' && reason.trim().length < 5) {
      toast.error('Informe o motivo da recusa.')
      return
    }
    setSaving(true)
    try {
      await callApi(`/api/admin/verification/${decide.item.id}`, 'POST', { decision: decide.decision, reason: reason.trim() })
      toast.success(decide.decision === 'APPROVE' ? 'Solicitação aprovada.' : 'Solicitação recusada.')
      setDecide(null)
      setReason('')
      await load(status)
    } catch (e) {
      console.error(e)
      toast.error(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button size="sm" variant={status === 'PENDING' ? 'default' : 'outline'} onClick={() => setStatus('PENDING')}>Pendentes</Button>
          <Button size="sm" variant={status === 'DECIDED' ? 'default' : 'outline'} onClick={() => setStatus('DECIDED')}>Decididas</Button>
        </div>
        <Button size="sm" variant="outline" disabled={loading} onClick={() => load(status)}>{loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />} Atualizar</Button>
      </div>
      <p className="text-xs text-muted-foreground">Documentos abrem por links de 5 minutos e cada visualização fica registrada na auditoria. Eles são apagados 30 dias após a decisão (LGPD).</p>
      {items === null ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : items.length === 0 ? (
        <p className={`${card} text-sm text-muted-foreground`}>Nenhuma solicitação {status === 'PENDING' ? 'pendente' : 'decidida'}.</p>
      ) : (
        items.map((r) => {
          const own = r.collector.id === viewerId
          return (
            <div key={r.id} className={`${card} space-y-3`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{r.kind === 'IDENTITY' ? 'Verificação de identidade' : `Credencial: ${r.requestedRoleLabel ?? ''}`}</p>
                  <p className="text-sm text-muted-foreground">{r.collector.displayName} · <span suppressHydrationWarning>{r.collector.email}</span>{r.collector.emailVerified ? ' (e-mail confirmado)' : ' (e-mail não confirmado)'}</p>
                  <p className="text-xs text-muted-foreground">Enviada em {fmtDateTime(r.createdAt)} · atual: {ROLE_LABEL[r.collector.role] ?? r.collector.role}, {VERIFICATION_LABEL[r.collector.verificationLevel] ?? r.collector.verificationLevel}</p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{STATUS_LABEL[r.status] ?? r.status}</span>
              </div>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {r.fullName && <div><dt className="inline text-muted-foreground">Nome: </dt><dd className="inline">{r.fullName}</dd></div>}
                {r.organization && <div><dt className="inline text-muted-foreground">Organização: </dt><dd className="inline">{r.organization}</dd></div>}
                {r.uf && <div><dt className="inline text-muted-foreground">UF: </dt><dd className="inline">{r.uf}</dd></div>}
                {Object.entries(r.details ?? {}).filter(([k]) => k !== 'fullName').map(([k, v]) => (
                  <div key={k}><dt className="inline text-muted-foreground">{r.fieldLabels?.[k] ?? k}: </dt><dd className="inline">{v}</dd></div>
                ))}
              </dl>
              {r.emailHint && (
                <p className={`text-xs ${r.emailHint.tone === 'match' ? 'text-emerald-600' : r.emailHint.tone === 'generic' ? 'text-amber-600' : 'text-muted-foreground'}`}>{r.emailHint.text} (indício, nunca aprova sozinho)</p>
              )}
              {r.howToVerify && <p className="rounded-md bg-muted/50 p-3 text-sm"><strong>Como conferir:</strong> {r.howToVerify}{r.officialSource && <> <a href={r.officialSource.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline">{r.officialSource.label} <ExternalLink className="h-3 w-3" /></a></>}</p>}
              <div className="flex flex-wrap gap-2">
                {r.documentsPurged ? (
                  <p className="text-xs text-muted-foreground">Documentos apagados após o prazo de retenção.</p>
                ) : (
                  r.documents.map((d, i) => (
                    <Button key={`${d.key}-${i}`} size="sm" variant="outline" disabled={own} onClick={() => viewDoc(r.id, i)}><Eye className="mr-1 h-4 w-4" /> {DOC_LABEL[d.key] ?? d.name ?? `Documento ${i + 1}`}</Button>
                  ))
                )}
              </div>
              {r.status === 'PENDING' ? (
                own ? (
                  <p className="text-xs text-amber-600">Esta é a sua própria solicitação: outra pessoa da equipe precisa analisá-la.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => { setReason(''); setDecide({ item: r, decision: 'APPROVE' }) }}><Check className="mr-1 h-4 w-4" /> Aprovar</Button>
                    <Button size="sm" variant="outline" onClick={() => { setReason(''); setDecide({ item: r, decision: 'REJECT' }) }}><X className="mr-1 h-4 w-4" /> Recusar</Button>
                  </div>
                )
              ) : (
                <p className="text-sm text-muted-foreground">Decidida por {r.reviewedBy ?? '—'}{r.reviewedAt ? ` em ${fmtDateTime(r.reviewedAt)}` : ''}{r.decisionReason ? ` · Motivo: ${r.decisionReason}` : ''}</p>
              )}
            </div>
          )
        })
      )}

      <Dialog open={!!decide} onOpenChange={(o) => { if (!o) setDecide(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decide?.decision === 'APPROVE' ? 'Aprovar solicitação' : 'Recusar solicitação'}</DialogTitle>
            <DialogDescription>{decide?.decision === 'APPROVE' ? 'O nível de verificação (e a credencial, se for o caso) será atualizado e a pessoa receberá um e-mail.' : 'O motivo é obrigatório e será enviado por e-mail à pessoa.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="vreason">Motivo {decide?.decision === 'APPROVE' ? '(opcional)' : ''}</Label>
            <Textarea id="vreason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={decide?.decision === 'REJECT' ? 'Ex.: a selfie não mostra o documento de forma legível.' : ''} />
          </div>
          <Button onClick={submit} disabled={saving} className="w-full">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirmar</Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface InviteRow { id: string; email: string; role: string; organization: string | null; createdBy: string | null; createdAt: string; expiresAt: string; status: string }
const INVITE_STATUS: Record<string, string> = { ACTIVE: 'Ativo', USED: 'Usado', REVOKED: 'Revogado', EXPIRED: 'Expirado' }

export function InvitesAdmin({ viewerRole }: { viewerRole: string }) {
  const [rows, setRows] = useState<InviteRow[] | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ email: '', role: 'MODERATOR', organization: '' })
  const [saving, setSaving] = useState(false)
  const [link, setLink] = useState('')
  const roles = assignableRoles(viewerRole)

  const load = useCallback(async () => {
    try {
      const j = (await callApi('/api/admin/invites', 'GET')) as unknown as InviteRow[]
      setRows(Array.isArray(j) ? j : [])
    } catch (e) {
      console.error(e)
      toast.error(errMsg(e))
    }
  }, [])
  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!form.email.includes('@')) {
      toast.error('Informe um e-mail válido.')
      return
    }
    setSaving(true)
    try {
      const j = (await callApi('/api/admin/invites', 'POST', { email: form.email.trim(), role: form.role, organization: form.organization.trim() || undefined })) as { link?: string; emailSent?: boolean }
      setLink(j?.link ?? '')
      toast.success(j?.emailSent ? 'Convite criado e enviado por e-mail.' : 'Convite criado. O e-mail não foi enviado: copie o link.')
      await load()
    } catch (e) {
      console.error(e)
      toast.error(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  const revoke = async (id: string) => {
    try {
      await callApi(`/api/admin/invites/${id}`, 'DELETE')
      toast.success('Convite revogado.')
      await load()
    } catch (e) {
      console.error(e)
      toast.error(errMsg(e))
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link copiado.')
    } catch (e) {
      console.error(e)
      toast.error('Não foi possível copiar. Selecione o link manualmente.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Convites valem por 48 horas e só podem ser usados uma vez. Um novo convite para o mesmo e-mail revoga os anteriores.</p>
        <Button onClick={() => { setLink(''); setForm({ email: '', role: roles.includes('MODERATOR') ? 'MODERATOR' : roles[0] ?? 'CITIZEN', organization: '' }); setOpen(true) }}><Plus className="mr-1 h-4 w-4" /> Novo convite</Button>
      </div>
      <div className="overflow-x-auto rounded-lg bg-card shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left">E-mail</th><th className="px-3 py-2 text-left">Papel</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Expira</th><th className="px-3 py-2 text-left">Criado por</th><th className="px-3 py-2" /></tr></thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={6} className="px-3 py-4 text-muted-foreground">Carregando…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-4 text-muted-foreground">Nenhum convite.</td></tr>
            ) : rows.map((i) => (
              <tr key={i.id} className="border-t border-border/50">
                <td className="px-3 py-2"><span suppressHydrationWarning>{i.email}</span>{i.organization && <p className="text-xs text-muted-foreground">{i.organization}</p>}</td>
                <td className="px-3 py-2">{ROLE_LABEL[i.role] ?? i.role}</td>
                <td className="px-3 py-2">{INVITE_STATUS[i.status] ?? i.status}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmtDateTime(i.expiresAt)}</td>
                <td className="px-3 py-2 text-muted-foreground">{i.createdBy ?? '—'}</td>
                <td className="px-3 py-2 text-right">{i.status === 'ACTIVE' && <Button size="sm" variant="outline" onClick={() => revoke(i.id)}><Ban className="mr-1 h-4 w-4" /> Revogar</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo convite</DialogTitle>
            <DialogDescription>A pessoa recebe um link de uso único para criar a conta (ou atualizar a existente) já com o papel escolhido.</DialogDescription>
          </DialogHeader>
          {link ? (
            <div className="space-y-3">
              <p className="text-sm">Link do convite (não será exibido de novo):</p>
              <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              <Button onClick={copy} className="w-full"><Copy className="mr-2 h-4 w-4" /> Copiar link</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5"><Label htmlFor="iemail">E-mail</Label><Input id="iemail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="irole">Papel</Label><select id="irole" className={`${selectCls} w-full`} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}</select></div>
              <div className="space-y-1.5"><Label htmlFor="iorg">Organização (opcional)</Label><Input id="iorg" value={form.organization} maxLength={120} onChange={(e) => setForm({ ...form, organization: e.target.value })} /></div>
              <Button onClick={create} disabled={saving} className="w-full">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar convite</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface AuditRow { id: number; createdAt: string; actorEmail: string | null; actorRole: string | null; action: string; targetType: string | null; targetId: string | null; details: unknown; hash: string }

export function AuditAdmin() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [next, setNext] = useState<number | null>(null)
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [check, setCheck] = useState<{ ok: boolean; checked: number; brokenAtId: number | null; reason: string | null } | null>(null)

  const load = useCallback(async (before: number | null, action: string) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (before) qs.set('before', String(before))
      if (action) qs.set('action', action)
      const j = (await callApi(`/api/admin/audit?${qs.toString()}`, 'GET')) as { rows?: AuditRow[]; nextBefore?: number | null }
      setRows((prev) => (before ? [...prev, ...(j?.rows ?? [])] : j?.rows ?? []))
      setNext(j?.nextBefore ?? null)
    } catch (e) {
      console.error(e)
      toast.error(errMsg(e))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load(null, '') }, [load])

  const verify = async () => {
    try {
      const j = (await callApi('/api/admin/audit/verify', 'GET')) as unknown as { ok: boolean; checked: number; brokenAtId: number | null; reason: string | null }
      setCheck(j)
    } catch (e) {
      console.error(e)
      toast.error(errMsg(e))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); load(null, filter.trim()) }}>
          <Input aria-label="Filtrar por ação" placeholder="Filtrar por ação (ex.: verification, collector.)" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-72" />
          <Button type="submit" variant="outline" disabled={loading}>Filtrar</Button>
        </form>
        <Button onClick={verify}><ShieldCheck className="mr-1 h-4 w-4" /> Verificar cadeia</Button>
      </div>
      {check && (
        <p className={`flex items-center gap-2 rounded-md p-3 text-sm ${check.ok ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'}`}>
          {check.ok ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
          {check.ok ? `Cadeia íntegra: ${check.checked} registros conferidos.` : `Cadeia inconsistente no registro #${check.brokenAtId}: ${check.reason ?? ''}`}
        </p>
      )}
      <div className="overflow-x-auto rounded-lg bg-card shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Quando</th><th className="px-3 py-2 text-left">Quem</th><th className="px-3 py-2 text-left">Ação</th><th className="px-3 py-2 text-left">Alvo</th><th className="px-3 py-2 text-left">Detalhes</th></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-4 text-muted-foreground">{loading ? 'Carregando…' : 'Nenhum registro.'}</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-border/50 align-top">
                <td className="px-3 py-2 tabular-nums">{r.id}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmtDateTime(r.createdAt)}</td>
                <td className="px-3 py-2"><span suppressHydrationWarning>{r.actorEmail ?? '—'}</span><p className="text-xs text-muted-foreground">{ROLE_LABEL[r.actorRole ?? ''] ?? r.actorRole ?? ''}</p></td>
                <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.targetType ? `${r.targetType} ${r.targetId ?? ''}` : '—'}</td>
                <td className="max-w-[280px] px-3 py-2"><code className="block truncate text-xs text-muted-foreground" title={r.details ? JSON.stringify(r.details) : ''}>{r.details ? JSON.stringify(r.details) : ''}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {next && <Button variant="outline" disabled={loading} onClick={() => load(next, filter.trim())}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Carregar mais</Button>}
    </div>
  )
}
