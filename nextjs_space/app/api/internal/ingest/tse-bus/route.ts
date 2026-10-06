import { adminHandle } from '@/lib/admin-guard'
import { ingestOfficialBUs } from '@/lib/tse-ingestor'
import { getCurrentElection } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { limit?: number }
  return adminHandle(async () => {
    const election = await getCurrentElection()
    return ingestOfficialBUs(election?.id ?? '', Math.min(50, Math.max(1, Number(body?.limit ?? 30) || 30)))
  }, 'ops.ingest.tse_bus')
}
