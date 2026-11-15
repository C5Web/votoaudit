import { handle, fail } from '@/lib/api'
import { secondRoundSwing, abstentionShift } from '@/lib/electoral-analysis'

export const dynamic = 'force-dynamic'

/**
 * Comparativos de 2º turno vs 1º turno (virada e variação de abstenção).
 * Parâmetro: year (ano da eleição). Reprocessa e retorna o resumo da execução.
 */
export async function GET(req: Request) {
  const year = Number(new URL(req.url).searchParams.get('year'))
  if (!Number.isInteger(year) || year < 2000) return fail('Informe um ano válido (year).', 422)
  return handle(async () => ({
    swing: await secondRoundSwing(year),
    abstention: await abstentionShift(year),
  }))
}
