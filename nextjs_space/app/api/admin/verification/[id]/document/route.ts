import { staffHandle } from '@/lib/admin-guard'
import { actorOf } from '@/lib/authz'
import { documentUrl } from '@/lib/verification'

export const dynamic = 'force-dynamic'

/** URL de 5 minutos para visualizar um documento (visualização registrada na auditoria). ?i=índice */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const i = Number(new URL(req.url).searchParams.get('i') ?? 0)
  return staffHandle(1, (ctx) => documentUrl({ ...actorOf(ctx), id: ctx.collector.id, role: ctx.collector.role }, id, Number.isFinite(i) ? i : 0))
}
