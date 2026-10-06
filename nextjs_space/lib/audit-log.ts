/**
 * Registro de auditoria administrativa: append-only e encadeado por SHA-256.
 * Cada linha guarda o hash da anterior; alterar ou remover uma linha quebra a cadeia.
 * No banco, um trigger (prisma/sql/admin_audit_log_append_only.sql) impede UPDATE/DELETE/TRUNCATE.
 */
import { createHash } from 'crypto'
import { headers } from 'next/headers'
import { prisma } from './db'

export interface AuditActor {
  id?: string | null
  email?: string | null
  role?: string | null
}

export const SYSTEM_ACTOR: AuditActor = { id: null, email: 'sistema', role: 'SYSTEM' }
const GENESIS = 'GENESIS'

function stable(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}

interface HashInput {
  createdAt: Date
  actorId: string | null
  actorEmail: string | null
  actorRole: string | null
  action: string
  targetType: string | null
  targetId: string | null
  details: unknown
  ip: string | null
  userAgent: string | null
}

function computeHash(prevHash: string, r: HashInput): string {
  const payload = stable({ ...r, createdAt: r.createdAt.toISOString(), details: r.details ?? null })
  return createHash('sha256').update(`${prevHash}|${payload}`).digest('hex')
}

async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers()
    const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || null
    return { ip, userAgent: h.get('user-agent')?.slice(0, 300) ?? null }
  } catch {
    return { ip: null, userAgent: null }
  }
}

export async function appendAudit(
  actor: AuditActor,
  action: string,
  target?: { type: string; id?: string | null } | null,
  details?: Record<string, unknown> | null
) {
  const meta = await requestMeta()
  try {
    return await prisma.$transaction(async (tx) => {
      // Serializa as inclusões para manter a cadeia linear.
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(724001)')
      const last = await tx.adminAuditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } })
      const prevHash = last?.hash ?? GENESIS
      const row: HashInput = {
        createdAt: new Date(),
        actorId: actor?.id ?? null,
        actorEmail: actor?.email ?? null,
        actorRole: actor?.role ?? null,
        action,
        targetType: target?.type ?? null,
        targetId: target?.id ?? null,
        details: details ? JSON.parse(JSON.stringify(details)) : null,
        ip: meta.ip,
        userAgent: meta.userAgent,
      }
      const hash = computeHash(prevHash, row)
      return tx.adminAuditLog.create({ data: { ...row, details: (row.details ?? undefined) as object | undefined, prevHash, hash } })
    })
  } catch (e) {
    // A ação já ocorreu; registra a falha para investigação sem derrubar a requisição.
    console.error('Falha ao gravar registro de auditoria', action, e)
    return null
  }
}

/** Recalcula toda a cadeia e aponta o primeiro registro inconsistente. */
export async function verifyAuditChain(): Promise<{ ok: boolean; checked: number; brokenAtId: number | null; reason: string | null }> {
  let prev = GENESIS
  let cursor = 0
  let checked = 0
  for (;;) {
    const rows = await prisma.adminAuditLog.findMany({ where: { id: { gt: cursor } }, orderBy: { id: 'asc' }, take: 500 })
    if (rows.length === 0) break
    for (const r of rows) {
      if (r.prevHash !== prev) return { ok: false, checked, brokenAtId: r.id, reason: 'Encadeamento interrompido (registro anterior ausente ou alterado).' }
      const expected = computeHash(prev, {
        createdAt: r.createdAt,
        actorId: r.actorId,
        actorEmail: r.actorEmail,
        actorRole: r.actorRole,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        details: r.details ?? null,
        ip: r.ip,
        userAgent: r.userAgent,
      })
      if (expected !== r.hash) return { ok: false, checked, brokenAtId: r.id, reason: 'Conteúdo do registro não confere com o hash.' }
      prev = r.hash
      checked++
      cursor = r.id
    }
  }
  return { ok: true, checked, brokenAtId: null, reason: null }
}
