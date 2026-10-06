import { fail, handle } from '@/lib/api'
import { getCurrentCollector } from '@/lib/authz'
import { createVerificationRequest, listMyRequests } from '@/lib/verification'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await getCurrentCollector()
  if (!ctx) return fail('Faça login para continuar.', 401)
  return handle(() => listMyRequests(ctx.collector.id))
}

export async function POST(req: Request) {
  const ctx = await getCurrentCollector()
  if (!ctx) return fail('Faça login para continuar.', 401)
  const body = await req.json().catch(() => ({}))
  return handle(async () => {
    const r = await createVerificationRequest(ctx.collector, body)
    return { id: r.id, status: r.status }
  })
}
