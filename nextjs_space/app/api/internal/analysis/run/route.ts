import { adminHandle } from '@/lib/admin-guard'
import { runAnalysisSweep } from '@/lib/electoral-analysis'

export const dynamic = 'force-dynamic'

/** Dispara a varredura completa de análises eleitorais (admin). Corpo opcional: { electionId? }. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { electionId?: string }
  return adminHandle(async () => runAnalysisSweep(body?.electionId), 'ops.analysis.run')
}
