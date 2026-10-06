import { fail, ok } from '@/lib/api'
import { getCurrentCollector } from '@/lib/authz'
import { submitEvidence, SubmissionError } from '@/lib/submission'

export const dynamic = 'force-dynamic'

/** Submete um BU a partir do payload do QR Code (formato QRBU simplificado). */
export async function POST(req: Request) {
  try {
    const ctx = await getCurrentCollector()
    const body = (await req.json().catch(() => ({}))) as { sectionId?: string; qrPayload?: string; capturedAt?: string; deviceId?: string }
    if (!body?.sectionId || !body?.qrPayload) return fail('Informe sectionId e qrPayload.')
    const result = await submitEvidence({
      sectionId: body.sectionId,
      type: 'BU',
      method: 'QR',
      collectorId: ctx?.collector?.id ?? null,
      qrRawPayload: body.qrPayload,
      capturedAt: body.capturedAt ?? null,
      deviceId: body.deviceId ?? null,
    })
    return ok(result, 201)
  } catch (e) {
    if (e instanceof SubmissionError) return fail(e.message, e.status)
    console.error('bu submit error', e)
    return fail('Erro interno ao registrar o BU.', 500)
  }
}
