import { fail, handle } from '@/lib/api'
import { getCurrentCollector } from '@/lib/authz'
import { cancelMyRequest } from '@/lib/verification'

export const dynamic = 'force-dynamic'

/** Cancela uma solicitação pendente do próprio usuário (os documentos são apagados na hora). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentCollector()
  if (!ctx) return fail('Faça login para continuar.', 401)
  const { id } = await params
  return handle(() => cancelMyRequest(ctx.collector.id, id))
}
