import { adminHandle } from '@/lib/admin-guard'
import { ingestRdv } from '@/lib/urn-files'
import { getCurrentElection } from '@/lib/queries'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Ingestão de um RDV (Registro Digital do Voto) por seção.
 * Corpo: { uf, zone, section, filename, content, sourceUrl?, round? }
 * `content` = exportação textual do RDV ou JSON já tabulado (a decodificação binária
 * ASN.1 ocorre fora da aplicação; aqui recebemos o conteúdo legível).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    uf?: string; zone?: string; section?: string
    filename?: string; content?: string; sourceUrl?: string; round?: number
  }
  if (!body?.content || !body?.uf || !body?.zone || !body?.section) {
    return fail('Informe uf, zone, section e content do RDV.', 422)
  }
  return adminHandle(async () => {
    const election = await getCurrentElection()
    if (!election?.id) throw Object.assign(new Error('Nenhuma eleição ativa.'), { status: 409 })
    return ingestRdv({
      electionId: election.id,
      geo: { uf: body.uf!, zone: body.zone!, section: body.section! },
      filename: body.filename?.trim() || `RDV ${body.uf}-${body.zone}-${body.section}`,
      content: body.content!,
      sourceUrl: body.sourceUrl ?? null,
      round: body.round ?? null,
    })
  }, 'ops.ingest.tse_rdv')
}
