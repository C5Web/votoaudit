import { handle } from '@/lib/api'
import { getSectionBUs } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(() => getSectionBUs(id))
}
