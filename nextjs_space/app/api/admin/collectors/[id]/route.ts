import type { CollectorRole, CredentialStatus, VerificationLevel } from '@prisma/client'
import { adminHandle } from '@/lib/admin-guard'
import { actorOf } from '@/lib/authz'
import { appendAudit } from '@/lib/audit-log'
import { prisma } from '@/lib/db'
import { assignableRoles, canActOn, rankOf, type RoleKey } from '@/lib/roles'
import { isSuperAdminEmail } from '@/lib/staff-sync'

export const dynamic = 'force-dynamic'

const LEVELS: VerificationLevel[] = ['ANONYMOUS', 'EMAIL_VERIFIED', 'IDENTITY_VERIFIED', 'CREDENTIAL_VERIFIED']
const CRED: CredentialStatus[] = ['NONE', 'PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED']
const err = (m: string, status = 400) => Object.assign(new Error(m), { status })

/**
 * Altera papel/nível/credencial ou suspende/reativa uma conta.
 * body: { role?, verificationLevel?, credentialStatus? } | { action: 'suspend', reason } | { action: 'reactivate' }
 * Regras: ninguém age sobre nível igual ou superior; só o administrador geral define administradores;
 * o administrador geral nunca é atribuído por aqui; contas são suspensas, nunca excluídas.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const b = (await req.json().catch(() => ({}))) as {
    role?: CollectorRole
    verificationLevel?: VerificationLevel
    credentialStatus?: CredentialStatus
    action?: 'suspend' | 'reactivate'
    reason?: string
  }
  return adminHandle(async (ctx) => {
    const target = await prisma.collector.findUnique({ where: { id }, include: { user: { select: { email: true } } } })
    if (!target) throw err('Conta não encontrada.', 404)
    if (target.id === ctx.collector.id) throw err('Você não pode alterar a sua própria conta por aqui.', 403)
    if (isSuperAdminEmail(target.user?.email) || target.role === 'SUPER_ADMIN') throw err('O administrador geral não pode ser alterado pelo painel.', 403)
    if (!canActOn(ctx.collector.role, target.role)) throw err('Você não pode agir sobre alguém do mesmo nível ou superior.', 403)
    const actor = actorOf(ctx)
    const auditTarget = { type: 'Collector', id }

    if (b?.action === 'suspend') {
      const reason = String(b?.reason ?? '').trim().slice(0, 300)
      if (reason.length < 5) throw err('Informe o motivo da suspensão.')
      const updated = await prisma.$transaction(async (tx) => {
        const c = await tx.collector.update({ where: { id }, data: { suspendedAt: new Date(), suspendedReason: reason, suspendedById: ctx.collector.id } })
        // Encerra sessões persistidas; as sessões JWT caem no próximo acesso (o papel é relido a cada requisição).
        await tx.session.deleteMany({ where: { userId: target.userId } })
        return c
      })
      await appendAudit(actor, 'collector.suspend', auditTarget, { reason, role: target.role })
      return updated
    }
    if (b?.action === 'reactivate') {
      const updated = await prisma.collector.update({ where: { id }, data: { suspendedAt: null, suspendedReason: null, suspendedById: null } })
      await appendAudit(actor, 'collector.reactivate', auditTarget, { previousReason: target.suspendedReason })
      return updated
    }

    const data: { role?: CollectorRole; verificationLevel?: VerificationLevel; credentialStatus?: CredentialStatus } = {}
    if (b?.role && b.role !== target.role) {
      if (!assignableRoles(ctx.collector.role).includes(b.role as RoleKey)) {
        throw err(b.role === 'ADMIN' ? 'Somente o administrador geral define administradores.' : 'Você não pode atribuir este papel.', 403)
      }
      if (rankOf(target.role) >= 2 && rankOf(ctx.collector.role) < 3) throw err('Somente o administrador geral rebaixa administradores.', 403)
      data.role = b.role
    }
    if (b?.verificationLevel && LEVELS.includes(b.verificationLevel)) data.verificationLevel = b.verificationLevel
    if (b?.credentialStatus && CRED.includes(b.credentialStatus)) data.credentialStatus = b.credentialStatus
    if (!Object.keys(data).length) return target
    const updated = await prisma.collector.update({ where: { id }, data })
    await appendAudit(actor, data.role ? 'collector.role_change' : 'collector.update', auditTarget, {
      from: { role: target.role, verificationLevel: target.verificationLevel, credentialStatus: target.credentialStatus },
      to: data,
    })
    return updated
  })
}
