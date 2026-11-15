import { handle } from '@/lib/api'
import { listUrnReplacements } from '@/lib/electoral-analysis'

export const dynamic = 'force-dynamic'

/** Lista urnas com ocorrência (alteradas/danificadas/defeito/substituídas). Filtros: uf, issueType. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  return handle(async () => ({
    items: await listUrnReplacements({
      uf: sp.get('uf') ?? undefined,
      issueType: sp.get('issueType') ?? undefined,
    }),
  }))
}
