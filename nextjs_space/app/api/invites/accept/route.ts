import { handle } from '@/lib/api'
import { acceptInvite } from '@/lib/invites'

export const dynamic = 'force-dynamic'

/** body: { token, email, name?, password } — público, protegido pelo token de uso único. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}))
  return handle(() => acceptInvite(b))
}
