/**
 * Convites de uso único (48h), presos ao e-mail convidado.
 * O banco guarda só o hash SHA-256 do token; o link completo aparece uma única vez.
 */
import { createHash, randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from './db'
import { appendAudit, type AuditActor } from './audit-log'
import { assignableRoles, rankOf, type RoleKey } from './roles'
import { ROLE_LABEL } from './constants'
import { appBaseUrl, emailLayout, sendUserEmail } from './notify'
import { isSuperAdminEmail } from './staff-sync'

const INVITE_TTL_MS = 48 * 3600 * 1000
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')

function httpError(message: string, status = 400) {
  return Object.assign(new Error(message), { status })
}

export async function createInvite(actor: AuditActor & { id: string; role: string }, body: { email?: string; role?: string; organization?: string }) {
  const email = String(body?.email ?? '').trim().toLowerCase()
  const role = String(body?.role ?? '')
  const organization = String(body?.organization ?? '').trim().slice(0, 120) || null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError('E-mail inválido.')
  if (role === 'SUPER_ADMIN') throw httpError('O administrador geral é definido apenas na configuração do servidor.', 403)
  if (!assignableRoles(actor.role).includes(role as RoleKey)) {
    throw httpError(role === 'ADMIN' ? 'Somente o administrador geral convida administradores.' : 'Você não pode convidar para este papel.', 403)
  }
  if (isSuperAdminEmail(email)) throw httpError('Este e-mail já é do administrador geral.', 409)
  const existing = await prisma.user.findUnique({ where: { email }, include: { collector: true } })
  if (existing?.collector && rankOf(existing.collector.role) >= rankOf(actor.role)) throw httpError('Você não pode agir sobre alguém do mesmo nível ou superior.', 403)

  // Um convite ativo por e-mail: revoga os anteriores ainda válidos.
  await prisma.invite.updateMany({ where: { email, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date() } })
  const token = randomBytes(32).toString('base64url')
  const invite = await prisma.invite.create({
    data: { tokenHash: hashToken(token), email, role: role as RoleKey, organization, createdById: actor.id, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  })
  const link = `${appBaseUrl()}/convite/${token}`
  const roleLabel = ROLE_LABEL[role] ?? role
  const emailSent = await sendUserEmail(
    process.env.NOTIF_ID_CONVITE_PARA_O_VOTOAUDIT,
    email,
    `Convite para atuar como ${roleLabel} no VotoAudit`,
    emailLayout('Você foi convidado(a) para o VotoAudit', [
      `Você recebeu um convite para atuar como ${roleLabel}${organization ? ` (${organization})` : ''} na plataforma VotoAudit de auditoria cidadã das eleições de 2026.`,
      'O convite vale por 48 horas, pode ser usado uma única vez e só funciona com este endereço de e-mail.',
      'Se você não esperava este convite, ignore esta mensagem.',
    ], { label: 'Aceitar convite', url: link })
  )
  await appendAudit(actor, 'invite.create', { type: 'Invite', id: invite.id }, { email, role, organization, emailSent })
  return { id: invite.id, email, role, expiresAt: invite.expiresAt, link, emailSent }
}

export async function listInvites(actorRole: string) {
  const rows = await prisma.invite.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { createdBy: { select: { displayName: true } } } })
  const now = Date.now()
  return rows
    .filter((i) => rankOf(actorRole) >= 3 || i.role !== 'ADMIN')
    .map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      organization: i.organization,
      createdBy: i.createdBy?.displayName ?? null,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
      status: i.usedAt ? 'USED' : i.revokedAt ? 'REVOKED' : i.expiresAt.getTime() < now ? 'EXPIRED' : 'ACTIVE',
    }))
}

export async function revokeInvite(actor: AuditActor & { id: string; role: string }, id: string) {
  const inv = await prisma.invite.findUnique({ where: { id } })
  if (!inv) throw httpError('Convite não encontrado.', 404)
  if (inv.role === 'ADMIN' && rankOf(actor.role) < 3) throw httpError('Somente o administrador geral gerencia convites de administrador.', 403)
  if (inv.usedAt) throw httpError('Convite já utilizado.')
  if (inv.revokedAt) return { ok: true }
  await prisma.invite.update({ where: { id }, data: { revokedAt: new Date() } })
  await appendAudit(actor, 'invite.revoke', { type: 'Invite', id }, { email: inv.email, role: inv.role })
  return { ok: true }
}

