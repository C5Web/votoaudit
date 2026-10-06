import { fail, handle } from '@/lib/api'
import { getCurrentCollector } from '@/lib/authz'
import { generatePresignedUploadUrl } from '@/lib/s3'

export const dynamic = 'force-dynamic'

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf', 'video/mp4']

export async function POST(req: Request) {
  const ctx = await getCurrentCollector()
  if (!ctx) return fail('Faça login para enviar arquivos.', 401)
  const body = (await req.json().catch(() => ({}))) as { fileName?: string; contentType?: string }
  const contentType = String(body?.contentType ?? '')
  if (!ALLOWED.includes(contentType)) return fail('Tipo de arquivo não suportado (use JPG, PNG, WEBP, HEIC, PDF ou MP4).')
  // Evidências originais são privadas: acesso somente por URL assinada.
  return handle(() => generatePresignedUploadUrl(String(body?.fileName ?? 'evidencia'), contentType, false))
}
