/**
 * Consultas públicas (somente leitura). NUNCA expõem nome/e-mail de coletores.
 * Contratos equivalentes aos endpoints REST em /api/*.
 */
import { Prisma, type SectionStatus, type IncidentSeverity, type IncidentStatus, type AuditEventType } from '@prisma/client'
import { prisma } from './db'
import { publicSourceLabel } from './constants'

export const OPEN_INCIDENT_STATUSES: IncidentStatus[] = ['DETECTED', 'AUTOMATED_CHECK', 'NEEDS_REVIEW', 'CORROBORATING']

export async function getCurrentElection() {
  return prisma.election.findFirst({ where: { year: 2026, round: 1 } })
}

export async function getOverview() {
  const election = await getCurrentElection()
  const electionId = election?.id ?? ''
  const [officialBUs, citizenBUs, concordantBUs, divergenceSections, activeIncidents, totalSections, verifiedSections, sectionsWithCitizen, collectors, anonDevices] =
    await Promise.all([
      prisma.ballotBoxBulletin.count({ where: { electionId, source: 'OFFICIAL_TSE' } }),
      prisma.ballotBoxBulletin.count({ where: { electionId, source: { not: 'OFFICIAL_TSE' } } }),
      prisma.ballotBoxBulletin.count({ where: { electionId, source: { not: 'OFFICIAL_TSE' }, validationResult: 'MATCH' } }),
      prisma.electionSection.count({ where: { electionId, status: 'DIVERGENCE' } }),
      prisma.incident.count({ where: { electionId, status: { in: OPEN_INCIDENT_STATUSES } } }),
      prisma.electionSection.count({ where: { electionId } }),
      prisma.electionSection.count({ where: { electionId, status: 'VERIFIED' } }),
      prisma.electionSection.count({ where: { electionId, bulletins: { some: { source: { not: 'OFFICIAL_TSE' } } } } }),
      prisma.evidence.findMany({ where: { electionId, collectorId: { not: null } }, distinct: ['collectorId'], select: { collectorId: true } }),
      prisma.evidence.findMany({ where: { electionId, collectorId: null }, distinct: ['deviceIdHash'], select: { deviceIdHash: true } }),
    ])
  return {
    election: election
      ? { id: election.id, year: election.year, round: election.round, electionDate: election.electionDate.toISOString(), status: election.status }
      : null,
    officialBUs,
    citizenBUs,
    concordantBUs,
    divergenceSections,
    activeIncidents,
    totalSections,
    verifiedSections,
    sectionsWithCitizen,
    coveragePct: totalSections ? Math.round((sectionsWithCitizen / totalSections) * 1000) / 10 : 0,
    contributors: { verifiedAccounts: collectors?.length ?? 0, visitors: anonDevices?.length ?? 0 },
  }
}

export interface CoverageRow {
  key: string
  municipality?: string
  total: number
  citizen: number
  official: number
  verified: number
  divergence: number
  withCitizen: number
  coveragePct: number
}

async function coverage(groupBy: 'uf' | 'zone', uf?: string): Promise<CoverageRow[]> {
  const election = await getCurrentElection()
  const electionId = election?.id ?? ''
  const groupCol = groupBy === 'uf' ? Prisma.sql`s.uf` : Prisma.sql`s.zone`
  const ufFilter = uf ? Prisma.sql`AND s.uf = ${uf}` : Prisma.empty
  const rows = await prisma.$queryRaw<
    { key: string; municipality: string | null; total: number; citizen: number; official: number; verified: number; divergence: number; with_citizen: number }[]
  >(Prisma.sql`
    SELECT ${groupCol} AS key, MIN(s.municipality) AS municipality,
      COUNT(*)::int AS total,
      COALESCE(SUM(b.cit), 0)::int AS citizen,
      COALESCE(SUM(b.off), 0)::int AS official,
      COUNT(*) FILTER (WHERE s.status = 'VERIFIED')::int AS verified,
      COUNT(*) FILTER (WHERE s.status = 'DIVERGENCE')::int AS divergence,
      COUNT(*) FILTER (WHERE COALESCE(b.cit, 0) > 0)::int AS with_citizen
    FROM "ElectionSection" s
    LEFT JOIN (
      SELECT "sectionId",
        COUNT(*) FILTER (WHERE source <> 'OFFICIAL_TSE') AS cit,
        COUNT(*) FILTER (WHERE source = 'OFFICIAL_TSE') AS off
      FROM "BallotBoxBulletin" GROUP BY "sectionId"
    ) b ON b."sectionId" = s.id
    WHERE s."electionId" = ${electionId} ${ufFilter}
    GROUP BY ${groupCol}
    ORDER BY ${groupCol}
  `)
  return (rows ?? []).map((r) => ({
    key: r.key,
    municipality: r.municipality ?? undefined,
    total: Number(r.total ?? 0),
    citizen: Number(r.citizen ?? 0),
    official: Number(r.official ?? 0),
    verified: Number(r.verified ?? 0),
    divergence: Number(r.divergence ?? 0),
    withCitizen: Number(r.with_citizen ?? 0),
    coveragePct: r.total ? Math.round((Number(r.with_citizen) / Number(r.total)) * 1000) / 10 : 0,
  }))
}

