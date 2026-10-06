import type { Collector } from '@prisma/client'
import { prisma } from './db'
import { appendAudit, SYSTEM_ACTOR } from './audit-log'

/** Administradores gerais são definidos fora do banco, na configuração do servidor. */
export function superAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export const isSuperAdminEmail = (email?: string | null) => !!email && superAdminEmails().includes(email.toLowerCase())

/**
 * Garante, a cada acesso, que o papel de administrador geral corresponda à configuração do servidor:
 * restaura quem está na lista (mesmo se rebaixado ou suspenso no banco) e rebaixa quem não está.
 */
export async function syncSuperAdmin(c: Collector, email?: string | null): Promise<Collector> {
  const isSuper = isSuperAdminEmail(email)
  if (isSuper && (c.role !== 'SUPER_ADMIN' || c.suspendedAt)) {
    const updated = await prisma.collector.update({
      where: { id: c.id },
      data: { role: 'SUPER_ADMIN', suspendedAt: null, suspendedReason: null, suspendedById: null },
    })
    await appendAudit(SYSTEM_ACTOR, 'super_admin.restored', { type: 'collector', id: c.id }, { previousRole: c.role, wasSuspended: !!c.suspendedAt, email })
    return updated
  }
  if (!isSuper && c.role === 'SUPER_ADMIN') {
    const updated = await prisma.collector.update({ where: { id: c.id }, data: { role: 'ADMIN' } })
    await appendAudit(SYSTEM_ACTOR, 'super_admin.not_in_config', { type: 'collector', id: c.id }, { newRole: 'ADMIN', email })
    return updated
  }
  return c
}

/** Versão por userId, usada no callback de sessão. Retorna null se a conta estiver suspensa. */
export async function refreshSessionRole(userId: string, email?: string | null): Promise<string | null> {
  const c = await prisma.collector.findUnique({ where: { userId } })
  if (!c) return 'CITIZEN'
  const synced = await syncSuperAdmin(c, email)
  if (synced.suspendedAt) return null
  return synced.role
}
