import { handle } from '@/lib/api'
import { getTimeline } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function GET() {
  return handle(async () => ({ items: await getTimeline() }))
}
