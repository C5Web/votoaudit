import { adminHandle } from '@/lib/admin-guard'
import { actorOf } from '@/lib/authz'
import { purgeExpiredVerificationDocs } from '@/lib/verification'

export const dynamic = 'force-dynamic'

/** Expurgo manual dos documentos de verificação decididos há mais de 30 dias. */
export async function POST() {
  return adminHandle((ctx) => purgeExpiredVerificationDocs(actorOf(ctx)))
}
