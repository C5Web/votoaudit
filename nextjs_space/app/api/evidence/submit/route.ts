import { fail, ok } from '@/lib/api'
import { getCurrentCollector } from '@/lib/authz'
import { submitEvidence, SubmissionError, type SubmitInput } from '@/lib/submission'
import type { EvidenceType } from '@prisma/client'

export const dynamic = 'force-dynamic'

const TYPES: EvidenceType[] = ['BU', 'ZERESIMA', 'AVPART', 'INTEGRITY_TEST', 'MINUTES', 'INCIDENT_PHOTO', 'VIDEO', 'REPORT', 'HASH_REPORT']

/** Submete evidência. Autenticado → proveniência da conta; sem login → proveniência ANÔNIMA. */
export async function POST(req: Request) {
  try {
    const ctx = await getCurrentCollector()
    const body = (await req.json().catch(() => ({}))) as Partial<SubmitInput>
    if (!body?.sectionId) return fail('Informe a seção eleitoral.')
    if (!body?.type || !TYPES.includes(body.type)) return fail('Tipo de evidência inválido.')
    const result = await submitEvidence({
      sectionId: body.sectionId,
      type: body.type,
      method: body.method === 'PHOTO' ? 'PHOTO' : 'QR',
      collectorId: ctx?.collector?.id ?? null,
      cloudStoragePath: body.cloudStoragePath ?? null,
      clientSha256: body.clientSha256 ?? null,
      fileSizeBytes: body.fileSizeBytes ?? null,
      mimeType: body.mimeType ?? null,
      qrRawPayload: body.qrRawPayload ?? null,
      buData: body.buData ?? null,
      capturedAt: body.capturedAt ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      locationAccuracy: body.locationAccuracy ?? null,
      deviceId: body.deviceId ?? null,
      notes: body.notes ?? null,
    })
    return ok(result, 201)
  } catch (e) {
    if (e instanceof SubmissionError) return fail(e.message, e.status)
    console.error('evidence submit error', e)
    return fail('Erro interno ao registrar a evidência.', 500)
  }
}
