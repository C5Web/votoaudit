import { staffHandle } from '@/lib/admin-guard'
import { actorOf } from '@/lib/authz'
import { decideRequest } from '@/lib/verification'

export const dynamic = 'force-dynamic'

/** body: { decision: 'APPROVE' | 'REJECT', reason } — motivo obrigatório na recusa. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const b = (await req.json().catch(() => ({}))) as { decision?: string; reason?: string }
  return staffHandle(1, (ctx) => decideRequest({ ...actorOf(ctx), id: ctx.collector.id, role: ctx.collector.role }, id, String(b?.decision ?? ''), b?.reason))
}
