import { adminHandle } from '@/lib/admin-guard'
import { actorOf } from '@/lib/authz'
import { appendAudit } from '@/lib/audit-log'
import { prisma } from '@/lib/db'
import { eventData, type EventBody } from '@/lib/event-data'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as EventBody
  return adminHandle(async (ctx) => {
    const updated = await prisma.auditEvent.update({ where: { id }, data: eventData(body) })
    await appendAudit(actorOf(ctx), 'event.update', { type: 'AuditEvent', id }, { status: updated.status })
    return updated
  })
}
