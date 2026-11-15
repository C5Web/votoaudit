import { adminHandle } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Lista as eleições cadastradas (todas os ciclos/turnos), com contagem de seções. */
export async function GET() {
  return adminHandle(async () => {
    const rows = await prisma.election.findMany({
      orderBy: [{ year: 'desc' }, { round: 'asc' }],
      select: { id: true, year: true, round: true, status: true, electionDate: true, label: true, _count: { select: { sections: true } } },
    })
    return rows.map((e) => ({
      id: e.id,
      year: e.year,
      round: e.round,
      status: e.status,
      electionDate: e.electionDate.toISOString(),
      label: e.label,
      sections: e._count?.sections ?? 0,
    }))
  })
}

/**
 * Define a eleição corrente (ACTIVE). As demais eleições que estavam ACTIVE são
 * marcadas como FINALIZED — os dados NUNCA são apagados, ficam no banco para
 * comparação histórica. A aplicação passa a exibir apenas a eleição corrente.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string }
  return adminHandle(async () => {
    if (!body?.id) throw Object.assign(new Error('Informe a eleição.'), { status: 400 })
    const target = await prisma.election.findUnique({ where: { id: body.id } })
    if (!target) throw Object.assign(new Error('Eleição não encontrada.'), { status: 404 })
    await prisma.$transaction([
      prisma.election.updateMany({ where: { status: 'ACTIVE', id: { not: target.id } }, data: { status: 'FINALIZED' } }),
      prisma.election.update({ where: { id: target.id }, data: { status: 'ACTIVE' } }),
    ])
    return { id: target.id, year: target.year, round: target.round, status: 'ACTIVE' }
  }, 'election.activate')
}
