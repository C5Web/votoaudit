import { adminHandle } from '@/lib/admin-guard'
import { actorOf } from '@/lib/authz'
import { createInvite, listInvites } from '@/lib/invites'

export const dynamic = 'force-dynamic'

export async function GET() {
  return adminHandle((ctx) => listInvites(ctx.collector.role))
}

/** body: { email, role, organization? } */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}))
  return adminHandle((ctx) => createInvite({ ...actorOf(ctx), id: ctx.collector.id, role: ctx.collector.role }, b))
}
