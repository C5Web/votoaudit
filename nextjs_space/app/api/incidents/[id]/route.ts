import { handle } from '@/lib/api'
import { getIncidentDetail } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(async () => {
    const d = await getIncidentDetail(id)
    if (!d) throw Object.assign(new Error('Incidente não encontrado.'), { status: 404 })
    return d
  })
}
