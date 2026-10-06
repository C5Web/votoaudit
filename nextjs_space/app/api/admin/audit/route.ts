import { prisma } from '@/lib/db'
import { adminHandle } from '@/lib/admin-guard'

export const dynamic = 'force-dynamic'

/** Registro de auditoria administrativa, do mais recente para o mais antigo. ?before=id&action=prefixo */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const before = Number(sp.get('before') ?? 0)
  const action = (sp.get('action') ?? '').trim()
  return adminHandle(async () => {
    const rows = await prisma.adminAuditLog.findMany({
      where: { ...(before > 0 ? { id: { lt: before } } : {}), ...(action ? { action: { startsWith: action } } : {}) },
      orderBy: { id: 'desc' },
      take: 50,
    })
    return { rows, nextBefore: rows.length === 50 ? rows[rows.length - 1].id : null }
  })
}
