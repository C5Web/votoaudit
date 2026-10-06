import { handle } from '@/lib/api'
import { getEvent } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return handle(async () => {
    const e = await getEvent(id)
    if (!e) throw Object.assign(new Error('Evento não encontrado.'), { status: 404 })
    return e
  })
}
