import { handle } from '@/lib/api'
import { getSectionDetail } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(async () => {
    const d = await getSectionDetail(id)
    if (!d) throw Object.assign(new Error('Seção não encontrada.'), { status: 404 })
    return d
  })
}
