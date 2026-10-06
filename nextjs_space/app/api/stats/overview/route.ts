import { handle } from '@/lib/api'
import { getOverview } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function GET() {
  return handle(() => getOverview())
}
