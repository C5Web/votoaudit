import { auth } from '@/auth'
import { prisma } from './db'
import { rankOf } from './roles'
import { syncSuperAdmin } from './staff-sync'
import type { AuditActor } from './audit-log'

/** Retorna a sessão e o perfil de coletor do usuário logado (cria o perfil se faltar). Contas suspensas retornam null. */
export async function getCurrentCollector() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return null
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, emailVerified: true } })
  if (!user) return null
  let collector = await prisma.collector.findUnique({ where: { userId } })
  if (!collector) {
    collector = await prisma.collector.create({
      data: { userId, displayName: user.name ?? (user.email ?? 'Coletor').split('@')[0] },
    })
  }
  collector = await syncSuperAdmin(collector, user.email)
  if (collector.suspendedAt) return null
  return { session, collector, email: user.email ?? '', emailVerified: !!user.emailVerified }
}

export type CollectorCtx = NonNullable<Awaited<ReturnType<typeof getCurrentCollector>>>

/** minRank: 1 = moderador, 2 = administrador, 3 = administrador geral. */
export async function requireStaff(minRank = 1) {
  const ctx = await getCurrentCollector()
  if (!ctx || rankOf(ctx.collector.role) < minRank) return null
  return ctx
}

export const requireAdmin = () => requireStaff(2)

export const actorOf = (ctx: CollectorCtx): AuditActor => ({ id: ctx.collector.id, email: ctx.email, role: ctx.collector.role })
