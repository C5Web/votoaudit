import { handle } from '@/lib/api'
import { getCoverageByZone } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ uf: string }> }) {
  const { uf } = await params
  return handle(async () => ({ uf: (uf ?? '').toUpperCase(), items: await getCoverageByZone((uf ?? '').toUpperCase()) }))
}
