import { adminHandle } from '@/lib/admin-guard'
import { actorOf } from '@/lib/authz'
import { revokeInvite } from '@/lib/invites'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return adminHandle((ctx) => revokeInvite({ ...actorOf(ctx), id: ctx.collector.id, role: ctx.collector.role }, id))
}
