import { adminHandle } from '@/lib/admin-guard'
import { ingestCandidates } from '@/lib/tse-ingestor'
import { getCurrentElection } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function POST() {
  return adminHandle(async () => {
    const election = await getCurrentElection()
    return ingestCandidates(election?.id ?? '')
  }, 'ops.ingest.tse_candidates')
}
