import { adminHandle } from '@/lib/admin-guard'
import { ingestUrnLog } from '@/lib/urn-files'
import { getCurrentElection } from '@/lib/queries'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Ingestão de um Log de Urna por seção.
 * Corpo: { uf, zone, section, filename, content, sourceUrl?, round? }
 * `content` = log já descompactado (texto). O .logjez é descompactado fora da aplicação.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    uf?: string; zone?: string; section?: string
    filename?: string; content?: string; sourceUrl?: string; round?: number
  }
  if (!body?.content || !body?.uf || !body?.zone || !body?.section) {
    return fail('Informe uf, zone, section e content do log.', 422)
  }
  return adminHandle(async () => {
    const election = await getCurrentElection()
    if (!election?.id) throw Object.assign(new Error('Nenhuma eleição ativa.'), { status: 409 })
    return ingestUrnLog({
      electionId: election.id,
      geo: { uf: body.uf!, zone: body.zone!, section: body.section! },
      filename: body.filename?.trim() || `LOG ${body.uf}-${body.zone}-${body.section}`,
      content: body.content!,
      sourceUrl: body.sourceUrl ?? null,
      round: body.round ?? null,
    })
  }, 'ops.ingest.tse_log')
}
