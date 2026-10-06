import { eventData, type EventBody } from '@/lib/event-data'
import { adminHandle } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { getCurrentElection } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as EventBody
  return adminHandle(async () => {
    if (!body?.type || !body?.uf || !body?.scheduledStart) {
      throw Object.assign(new Error('Tipo, UF e data de início são obrigatórios.'), { status: 400 })
    }
    const election = await getCurrentElection()
    return prisma.auditEvent.create({
      data: { electionId: election?.id ?? '', type: body.type, uf: body.uf.toUpperCase(), scheduledStart: new Date(body.scheduledStart), ...eventData(body) },
    })
  }, 'event.create')
}
