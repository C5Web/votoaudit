import { handle } from '@/lib/api'
import { getAnomalySummary } from '@/lib/electoral-analysis'

export const dynamic = 'force-dynamic'

/** Resumo das análises eleitorais (contagens por tipo e severidade) da eleição ativa. */
export async function GET() {
  return handle(async () => getAnomalySummary())
}
