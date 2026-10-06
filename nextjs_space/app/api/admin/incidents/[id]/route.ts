import type { IncidentStatus } from '@prisma/client'
import { staffHandle } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { ROLE_LABEL } from '@/lib/constants'
import { actorOf } from '@/lib/authz'
import { appendAudit } from '@/lib/audit-log'

export const dynamic = 'force-dynamic'

const STATUSES: IncidentStatus[] = ['DETECTED', 'AUTOMATED_CHECK', 'NEEDS_REVIEW', 'CORROBORATING', 'RESOLVED', 'CONFIRMED', 'INCONCLUSIVE']

/** Atualiza status e adiciona revisão humana ao histórico (moderadores e administradores). body: { status, note, resolution? } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { status?: IncidentStatus; note?: string; resolution?: string }
  return staffHandle(1, async (ctx) => {
    const inc = await prisma.incident.findUnique({ where: { id } })
    if (!inc) throw Object.assign(new Error('Incidente não encontrado.'), { status: 404 })
    const status = body?.status && STATUSES.includes(body.status) ? body.status : inc.status
    const note = String(body?.note ?? '').trim()
    if (/fraude|corrup|roubaram/i.test(`${note} ${body?.resolution ?? ''}`)) {
      throw Object.assign(new Error('Use apenas termos técnicos como "divergência" ou "inconsistência".'), { status: 400 })
    }
    const history = Array.isArray(inc.humanReview) ? (inc.humanReview as unknown[]) : []
    const entry = { at: new Date().toISOString(), status, note: note || 'Status atualizado.', reviewerRole: ROLE_LABEL[ctx.collector.role] ?? 'Revisor' }
    const updated = await prisma.incident.update({
      where: { id },
      data: { status, humanReview: [...history, entry] as object[], resolution: body?.resolution?.trim() || inc.resolution },
    })
    await appendAudit(actorOf(ctx), 'incident.review', { type: 'Incident', id }, { from: inc.status, to: status, note: note || null })
    return updated
  })
}
