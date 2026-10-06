import { removeSubscription } from '@/lib/notifications'
import { ok, fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

/** Cancela uma inscrição de Web Push. Corpo: { endpoint } */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { endpoint?: string }
  if (!body?.endpoint) return fail('Informe o endpoint da inscrição.', 422)
  try {
    await removeSubscription(body.endpoint)
    return ok({ removed: true })
  } catch (e) {
    console.error('unsubscribe error', e)
    return fail('Não foi possível cancelar a inscrição.', 500)
  }
}