export const getCoverageByUf = () => coverage('uf')
export const getCoverageByZone = (uf: string) => coverage('zone', uf)

/** BUs cidadãos coletados por hora (horário de Brasília), com acumulado. */
export async function getTimeline() {
  const election = await getCurrentElection()
  const rows = await prisma.$queryRaw<{ hour: Date; n: number }[]>(Prisma.sql`
    SELECT date_trunc('hour', "capturedAt" AT TIME ZONE 'America/Sao_Paulo') AS hour, COUNT(*)::int AS n
    FROM "Evidence" WHERE "electionId" = ${election?.id ?? ''} AND type = 'BU'
    GROUP BY 1 ORDER BY 1
  `)
  let acc = 0
  return (rows ?? []).map((r) => {
    acc += Number(r.n ?? 0)
    const d = new Date(r.hour)
    const label = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}h`
    return { label, count: Number(r.n ?? 0), cumulative: acc }
  })
}

export interface SectionFilters {
  uf?: string
  municipality?: string
  zone?: string
  status?: string
  page?: number
  pageSize?: number
}

export async function listSections(f: SectionFilters) {
  const election = await getCurrentElection()
  const page = Math.max(1, f?.page ?? 1)
  const pageSize = Math.min(100, Math.max(5, f?.pageSize ?? 15))
  const statusMap: Record<string, SectionStatus[]> = {
    VERIFIED: ['VERIFIED'],
    DIVERGENCE: ['DIVERGENCE'],
    PENDING: ['PENDING', 'PARTIAL'],
    NO_EVIDENCE: ['NO_EVIDENCE'],
  }
  const where: Prisma.ElectionSectionWhereInput = {
    electionId: election?.id ?? '',
    ...(f?.uf ? { uf: f.uf } : {}),
    ...(f?.municipality ? { municipality: f.municipality } : {}),
    ...(f?.zone ? { zone: f.zone } : {}),
    ...(f?.status && statusMap[f.status] ? { status: { in: statusMap[f.status] } } : {}),
  }
  const [total, rows] = await Promise.all([
    prisma.electionSection.count({ where }),
    prisma.electionSection.findMany({
      where,
      orderBy: [{ uf: 'asc' }, { zone: 'asc' }, { section: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { bulletins: { select: { source: true } } },
    }),
  ])
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    items: (rows ?? []).map((s) => ({
      id: s.id,
      uf: s.uf,
      municipality: s.municipality,
      zone: s.zone,
      section: s.section,
      pollingPlace: s.pollingPlace,
      status: s.status,
      citizenBUs: (s.bulletins ?? []).filter((b) => b.source !== 'OFFICIAL_TSE').length,
      hasOfficial: (s.bulletins ?? []).some((b) => b.source === 'OFFICIAL_TSE'),
    })),
  }
}

// Opções de filtro dependentes e escaláveis para o catálogo completo (500k+ seções).
// Carrega apenas as UFs sempre; municípios só quando há UF selecionada; zonas só
// quando há UF + município. Evita trazer dezenas de milhares de combinações.
export async function getSectionFilterOptions(uf?: string, municipality?: string) {
  const election = await getCurrentElection()
  const electionId = election?.id ?? ''

  const ufRows = await prisma.electionSection.groupBy({
    by: ['uf'],
    where: { electionId },
    orderBy: { uf: 'asc' },
  })
  const ufs = ufRows.map((r) => r.uf)

  let municipalities: string[] = []
  if (uf) {
    const mRows = await prisma.electionSection.groupBy({
      by: ['municipality'],
      where: { electionId, uf },
      orderBy: { municipality: 'asc' },
    })
    municipalities = mRows.map((r) => r.municipality)
  }

  let zones: string[] = []
  if (uf && municipality) {
    const zRows = await prisma.electionSection.groupBy({
      by: ['zone'],
      where: { electionId, uf, municipality },
      orderBy: { zone: 'asc' },
    })
    zones = zRows.map((r) => r.zone)
  }

  return { ufs, municipalities, zones }
}

export async function getSectionBUs(sectionId: string) {
  const bus = await prisma.ballotBoxBulletin.findMany({
    where: { sectionId },
    orderBy: { createdAt: 'asc' },
    include: { collector: { select: { role: true, verificationLevel: true } } },
  })
  const evIds = bus.map((b) => b.evidenceId).filter((x): x is string => !!x)
  const evidences = await prisma.evidence.findMany({
    where: { id: { in: evIds } },
    select: { id: true, capturedAt: true, provenanceLevel: true, qrSignatureValid: true, sourceType: true },
  })
  const evMap = new Map(evidences.map((e) => [e.id, e]))
  const pub = (b: (typeof bus)[number]) => {
    const ev = b.evidenceId ? evMap.get(b.evidenceId) : undefined
    return {
      id: b.id,
      source: b.source,
      ballotBoxId: b.ballotBoxId,
      capturedAt: (ev?.capturedAt ?? b.generatedAt ?? b.createdAt)?.toISOString?.() ?? null,
      provenanceLevel: ev?.provenanceLevel ?? (b.collectorId ? 'AUTHENTICATED' : 'ANONYMOUS'),
      sourceLabel: b.source === 'OFFICIAL_TSE' ? 'TSE (oficial)' : publicSourceLabel(b.collector?.role, b.collector?.verificationLevel),
      sourceType: ev?.sourceType ?? null,
      qrSignatureValid: ev?.qrSignatureValid ?? null,
      eligibleVoters: b.eligibleVoters,
      turnout: b.turnout,
      blankVotes: b.blankVotes,
      nullVotes: b.nullVotes,
      candidateVotes: (b.candidateVotes ?? {}) as Record<string, number>,
      sha256: b.sha256,
      validationResult: b.validationResult,
    }
  }
  const official = bus.filter((b) => b.source === 'OFFICIAL_TSE').map(pub)
  return { official: official.length ? official[official.length - 1] : null, citizen: bus.filter((b) => b.source !== 'OFFICIAL_TSE').map(pub) }
}

export async function getLatestValidation(sectionId: string) {
  const v = await prisma.crossValidationResult.findFirst({ where: { sectionId }, orderBy: { computedAt: 'desc' } })
  if (!v) return null
  return { ...v, computedAt: v.computedAt.toISOString() }
}

export async function getSectionDetail(id: string) {
  const section = await prisma.electionSection.findUnique({
    where: { id },
    include: {
      incidents: { orderBy: { detectedAt: 'desc' } },
      zeresimas: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!section) return null
  const [bus, validation, urn] = await Promise.all([getSectionBUs(id), getLatestValidation(id), getSectionUrnArtifacts(id)])
  return {
    id: section.id,
    uf: section.uf,
    municipality: section.municipality,
    zone: section.zone,
    section: section.section,
    pollingPlace: section.pollingPlace,
    address: section.address,
    eligibleVoters: section.eligibleVoters,
    status: section.status,
    officialBU: bus.official,
    citizenBUs: bus.citizen,
    validation,
    rdvs: urn.rdvs,
    urnLogs: urn.urnLogs,
    incidents: (section.incidents ?? []).map((i) => ({
      id: i.id,
      severity: i.severity,
      category: i.category,
      status: i.status,
      detectedAt: i.detectedAt.toISOString(),
    })),
    zeresimas: (section.zeresimas ?? []).map((z) => ({
      id: z.id,
      totalVotes: z.totalVotes,
      isConsistent: z.isConsistent,
      issuedAt: z.issuedAt?.toISOString() ?? null,
    })),
  }
}

// ------------------------------------------------------------------
// RDV e Log de Urna por seção (artefatos oficiais ingeridos)
// ------------------------------------------------------------------

export interface SectionRdvView {
  id: string
  name: string
  fetchedAt: string
  sha256: string | null
  sourceUrl: string | null
  format: string | null
  office: string | null
  ballotCount: number
  tally: { candidateVotes: Record<string, number>; blankVotes: number; nullVotes: number; totalVotes: number } | null
  reconciliation: {
    status: 'CONFERE' | 'DIVERGENCIA' | 'INSUFICIENTE'
    note: string
    diffs: { key: string; rdv: number; official: number }[]
  } | null
  warnings: string[]
}

export interface SectionUrnLogView {
  id: string
  name: string
  fetchedAt: string
  sha256: string | null
  sourceUrl: string | null
  format: string | null
  lineCount: number
  flags: { zeresimaEmitted: boolean; votingStarted: boolean; votingEnded: boolean; buEmitted: boolean }
  notable: { timestamp: string | null; level: string | null; tag: string | null; message: string }[]
  warnings: string[]
}

/** Lê os RDVs e Logs de Urna ingeridos para a seção (gravados como OfficialArtifact). */
export async function getSectionUrnArtifacts(sectionId: string): Promise<{ rdvs: SectionRdvView[]; urnLogs: SectionUrnLogView[] }> {
  const artifacts = await prisma.officialArtifact.findMany({
    where: {
      type: { in: ['RDV', 'LOG_URNA'] },
      rawData: { path: ['sectionId'], equals: sectionId },
    },
    orderBy: { fetchedAt: 'desc' },
  })
  const rdvs: SectionRdvView[] = []
  const urnLogs: SectionUrnLogView[] = []
  for (const a of artifacts) {
    const raw = (a.rawData ?? {}) as Record<string, unknown>
    if (a.type === 'RDV') {
      const rec = (raw.reconciliation ?? null) as SectionRdvView['reconciliation']
      rdvs.push({
        id: a.id,
        name: a.name,
        fetchedAt: a.fetchedAt.toISOString(),
        sha256: a.sha256Official,
        sourceUrl: a.sourceUrl,
        format: (raw.format as string) ?? null,
        office: (raw.office as string) ?? null,
        ballotCount: Number(raw.ballotCount ?? 0),
        tally: (raw.tally ?? null) as SectionRdvView['tally'],
        reconciliation: rec,
        warnings: (raw.warnings as string[]) ?? [],
      })
    } else {
      const flags = (raw.flags ?? {}) as SectionUrnLogView['flags']
      urnLogs.push({
        id: a.id,
        name: a.name,
        fetchedAt: a.fetchedAt.toISOString(),
        sha256: a.sha256Official,
        sourceUrl: a.sourceUrl,
        format: (raw.format as string) ?? null,
        lineCount: Number(raw.lineCount ?? 0),
        flags: {
          zeresimaEmitted: Boolean(flags?.zeresimaEmitted),
          votingStarted: Boolean(flags?.votingStarted),
          votingEnded: Boolean(flags?.votingEnded),
          buEmitted: Boolean(flags?.buEmitted),
        },
        notable: ((raw.notable ?? []) as SectionUrnLogView['notable']).slice(0, 100),
        warnings: (raw.warnings as string[]) ?? [],
      })
    }
  }
  return { rdvs, urnLogs }
}

export interface IncidentFilters {
  severity?: string
  status?: string
  uf?: string
}

export async function listIncidents(f: IncidentFilters, take = 200) {
  const where: Prisma.IncidentWhereInput = {
    ...(f?.severity ? { severity: f.severity as IncidentSeverity } : {}),
    ...(f?.status === 'OPEN' ? { status: { in: OPEN_INCIDENT_STATUSES } } : f?.status ? { status: f.status as IncidentStatus } : {}),
    ...(f?.uf ? { section: { uf: f.uf } } : {}),
  }
  const rows = await prisma.incident.findMany({
    where,
    orderBy: { detectedAt: 'desc' },
    take,
    include: { section: { select: { id: true, uf: true, municipality: true, zone: true, section: true } } },
  })
  return (rows ?? []).map((i) => ({
    id: i.id,
    severity: i.severity,
    category: i.category,
    status: i.status,
    detectedAt: i.detectedAt.toISOString(),
    summary: ((i.automatedFindings ?? {}) as { summary?: string })?.summary ?? null,
    section: i.section,
  }))
}

export interface ReviewEntry {
  at: string
  status: string
  note: string
  reviewerRole: string
}

export async function getIncidentDetail(id: string) {
  const i = await prisma.incident.findUnique({
    where: { id },
    include: { section: { select: { id: true, uf: true, municipality: true, zone: true, section: true, pollingPlace: true, status: true } } },
  })
  if (!i) return null
  const evidences = await prisma.evidence.findMany({
    where: { id: { in: i.evidenceIds ?? [] } },
    select: {
      id: true,
      type: true,
      sourceType: true,
      provenanceLevel: true,
      capturedAt: true,
      sha256Original: true,
      qrSignatureValid: true,
      validationStatus: true,
      corroborationCount: true,
      collector: { select: { role: true, verificationLevel: true } },
    },
  })
  return {
    id: i.id,
    severity: i.severity,
    category: i.category,
    status: i.status,
    detectedAt: i.detectedAt.toISOString(),
    resolution: i.resolution,
    automatedFindings: (i.automatedFindings ?? null) as Record<string, unknown> | null,
    humanReview: (Array.isArray(i.humanReview) ? i.humanReview : []) as unknown as ReviewEntry[],
    section: i.section,
    evidences: evidences.map(({ collector, ...e }) => ({ ...e, capturedAt: e.capturedAt.toISOString(), sourceLabel: publicSourceLabel(collector?.role, collector?.verificationLevel) })),
  }
}

export async function listEvents(f: { uf?: string; type?: string }) {
  const rows = await prisma.auditEvent.findMany({
    where: {
      ...(f?.uf ? { OR: [{ uf: f.uf }, { externalKey: { startsWith: 'tse:' } }] } : {}),
      ...(f?.type ? { type: f.type as AuditEventType } : {}),
    },
    orderBy: { scheduledStart: 'asc' },
    include: { election: { select: { round: true, year: true } }, _count: { select: { avpartReports: true } } },
  })
  return (rows ?? []).map((e) => ({
    id: e.id,
    type: e.type,
    officialOrganizer: e.officialOrganizer,
    uf: e.uf,
    municipality: e.municipality,
    venue: e.venue,
    address: e.address,
    scheduledStart: e.scheduledStart.toISOString(),
    scheduledEnd: e.scheduledEnd?.toISOString() ?? null,
    publicAccess: e.publicAccess,
    officialSourceUrl: e.officialSourceUrl,
    status: e.status,
    round: e.election?.round ?? 1,
    avpartCount: e._count?.avpartReports ?? 0,
    fromCalendar: !!e.externalKey,
    national: !!e.externalKey?.startsWith('tse:'),
  }))
}

export async function getEvent(id: string) {
  const e = await prisma.auditEvent.findUnique({ where: { id }, include: { avpartReports: true } })
  if (!e) return null
  return {
    ...e,
    scheduledStart: e.scheduledStart.toISOString(),
    scheduledEnd: e.scheduledEnd?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
    avpartReports: (e.avpartReports ?? []).map((r) => ({
      id: r.id,
      tre: r.tre,
      uf: r.uf,
      ballotBoxId: r.ballotBoxId,
      mediaId: r.mediaId,
      collectorOrganization: r.collectorOrganization,
      documentSha256: r.documentSha256,
      files: r.files,
      signaturesValid: r.signaturesValid,
      comparisonResult: r.comparisonResult,
      createdAt: r.createdAt.toISOString(),
    })),
  }
}

/** Converte BigInt para number/string em respostas JSON. */
export function jsonSafe<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? Number(v) : v))) as T
}
