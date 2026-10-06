import { handle } from '@/lib/api'
import { listIncidents } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  return handle(async () => ({
    items: await listIncidents({
      severity: sp.get('severity') ?? undefined,
      status: sp.get('status') ?? undefined,
      uf: sp.get('uf') ?? undefined,
    }),
  }))
}