async function findUsable(token: string) {
  if (!token || token.length < 20) return null
  const inv = await prisma.invite.findUnique({ where: { tokenHash: hashToken(token) } })
  if (!inv || inv.usedAt || inv.revokedAt || inv.expiresAt.getTime() < Date.now()) return null
  return inv
}

/** Dados mínimos para a página do convite (sem expor o e-mail completo). */
export async function inviteInfo(token: string) {
  const inv = await findUsable(token)
  if (!inv) return null
  const [user, domain] = inv.email.split('@')
  const existing = await prisma.user.findUnique({ where: { email: inv.email }, select: { id: true } })
  return {
    emailMasked: `${user.slice(0, 2)}${'•'.repeat(Math.max(1, user.length - 2))}@${domain}`,
    role: inv.role,
    roleLabel: ROLE_LABEL[inv.role] ?? inv.role,
    organization: inv.organization,
    expiresAt: inv.expiresAt,
    accountExists: !!existing,
  }
}

export async function acceptInvite(body: { token?: string; email?: string; name?: string; password?: string }) {
  const token = String(body?.token ?? '')
  const email = String(body?.email ?? '').trim().toLowerCase()
  const password = String(body?.password ?? '')
  const inv = await findUsable(token)
  if (!inv) throw httpError('Convite inválido, expirado ou já utilizado.', 410)
  if (email !== inv.email) throw httpError('Este convite foi emitido para outro e-mail.', 403)
  if (isSuperAdminEmail(email)) throw httpError('Conta reservada.', 403)

  const existing = await prisma.user.findUnique({ where: { email }, include: { collector: true } })
  let userId: string
  if (existing) {
    if (!existing.password || !(await bcrypt.compare(password, existing.password))) throw httpError('Senha incorreta para a conta existente.', 401)
    userId = existing.id
    await prisma.user.update({ where: { id: userId }, data: { emailVerified: existing.emailVerified ?? new Date() } })
  } else {
    if (password.length < 8) throw httpError('A senha deve ter pelo menos 8 caracteres.')
    const name = String(body?.name ?? '').trim().slice(0, 60) || email.split('@')[0]
    const u = await prisma.user.create({ data: { email, name, password: await bcrypt.hash(password, 10), emailVerified: new Date() } })
    userId = u.id
  }
  // Marca como usado de forma atômica (evita reuso concorrente).
  const used = await prisma.invite.updateMany({ where: { id: inv.id, usedAt: null, revokedAt: null }, data: { usedAt: new Date(), usedByUserId: userId } })
  if (used.count !== 1) throw httpError('Convite já utilizado.', 410)

  const staff = rankOf(inv.role) >= 1
  const isInstitutional = !staff && inv.role !== 'CITIZEN'
  const collector = await prisma.collector.upsert({
    where: { userId },
    create: {
      userId,
      displayName: String(body?.name ?? '').trim().slice(0, 60) || email.split('@')[0],
      role: inv.role,
      organization: inv.organization,
      verificationLevel: isInstitutional ? 'CREDENTIAL_VERIFIED' : 'EMAIL_VERIFIED',
      credentialStatus: isInstitutional ? 'ACTIVE' : 'NONE',
    },
    update: {
      role: inv.role,
      ...(inv.organization ? { organization: inv.organization } : {}),
      ...(isInstitutional ? { verificationLevel: 'CREDENTIAL_VERIFIED', credentialStatus: 'ACTIVE' } : {}),
      suspendedAt: null,
      suspendedReason: null,
      suspendedById: null,
    },
  })
  if (existing?.collector && existing.collector.verificationLevel === 'ANONYMOUS' && !isInstitutional) {
    await prisma.collector.update({ where: { id: collector.id }, data: { verificationLevel: 'EMAIL_VERIFIED' } })
  }
  await appendAudit({ id: collector.id, email, role: inv.role }, 'invite.accept', { type: 'Invite', id: inv.id }, { role: inv.role, previousRole: existing?.collector?.role ?? null })
  return { ok: true, role: inv.role }
}
