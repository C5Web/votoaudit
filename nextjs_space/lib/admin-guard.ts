import { requireStaff, actorOf, type CollectorCtx } from './authz'
import { appendAudit } from './audit-log'
import { fail, handle } from './api'

/**
 * Executa `fn` somente para a equipe com o nível mínimo exigido (1 = moderador, 2 = administrador, 3 = geral).
 * Se `action` for informado, a operação bem-sucedida é gravada no registro de auditoria.
 */
export async function staffHandle<T>(minRank: number, fn: (ctx: CollectorCtx) => Promise<T>, action?: string) {
  const ctx = await requireStaff(minRank)
  if (!ctx) return fail(minRank >= 2 ? 'Acesso restrito a administradores.' : 'Acesso restrito à equipe de moderação.', 403)
  return handle(async () => {
    const result = await fn(ctx)
    if (action) await appendAudit(actorOf(ctx), action)
    return result
  })
}

/** Executa `fn` somente para administradores (administrador ou administrador geral). */
export function adminHandle<T>(fn: (ctx: CollectorCtx) => Promise<T>, action?: string) {
  return staffHandle(2, fn, action)
}
