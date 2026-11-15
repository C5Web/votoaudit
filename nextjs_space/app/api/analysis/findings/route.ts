import { handle } from '@/lib/api'
import { listAnomalyFindings } from '@/lib/electoral-analysis'

export const dynamic = 'force-dynamic'

/** Lista achados de análise. Filtros: type, severity, uf, scope, status. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  return handle(async () => ({
    items: await listAnomalyFindings({
      type: sp.get('type') ?? undefined,
      severity: sp.get('severity') ?? undefined,
      uf: sp.get('uf') ?? undefined,
      scope: sp.get('scope') ?? undefined,
      status: sp.get('status') ?? undefined,
    }),
  }))
}
