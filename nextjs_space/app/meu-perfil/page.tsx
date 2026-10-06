import Link from 'next/link'
import { redirect } from 'next/navigation'
import { User, Mail, BadgeCheck, Send, CheckCircle2, XCircle, History, Camera } from 'lucide-react'
import { Container } from '@/components/layouts/container'
import { Button } from '@/components/ui/button'
import { getCurrentCollector } from '@/lib/authz'
import { prisma } from '@/lib/db'
import { ROLE_LABEL, VERIFICATION_LABEL, EVIDENCE_TYPE_LABEL, EVIDENCE_STATUS_LABEL } from '@/lib/constants'
import { fmtDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ProfileForm } from './_components/profile-form'
import { VerificationPanel, type MyRequest } from './_components/verification-panel'
import { listMyRequests } from '@/lib/verification'
import { isStaffRole } from '@/lib/roles'

const FLASH: Record<string, { text: string; tone: 'ok' | 'warn' }> = {
  'email:ok': { text: 'E-mail confirmado. Obrigado!', tone: 'ok' },
  'email:invalido': { text: 'Link de confirmação inválido ou expirado. Peça um novo abaixo.', tone: 'warn' },
  'cadastro:ok': { text: 'Conta criada. Enviamos um link de confirmação para o seu e-mail.', tone: 'ok' },
  'pedido:ok': { text: 'Sua solicitação de credencial foi enviada. Enquanto ela é analisada, você já pode coletar como cidadão.', tone: 'ok' },
  'pedido:erro': { text: 'A conta foi criada, mas o envio do documento falhou. Envie novamente na seção “Papel institucional”.', tone: 'warn' },
}

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Meu perfil — VotoAudit' }

const ST_CLS: Record<string, string> = {
  VALIDATED: 'bg-verified/15 text-verified-foreground',
  REJECTED: 'bg-destructive/10 text-destructive',
  NEEDS_REVIEW: 'bg-divergence/15 text-divergence-foreground',
}

export default async function MeuPerfilPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await getCurrentCollector()
  if (!ctx) redirect('/login?callbackUrl=/meu-perfil')
  const c = ctx.collector
  const sp = await searchParams
  const flashes = ['email', 'cadastro', 'pedido'].map((k) => FLASH[`${k}:${sp?.[k]}`]).filter(Boolean)
  const requests = (await listMyRequests(c.id)).map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
  })) as MyRequest[]
  const evidences = await prisma.evidence.findMany({
    where: { collectorId: c.id },
    orderBy: { receivedAt: 'desc' },
    take: 50,
    select: { id: true, type: true, validationStatus: true, receivedAt: true, corroborationCount: true, sectionId: true, section: { select: { uf: true, zone: true, section: true, municipality: true } } },
  })
  const [submitted, corroborated, rejected] = await Promise.all([
    prisma.evidence.count({ where: { collectorId: c.id } }),
    prisma.evidence.count({ where: { collectorId: c.id, validationStatus: 'VALIDATED' } }),
    prisma.evidence.count({ where: { collectorId: c.id, validationStatus: 'REJECTED' } }),
  ])

  return (
    <Container className="space-y-6 py-10">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold tracking-tight"><User className="h-7 w-7 text-primary" /> Meu perfil</h1>
          <p className="mt-1 text-muted-foreground">Seus dados de coletor e o histórico das evidências enviadas. Nada disso é exibido publicamente.</p>
        </div>
        <Button asChild><Link href="/coletar"><Camera className="mr-2 h-4 w-4" /> Nova coleta</Link></Button>
      </div>

      {flashes.map((f) => (
        <p key={f.text} role="status" className={cn('rounded-md px-4 py-3 text-sm', f.tone === 'ok' ? 'bg-verified/15 text-verified-foreground' : 'bg-divergence/15 text-divergence-foreground')}>{f.text}</p>
      ))}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-3 rounded-lg bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Identificação</h2>
          <p className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-muted-foreground" /> {c.displayName}</p>
          <p className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /> <span suppressHydrationWarning>{ctx.session?.user?.email ?? '—'}</span></p>
          <p className="flex items-center gap-2 text-sm"><BadgeCheck className="h-4 w-4 text-muted-foreground" /> {VERIFICATION_LABEL[c.verificationLevel] ?? c.verificationLevel} · {ROLE_LABEL[c.role] ?? c.role}</p>
          {c.organization && <p className="text-sm text-muted-foreground">{c.organization}</p>}
          {c.uf && <p className="text-sm text-muted-foreground">UF: {c.uf}</p>}
        </section>
        <section className="grid grid-cols-3 gap-3 lg:col-span-2">
          {[
            { l: 'Enviadas', v: submitted, icon: Send, cls: 'text-primary' },
            { l: 'Corroboradas', v: corroborated, icon: CheckCircle2, cls: 'text-verified' },
            { l: 'Rejeitadas', v: rejected, icon: XCircle, cls: 'text-destructive' },
          ].map((s) => (
            <div key={s.l} className="rounded-lg bg-card p-5 shadow-sm">
              <s.icon className={cn('h-5 w-5', s.cls)} />
              <p className="mt-2 font-display text-3xl font-bold tabular-nums">{s.v}</p>
              <p className="text-xs text-muted-foreground">{s.l}</p>
            </div>
          ))}
        </section>
      </div>

      <VerificationPanel
        emailVerified={ctx.emailVerified}
        verificationLevel={c.verificationLevel}
        role={c.role}
        isStaff={isStaffRole(c.role)}
        uf={c.uf}
        requests={requests}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg bg-card p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><History className="h-5 w-5 text-primary" /> Histórico de coletas</h2>
          {evidences.length === 0 ? (
            <p className="text-sm text-muted-foreground">Você ainda não enviou evidências.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr><th className="px-3 py-2 text-left font-medium">Data</th><th className="px-3 py-2 text-left font-medium">Tipo</th><th className="px-3 py-2 text-left font-medium">Seção</th><th className="px-3 py-2 text-left font-medium">Status</th></tr>
                </thead>
                <tbody>
                  {evidences.map((e) => (
                    <tr key={e.id} className="border-t border-border/50">
                      <td className="px-3 py-2 text-muted-foreground">{fmtDateTime(e.receivedAt)}</td>
                      <td className="px-3 py-2">{EVIDENCE_TYPE_LABEL[e.type] ?? e.type}</td>
                      <td className="px-3 py-2">{e.section ? <Link className="text-primary hover:underline" href={`/secoes/${e.sectionId}`}>{e.section.uf} Z{e.section.zone}/S{e.section.section}</Link> : '—'}</td>
                      <td className="px-3 py-2"><span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', ST_CLS[e.validationStatus] ?? 'bg-muted text-muted-foreground')}>{EVIDENCE_STATUS_LABEL[e.validationStatus] ?? e.validationStatus}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="rounded-lg bg-card p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Configurações</h2>
          <ProfileForm displayName={c.displayName} organization={c.organization ?? ''} organizationLocked={c.credentialStatus === 'ACTIVE'} />
        </section>
      </div>
    </Container>
  )
}
