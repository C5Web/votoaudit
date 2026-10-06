import { adminHandle } from '@/lib/admin-guard'
import { ingestSections } from '@/lib/tse-ingestor'
import { getCurrentElection } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function POST() {
  return adminHandle(async () => {
    const election = await getCurrentElection()
    return ingestSections(election?.id ?? '')
  }, 'ops.ingest.tse_sections')
}
