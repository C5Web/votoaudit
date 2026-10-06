import { staffHandle } from '@/lib/admin-guard'
import { actorOf } from '@/lib/authz'
import { listQueue, purgeExpiredVerificationDocs } from '@/lib/verification'

export const dynamic = 'force-dynamic'

/** Fila de análise (moderador: identidade; administradores: tudo). Aproveita para expurgar documentos vencidos. */
export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get('status') === 'DECIDED' ? 'DECIDED' : 'PENDING'
  return staffHandle(1, async (ctx) => {
    await purgeExpiredVerificationDocs(actorOf(ctx)).catch((e) => console.error('Expurgo falhou', e))
    return listQueue(ctx.collector.role, status)
  })
}
