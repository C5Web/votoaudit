'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeCheck, FileUp, Loader2, MailCheck, MailWarning, Send, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RoleFields, nativeSelectCls } from '@/components/verification/role-fields'
import { CREDENTIAL_ROLES, IDENTITY_FORM, validateRoleFields } from '@/lib/roles'
import { ROLE_LABEL } from '@/lib/constants'
import { VERIFICATION_ACCEPT, submitVerificationRequest, uploadVerificationDoc } from '@/lib/verification-client'
import { SafeDate } from '@/components/safe-format'
import { cn } from '@/lib/utils'

export interface MyRequest {
  id: string
  kind: 'IDENTITY' | 'CREDENTIAL'
  requestedRole: string | null
  organization: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  decisionReason: string | null
  createdAt: string
  reviewedAt: string | null
}

const STATUS: Record<string, { l: string; cls: string }> = {
  PENDING: { l: 'Em análise', cls: 'bg-divergence/15 text-divergence-foreground' },
  APPROVED: { l: 'Aprovada', cls: 'bg-verified/15 text-verified-foreground' },
  REJECTED: { l: 'Recusada', cls: 'bg-destructive/10 text-destructive' },
  CANCELLED: { l: 'Cancelada', cls: 'bg-muted text-muted-foreground' },
}

