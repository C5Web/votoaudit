import { getCurrentCollector } from '@/lib/authz'
import { saveSubscription } from '@/lib/notifications'
import { ok, fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Registra uma inscrição de Web Push.
 * Corpo: { endpoint, keys: { p256dh, auth }, uf? }
 * O coletor logado (se houver) fica vinculado; inscrições anônimas também são aceitas.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    endpoint?: string
    keys?: { p256dh?: string; auth?: string }
    p256dh?: string
    auth?: string
    uf?: string
  }
  const endpoint = body?.endpoint
  const p256dh = body?.keys?.p256dh ?? body?.p256dh
  const auth = body?.keys?.auth ?? body?.auth
  if (!endpoint || !p256dh || !auth) {
    return fail('Inscrição inválida: informe endpoint e chaves (p256dh, auth).', 422)
  }
  try {
    const ctx = await getCurrentCollector()
    const sub = await saveSubscription({
      collectorId: ctx?.collector.id ?? null,
      endpoint,
      p256dh,
      auth,
      uf: body.uf ?? null,
      userAgent: req.headers.get('user-agent'),
    })
    return ok({ id: sub.id, active: sub.active })
  } catch (e) {
    console.error('subscribe error', e)
    return fail('Não foi possível registrar a inscrição.', 500)
  }
}
