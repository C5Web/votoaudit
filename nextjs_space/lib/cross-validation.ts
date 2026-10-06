/**
 * Motor de cross-validation do VotoAudit.
 *
 * 1. Busca todos os BUs cidadãos da seção (1 por fonte — o mais recente)
 * 2. Busca o BU oficial do TSE (se disponível)
 * 3. Verifica concordância entre BUs cidadãos
 * 4. Compara com o BU oficial
 * 5. Calcula confiança pelo número de fontes
 * 6. Se houver divergência → cria/atualiza Incident automaticamente
 * 7. Salva CrossValidationResult
 *
 * Vocabulário: apenas "divergência" e "inconsistência". O sistema nunca faz juízo de mérito.
 */
import type { BallotBoxBulletin, ConfidenceLevel, SectionStatus, ValidationResult, Prisma } from '@prisma/client'
import { prisma } from './db'
import { voteSignature } from './qr'
import { DEMO_CANDIDATES, candidateName } from './constants'

export interface DiffRow {
  key: string
  label: string
  official: number | null
  citizen: number | null
  diff: number | null
}

export interface CitizenGroup {
  count: number
  anonymous: number
  matchesOfficial: boolean | null
  votes: Record<string, number>
  blankVotes: number
  nullVotes: number
}

export interface CrossValidationOutcome {
  sectionId: string
  result: ValidationResult
  sectionStatus: SectionStatus
  confidenceLevel: ConfidenceLevel
  sourcesCount: number
  concordantCount: number
  divergentCount: number
  incidentId: string | null
  rows: DiffRow[]
}

const OPEN_STATUSES = ['DETECTED', 'AUTOMATED_CHECK', 'NEEDS_REVIEW', 'CORROBORATING'] as const

function buildRows(official: BallotBoxBulletin | null, citizen: BallotBoxBulletin | null): DiffRow[] {
  const ov = (official?.candidateVotes ?? {}) as Record<string, number>
  const cv = (citizen?.candidateVotes ?? {}) as Record<string, number>
  const keys = Array.from(
    new Set([...DEMO_CANDIDATES.map((c) => c.number), ...Object.keys(ov), ...Object.keys(cv)])
  ).sort()
  const row = (key: string, label: string, o: number | null, c: number | null): DiffRow => ({
    key,
    label,
    official: o,
    citizen: c,
    diff: o != null && c != null ? c - o : null,
  })
  const rows = keys.map((k: string) =>
    row(k, candidateName(k), official ? Number(ov[k] ?? 0) : null, citizen ? Number(cv[k] ?? 0) : null)
  )
  rows.push(row('BRANCO', 'Votos brancos', official ? official.blankVotes ?? 0 : null, citizen ? citizen.blankVotes ?? 0 : null))
  rows.push(row('NULO', 'Votos nulos', official ? official.nullVotes ?? 0 : null, citizen ? citizen.nullVotes ?? 0 : null))
  return rows
}

