import { getCurrentCollector } from '@/lib/authz'
import { getOrCreatePreference, updatePreference, type PreferencePatch } from '@/lib/notifications'
import { ok, fail, handle } from '@/lib/api'

export const dynamic = 'force-dynamic'

/** Lê as preferências de notificação do coletor logado. */
export async function GET() {
  const ctx = await getCurrentCollector()
  if (!ctx) return fail('Faça login para ver suas preferências.', 401)
  return handle(() => getOrCreatePreference(ctx.collector.id))
}

/** Atualiza as preferências de notificação do coletor logado. */
export async function PUT(req: Request) {
  const ctx = await getCurrentCollector()
  if (!ctx) return fail('Faça login para alterar suas preferências.', 401)
  const patch = (await req.json().catch(() => ({}))) as PreferencePatch
  return handle(() => updatePreference(ctx.collector.id, patch))
}