function FilePick({ id, label, hint, file, onFile }: { id: string; label: string; hint: string; file: File | null; onFile: (f: File | null) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <label htmlFor={id} className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-input bg-background px-3 py-3 text-sm hover:bg-muted">
        <FileUp className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{file ? file.name : 'Escolher foto ou PDF'}</span>
      </label>
      <input id={id} type="file" accept={VERIFICATION_ACCEPT} className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

export function VerificationPanel({
  emailVerified,
  verificationLevel,
  role,
  isStaff,
  uf,
  requests,
}: {
  emailVerified: boolean
  verificationLevel: string
  role: string
  isStaff: boolean
  uf: string | null
  requests: MyRequest[]
}) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState('')
  const [idName, setIdName] = useState('')
  const [idDocs, setIdDocs] = useState<Record<string, File | null>>({})
  const [credRole, setCredRole] = useState('')
  const [credValues, setCredValues] = useState<Record<string, string>>({})
  const [credFile, setCredFile] = useState<File | null>(null)

  const pendingIdentity = requests.some((r) => r.kind === 'IDENTITY' && r.status === 'PENDING')
  const pendingCredential = requests.some((r) => r.kind === 'CREDENTIAL' && r.status === 'PENDING')
  const identityDone = verificationLevel === 'IDENTITY_VERIFIED' || verificationLevel === 'CREDENTIAL_VERIFIED'

  const resend = async () => {
    setSending(true)
    try {
      const r = await fetch('/api/auth/verify-email/send', { method: 'POST' })
      const j = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) throw new Error(j?.error ?? 'Falha ao enviar.')
      toast.success('Enviamos um novo link de confirmação para o seu e-mail.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao enviar.')
    } finally {
      setSending(false)
    }
  }

  const sendIdentity = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!idName.trim()) return toast.error('Informe o nome completo.')
    for (const d of IDENTITY_FORM.documents) if (!idDocs[d.key]) return toast.error(`Envie: ${d.label}.`)
    setBusy('identity')
    try {
      const docs = []
      for (const d of IDENTITY_FORM.documents) docs.push(await uploadVerificationDoc(idDocs[d.key] as File, d.key))
      await submitVerificationRequest({ kind: 'IDENTITY', fields: { fullName: idName.trim() }, documents: docs })
      toast.success('Solicitação enviada para análise.')
      setIdDocs({})
      setIdName('')
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar.')
    } finally {
      setBusy('')
    }
  }

  const sendCredential = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = validateRoleFields(credRole, credValues)
    if (v.error) return toast.error(v.error)
    if (!credFile) return toast.error('Envie o documento de comprovação.')
    setBusy('credential')
    try {
      const doc = await uploadVerificationDoc(credFile, 'credential')
      await submitVerificationRequest({ kind: 'CREDENTIAL', requestedRole: credRole, uf: uf ?? undefined, fields: credValues, documents: [doc] })
      toast.success('Solicitação de credencial enviada.')
      setCredRole('')
      setCredValues({})
      setCredFile(null)
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Falha ao enviar.')
    } finally {
      setBusy('')
    }
  }

  const cancel = async (id: string) => {
    setBusy(id)
    try {
      const r = await fetch(`/api/verification/requests/${id}`, { method: 'DELETE' })
      const j = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) throw new Error(j?.error ?? 'Falha ao cancelar.')
      toast.success('Solicitação cancelada e documentos apagados.')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao cancelar.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="space-y-3 rounded-lg bg-card p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold"><MailCheck className="h-5 w-5 text-primary" /> E-mail</h2>
        {emailVerified ? (
          <p className="flex items-center gap-2 text-sm text-verified-foreground"><BadgeCheck className="h-4 w-4 text-verified" /> E-mail confirmado.</p>
        ) : (
          <>
            <p className="flex items-start gap-2 text-sm"><MailWarning className="mt-0.5 h-4 w-4 shrink-0 text-divergence" /> Seu e-mail ainda não foi confirmado. Abra o link que enviamos.</p>
            <Button variant="outline" size="sm" onClick={resend} disabled={sending}>{sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Reenviar confirmação</Button>
          </>
        )}
        <h3 className="pt-3 font-semibold">Minhas solicitações</h3>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma solicitação enviada.</p>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="rounded-md bg-muted/50 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{r.kind === 'IDENTITY' ? 'Identidade' : ROLE_LABEL[r.requestedRole ?? ''] ?? 'Credencial'}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS[r.status]?.cls)}>{STATUS[r.status]?.l ?? r.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Enviada em <SafeDate date={r.createdAt} options={{ dateStyle: 'short' }} />{r.organization ? ` · ${r.organization}` : ''}</p>
                {r.decisionReason && <p className="mt-1 text-xs">Motivo: {r.decisionReason}</p>}
                {r.status === 'PENDING' && (
                  <Button variant="ghost" size="sm" className="mt-1 h-7 px-2 text-xs" onClick={() => cancel(r.id)} disabled={busy === r.id}><X className="mr-1 h-3 w-3" /> Cancelar</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-lg bg-card p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-primary" /> Verificar identidade</h2>
        {identityDone ? (
          <p className="flex items-center gap-2 text-sm"><BadgeCheck className="h-4 w-4 text-verified" /> Identidade verificada.</p>
        ) : pendingIdentity ? (
          <p className="text-sm text-muted-foreground">Sua solicitação está em análise pela equipe.</p>
        ) : (
          <form onSubmit={sendIdentity} className="space-y-3">
            <p className="text-xs text-muted-foreground">Evidências de contas com identidade verificada têm mais peso. Os arquivos são privados e apagados 30 dias após a decisão. Não pedimos CPF.</p>
            <div className="space-y-1.5"><Label htmlFor="id-name">Nome completo (como no documento)</Label><Input id="id-name" value={idName} onChange={(e) => setIdName(e.target.value)} maxLength={120} /></div>
            {IDENTITY_FORM.documents.map((d) => (
              <FilePick key={d.key} id={`id-${d.key}`} label={d.label} hint={d.hint} file={idDocs[d.key] ?? null} onFile={(f) => setIdDocs((s) => ({ ...s, [d.key]: f }))} />
            ))}
            <Button type="submit" className="w-full" disabled={busy === 'identity'}>{busy === 'identity' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Enviar para análise</Button>
          </form>
        )}
      </section>

      <section className="space-y-3 rounded-lg bg-card p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-semibold"><BadgeCheck className="h-5 w-5 text-primary" /> Papel institucional</h2>
        <p className="text-sm">Papel atual: <strong>{ROLE_LABEL[role] ?? role}</strong></p>
        {isStaff ? (
          <p className="text-sm text-muted-foreground">Contas da equipe são gerenciadas pelo painel administrativo.</p>
        ) : pendingCredential ? (
          <p className="text-sm text-muted-foreground">Sua credencial está em análise. Enquanto isso, você coleta como cidadão.</p>
        ) : (
          <form onSubmit={sendCredential} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cred-role">Quero atuar como…</Label>
              <select id="cred-role" className={nativeSelectCls} value={credRole} onChange={(e) => { setCredRole(e.target.value); setCredValues({}); setCredFile(null) }}>
                <option value="">Selecione…</option>
                {CREDENTIAL_ROLES.filter((r) => r !== role).map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
              </select>
            </div>
            {credRole && (
              <>
                <RoleFields role={credRole} values={credValues} onChange={setCredValues} file={credFile} onFile={setCredFile} idPrefix="cred" />
                <Button type="submit" className="w-full" disabled={busy === 'credential'}>{busy === 'credential' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Solicitar credencial</Button>
              </>
            )}
          </form>
        )}
      </section>
    </div>
  )
}
