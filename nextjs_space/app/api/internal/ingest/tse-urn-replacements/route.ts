import { adminHandle } from '@/lib/admin-guard'
import { getCurrentElection } from '@/lib/queries'
import { findSection } from '@/lib/urn-files'
import { fail } from '@/lib/api'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { UrnIssueType } from '@prisma/client'

export const dynamic = 'force-dynamic'

const ISSUE_TYPES: UrnIssueType[] = ['ALTERED', 'DAMAGED', 'DEFECTIVE', 'REPLACED', 'NOT_INSTALLED', 'CONTINGENCY', 'OTHER']

/**
 * Ingestão de ocorrências de urna (alterada/danificada/defeito/substituída/etc.) + justificativa.
 * Corpo: { uf, zone, section, municipality?, ballotBoxId?, issueType, justification,
 *          occurredAt?, sourceUrl?, externalKey?, round? }
 * Idempotente por externalKey (quando informado).
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const uf = String(b.uf ?? '').trim().toUpperCase()
  const zone = String(b.zone ?? '').trim()
  const section = String(b.section ?? '').trim()
  const issueType = String(b.issueType ?? '').trim().toUpperCase() as UrnIssueType
  const justification = String(b.justification ?? '').trim()
  if (!uf || !zone || !section) return fail('Informe uf, zone e section.', 422)
  if (!ISSUE_TYPES.includes(issueType)) return fail(`issueType inválido. Use um de: ${ISSUE_TYPES.join(', ')}.`, 422)
  if (!justification) return fail('Informe a justificativa da ocorrência.', 422)

  return adminHandle(async () => {
    const election = await getCurrentElection()
    if (!election?.id) throw Object.assign(new Error('Nenhuma eleição ativa.'), { status: 409 })
    const sec = await findSection(election.id, { uf, zone, section })
    const occurredAt = b.occurredAt ? new Date(String(b.occurredAt)) : null
    const externalKey = b.externalKey ? String(b.externalKey) : null
    const data = {
      electionId: election.id,
      round: b.round != null ? Number(b.round) : null,
      uf,
      municipality: b.municipality ? String(b.municipality).toUpperCase() : (sec?.municipality ?? null),
      zone,
      section,
      sectionId: sec?.id ?? null,
      ballotBoxId: b.ballotBoxId ? String(b.ballotBoxId) : null,
      issueType,
      justification,
      occurredAt: occurredAt && !isNaN(occurredAt.getTime()) ? occurredAt : null,
      sourceUrl: b.sourceUrl ? String(b.sourceUrl) : null,
      externalKey,
      rawData: (b.rawData ? (b.rawData as Prisma.InputJsonValue) : Prisma.JsonNull),
    }
    if (externalKey) {
      return prisma.urnReplacement.upsert({ where: { externalKey }, create: data, update: data })
    }
    return prisma.urnReplacement.create({ data })
  }, 'ops.ingest.urn_replacements')
}
