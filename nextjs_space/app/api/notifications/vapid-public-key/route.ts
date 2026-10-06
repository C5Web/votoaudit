import { getVapidPublicKey } from '@/lib/notifications'
import { ok } from '@/lib/api'

export const dynamic = 'force-dynamic'

/** Chave pública VAPID para o navegador/app registrar o Web Push. */
export async function GET() {
  return ok({ publicKey: getVapidPublicKey() })
}
