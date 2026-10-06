import { fail, handle } from '@/lib/api'
import { getCurrentCollector } from '@/lib/authz'
import { generateVerificationUploadUrl } from '@/lib/s3'
import { VERIFICATION_DOC_TYPES, VERIFICATION_MAX_BYTES } from '@/lib/verification'

export const dynamic = 'force-dynamic'

/** URL assinada (15 min) para enviar um documento de verificação à pasta privada do próprio usuário. */
export async function POST(req: Request) {
  const ctx = await getCurrentCollector()
  if (!ctx) return fail('Faça login para continuar.', 401)
  const b = (await req.json().catch(() => ({}))) as { fileName?: string; contentType?: string; size?: number }
  const contentType = String(b?.contentType ?? '')
  if (!VERIFICATION_DOC_TYPES.includes(contentType)) return fail('Envie uma imagem (JPG, PNG, WEBP, HEIC) ou PDF.')
  if (Number(b?.size ?? 0) > VERIFICATION_MAX_BYTES) return fail('Arquivo muito grande (máximo 15 MB).')
  return handle(() => generateVerificationUploadUrl(ctx.collector.id, String(b?.fileName ?? 'documento'), contentType))
}
