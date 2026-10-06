import { handle } from '@/lib/api'
import { prisma } from '@/lib/db'
import { getCurrentElection } from '@/lib/queries'

export const dynamic = 'force-dynamic'

/** Lista compacta de seções para os seletores em cascata (UF → município → zona → seção). */
export async function GET() {
  return handle(async () => {
    const election = await getCurrentElection()
    const items = await prisma.electionSection.findMany({
      where: { electionId: election?.id ?? '' },
      select: { id: true, uf: true, municipality: true, zone: true, section: true, pollingPlace: true },
      orderBy: [{ uf: 'asc' }, { municipality: 'asc' }, { zone: 'asc' }, { section: 'asc' }],
    })
    return { items }
  })
}