export async function crossValidateSection(sectionId: string): Promise<CrossValidationOutcome> {
  const section = await prisma.electionSection.findUnique({
    where: { id: sectionId },
    include: { bulletins: { orderBy: { createdAt: 'asc' } } },
  })
  if (!section) throw new Error('Seção não encontrada')

  const all = section?.bulletins ?? []
  const officials = all.filter((b: BallotBoxBulletin) => b.source === 'OFFICIAL_TSE')
  const official = officials.length > 0 ? officials[officials.length - 1] : null
  const citizenAll = all.filter((b: BallotBoxBulletin) => b.source !== 'OFFICIAL_TSE')

  // Uma contribuição por fonte (coletor). Envios anônimos contam individualmente.
  const bySource = new Map<string, BallotBoxBulletin>()
  for (const b of citizenAll) bySource.set(b.collectorId ?? `anon:${b.id}`, b)
  const citizens = Array.from(bySource.values())

  const officialSig = official ? voteSignature(official) : null
  const groupsMap = new Map<string, BallotBoxBulletin[]>()
  for (const b of citizens) {
    const sig = voteSignature(b)
    groupsMap.set(sig, [...(groupsMap.get(sig) ?? []), b])
  }
  const groupsSorted = Array.from(groupsMap.entries()).sort((a, b) => b[1].length - a[1].length)
  const citizensAgree = groupsSorted.length <= 1

  let concordantCount = 0
  let divergentCount = 0
  if (officialSig) {
    concordantCount = citizens.filter((b: BallotBoxBulletin) => voteSignature(b) === officialSig).length
    divergentCount = citizens.length - concordantCount
  } else if (groupsSorted.length > 0) {
    concordantCount = groupsSorted[0][1].length
    divergentCount = citizens.length - concordantCount
  }

  let result: ValidationResult
  let sectionStatus: SectionStatus
  if (citizens.length === 0) {
    result = 'INSUFFICIENT_EVIDENCE'
    sectionStatus = official ? 'PENDING' : 'NO_EVIDENCE'
  } else if (official) {
    result = divergentCount === 0 ? 'CORROBORATED' : 'DIVERGENCE_FOUND'
    sectionStatus = divergentCount === 0 ? 'VERIFIED' : 'DIVERGENCE'
  } else {
    result = citizensAgree ? 'INSUFFICIENT_EVIDENCE' : 'DIVERGENCE_FOUND'
    sectionStatus = citizensAgree ? 'PARTIAL' : 'DIVERGENCE'
  }

  // Confiança: LOW = 1 fonte; MEDIUM = 2 fontes ou 1 + oficial; HIGH = 3+ fontes concordantes com oficial.
  const sourcesCount = citizens.length + (official ? 1 : 0)
  let confidenceLevel: ConfidenceLevel = 'LOW'
  if (result === 'CORROBORATED') {
    const concordantSources = concordantCount + 1
    confidenceLevel = concordantSources >= 3 ? 'HIGH' : 'MEDIUM'
  } else if (result === 'DIVERGENCE_FOUND') {
    confidenceLevel = sourcesCount >= 3 ? 'HIGH' : sourcesCount >= 2 ? 'MEDIUM' : 'LOW'
  } else {
    confidenceLevel = sourcesCount >= 2 ? 'MEDIUM' : 'LOW'
  }

  // Representante cidadão para a tabela comparativa
  let representative: BallotBoxBulletin | null = groupsSorted?.[0]?.[1]?.[0] ?? null
  if (officialSig && divergentCount > 0) {
    const div = groupsSorted.find(([sig]) => sig !== officialSig)
    representative = div?.[1]?.[0] ?? representative
  }
  const rows = buildRows(official, representative)
  const groups: CitizenGroup[] = groupsSorted.map(([sig, list]) => ({
    count: list.length,
    anonymous: list.filter((b: BallotBoxBulletin) => !b.collectorId).length,
    matchesOfficial: officialSig ? sig === officialSig : null,
    votes: (list?.[0]?.candidateVotes ?? {}) as Record<string, number>,
    blankVotes: list?.[0]?.blankVotes ?? 0,
    nullVotes: list?.[0]?.nullVotes ?? 0,
  }))

  // ---- Incidentes automáticos ----
  let incidentId: string | null = null
  if (result === 'DIVERGENCE_FOUND') {
    let severity: 'HIGH' | 'MEDIUM' | null = null
    let summary = ''
    let involved: BallotBoxBulletin[] = []
    if (officialSig) {
      involved = citizens.filter((b: BallotBoxBulletin) => voteSignature(b) !== officialSig)
      const authCount = involved.filter((b: BallotBoxBulletin) => !!b.collectorId).length
      if (authCount >= 2) {
        severity = 'HIGH'
        summary = `${authCount} fontes cidadãs autenticadas apresentam BU diferente do BU oficial publicado.`
      } else if (authCount === 1) {
        severity = 'MEDIUM'
        summary = '1 fonte cidadã autenticada apresenta BU diferente do oficial. Aguardando corroboração por outras fontes.'
      }
    } else {
      involved = citizens
      const authCount = involved.filter((b: BallotBoxBulletin) => !!b.collectorId).length
      if (authCount >= 1) {
        severity = 'HIGH'
        summary = `BUs cidadãos da mesma seção apresentam contagens diferentes entre si (${groupsSorted.length} versões distintas).`
      }
    }

    if (severity) {
      const evidenceIds = involved.map((b: BallotBoxBulletin) => b.evidenceId).filter((x): x is string => !!x)
      const findings = {
        summary,
        comparedAgainst: officialSig ? 'BU oficial TSE' : 'Outros BUs cidadãos',
        sourcesCount,
        concordantCount,
        divergentCount,
        rows,
        groups,
        computedAt: new Date().toISOString(),
      }
      const existing = await prisma.incident.findFirst({
        where: { sectionId, category: 'BU_DIVERGENCE', status: { in: [...OPEN_STATUSES] } },
      })
      if (existing) {
        const upd = await prisma.incident.update({
          where: { id: existing.id },
          data: {
            severity,
            evidenceIds,
            automatedFindings: findings as unknown as Prisma.InputJsonValue,
            status: severity === 'HIGH' && existing.status === 'CORROBORATING' ? 'NEEDS_REVIEW' : existing.status,
          },
        })
        incidentId = upd.id
      } else {
        const created = await prisma.incident.create({
          data: {
            electionId: section.electionId,
            sectionId,
            severity,
            category: 'BU_DIVERGENCE',
            evidenceIds,
            automatedFindings: findings as unknown as Prisma.InputJsonValue,
            status: severity === 'HIGH' ? 'NEEDS_REVIEW' : 'CORROBORATING',
            humanReview: [],
          },
        })
        incidentId = created.id
      }
    }
  }

  // ---- Atualiza BUs, evidências e contadores dos coletores ----
  const sigCount = new Map<string, number>()
  for (const [sig, list] of groupsSorted) sigCount.set(sig, list.length)
  const affectedCollectors = new Set<string>()
  for (const b of citizenAll) {
    const sig = voteSignature(b)
    const vr = officialSig ? (sig === officialSig ? 'MATCH' : 'DIVERGENCE') : 'NO_OFFICIAL'
    if (b.validationResult !== vr) {
      await prisma.ballotBoxBulletin.update({ where: { id: b.id }, data: { validationResult: vr } })
    }
    if (b.evidenceId) {
      const corroboration = Math.max(0, (sigCount.get(sig) ?? 1) - 1) + (vr === 'MATCH' ? 1 : 0)
      await prisma.evidence.updateMany({
        where: { id: b.evidenceId, validationStatus: { not: 'REJECTED' } },
        data: {
          validationStatus: vr === 'DIVERGENCE' ? 'NEEDS_REVIEW' : 'VALIDATED',
          corroborationCount: corroboration,
          processedAt: new Date(),
        },
      })
    }
    if (b.collectorId) affectedCollectors.add(b.collectorId)
  }
  for (const cid of Array.from(affectedCollectors)) {
    const corroborated = await prisma.ballotBoxBulletin.count({ where: { collectorId: cid, validationResult: 'MATCH' } })
    await prisma.collector.update({ where: { id: cid }, data: { corroboratedCount: corroborated } })
  }

  await prisma.crossValidationResult.create({
    data: {
      sectionId,
      electionId: section.electionId,
      evidenceCount: citizenAll.length + officials.length,
      sourcesCount,
      concordantCount,
      divergentCount,
      officialBuId: official?.id ?? null,
      result,
      confidenceLevel,
      diffDetails: { rows, groups, citizensAgree } as unknown as Prisma.InputJsonValue,
      autoIncidentId: incidentId,
    },
  })
  if (section.status !== sectionStatus) {
    await prisma.electionSection.update({ where: { id: sectionId }, data: { status: sectionStatus } })
  }

  return { sectionId, result, sectionStatus, confidenceLevel, sourcesCount, concordantCount, divergentCount, incidentId, rows }
}

export async function crossValidateAll(electionId?: string): Promise<{ processed: number; divergences: number; incidents: number }> {
  const sections = await prisma.electionSection.findMany({
    where: electionId ? { electionId } : undefined,
    select: { id: true },
  })
  let divergences = 0
  let incidents = 0
  for (const s of sections) {
    const out = await crossValidateSection(s.id)
    if (out.result === 'DIVERGENCE_FOUND') divergences++
    if (out.incidentId) incidents++
  }
  return { processed: sections.length, divergences, incidents }
}
