import { fail, ok } from '@/lib/api'
import { getCurrentCollector } from '@/lib/authz'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await getCurrentCollector()
  if (!ctx) return fail('Não autenticado.', 401)
  const evidences = await prisma.evidence.findMany({
    where: { collectorId: ctx.collector.id },
    orderBy: { receivedAt: 'desc' },
    take: 100,
    include: { section: { select: { uf: true, zone: true, section: true, municipality: true } } },
  })
  return ok({ collector: ctx.collector, email: ctx.session?.user?.email ?? null, evidences })
}

export async function PATCH(req: Request) {
  const ctx = await getCurrentCollector()
  if (!ctx) return fail('Não autenticado.', 401)
  const b = (await req.json().catch(() => ({}))) as { displayName?: string; organization?: string }
  const displayName = String(b?.displayName ?? '').trim()
  if (displayName.length < 2) return fail('O nome de exibição deve ter ao menos 2 caracteres.')
  const updated = await prisma.collector.update({
    where: { id: ctx.collector.id },
    data: {
      displayName: displayName.slice(0, 60),
      // Organização de credencial aprovada só muda por nova verificação.
      ...(ctx.collector.credentialStatus === 'ACTIVE' ? {} : { organization: String(b?.organization ?? '').trim().slice(0, 100) || null }),
    },
  })
  return ok(updated)
}
