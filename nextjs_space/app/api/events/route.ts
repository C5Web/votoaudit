import { handle } from '@/lib/api'
import { listEvents } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  return handle(async () => ({ items: await listEvents({ uf: sp.get('uf') ?? undefined, type: sp.get('type') ?? undefined }) }))
}
