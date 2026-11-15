/**
 * Seed de demonstração (idempotente, sem deletes). Usado por scripts/seed.ts e /api/internal/ingest/seed.
 */
import bcrypt from 'bcryptjs'
import type { CollectorRole } from '@prisma/client'
import { prisma } from './db'
import { seededRandom, sha256Hex } from './hash'
import { buildQrPayload } from './qr'
import { SEED_SECTIONS, generateDemoBU, ingestCandidates, ingestOfficialBUs, ingestSections, type GeneratedBU } from './tse-ingestor'
import { submitEvidence, registerZeresima } from './submission'
import { importTseCalendar } from './tse-calendar'
import { crossValidateAll } from './cross-validation'
import { ingestRdv, ingestUrnLog } from './urn-files'
import { getActiveElection } from './election-config'

interface SeedUser {
  email: string
  password: string
  name: string
  role: CollectorRole
  level?: 'EMAIL_VERIFIED' | 'IDENTITY_VERIFIED' | 'CREDENTIAL_VERIFIED'
  organization?: string
  credential?: 'NONE' | 'ACTIVE'
}

const DEMO_PWD = 'Dm0-Coletor#2026-vA'

const USERS: SeedUser[] = [
  { email: 'abacus-babc195b@example.com', password: 'p9o4Wih*Qw', name: 'Administrador de Testes', role: 'ADMIN', level: 'IDENTITY_VERIFIED' },
  { email: 'admin@votoaudit.com.br', password: 'VotoAudit@2026', name: 'Administração VotoAudit', role: 'SUPER_ADMIN', level: 'IDENTITY_VERIFIED' },
  { email: 'coletor1@votoaudit.demo', password: DEMO_PWD, name: 'Coletor Demo 1', role: 'CITIZEN' },
  { email: 'coletor2@votoaudit.demo', password: DEMO_PWD, name: 'Coletor Demo 2', role: 'PARTY_INSPECTOR', level: 'CREDENTIAL_VERIFIED', credential: 'ACTIVE', organization: 'Fiscalização partidária (demo)' },
  { email: 'coletor3@votoaudit.demo', password: DEMO_PWD, name: 'Coletor Demo 3', role: 'AUDITOR', level: 'IDENTITY_VERIFIED', organization: 'Entidade de auditoria (demo)' },
  { email: 'coletor4@votoaudit.demo', password: DEMO_PWD, name: 'Coletor Demo 4', role: 'CITIZEN' },
  { email: 'coletor5@votoaudit.demo', password: DEMO_PWD, name: 'Coletor Demo 5', role: 'INTEGRITY_OBSERVER', level: 'IDENTITY_VERIFIED' },
  { email: 'coletor6@votoaudit.demo', password: DEMO_PWD, name: 'Coletor Demo 6', role: 'CITIZEN' },
]

function shifted(bu: GeneratedBU, changes: Record<string, number>, blankDelta = 0): GeneratedBU {
  const cv = { ...(bu?.candidateVotes ?? {}) }
  for (const [k, d] of Object.entries(changes)) cv[k] = Math.max(0, (cv[k] ?? 0) + d)
  return { ...bu, candidateVotes: cv, blankVotes: Math.max(0, bu.blankVotes + blankDelta) }
}

export async function runDemoSeed() {
  const log: string[] = []
  const election = await prisma.election.upsert({
    where: { year_round: { year: 2026, round: 1 } },
    update: {},
    create: { year: 2026, round: 1, electionDate: new Date('2026-10-04T11:00:00Z'), status: 'UPCOMING', officialSource: 'https://dadosabertos.tse.jus.br/' },
  })
  const round2 = await prisma.election.upsert({
    where: { year_round: { year: 2026, round: 2 } },
    update: {},
    create: { year: 2026, round: 2, electionDate: new Date('2026-10-25T11:00:00Z'), status: 'UPCOMING', officialSource: 'https://dadosabertos.tse.jus.br/' },
  })

  // ---- Usuários e coletores ----
  const collectorIds: string[] = []
  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, 10)
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { password: hash },
      create: { email: u.email, name: u.name, password: hash, emailVerified: new Date() },
    })
    const c = await prisma.collector.upsert({
      where: { userId: user.id },
      update: { role: u.role },
      create: {
        userId: user.id,
        displayName: u.name,
        role: u.role,
        verificationLevel: u.level ?? 'EMAIL_VERIFIED',
        organization: u.organization ?? null,
        credentialStatus: u.credential ?? 'NONE',
      },
    })
    if (u.email.endsWith('@votoaudit.demo')) collectorIds.push(c.id)
  }
  log.push(`${USERS.length} usuários`)

  await ingestCandidates(election.id)
  await ingestSections(election.id)
  await ingestOfficialBUs(election.id, 30)

  const sections = await Promise.all(
    SEED_SECTIONS.map((s) =>
      prisma.electionSection.findUnique({
        where: { electionId_uf_zone_section: { electionId: election.id, uf: s.uf, zone: s.zone, section: s.section } },
      })
    )
  )

  // ---- BUs cidadãos ----
  let citizenCount = 0
  const citizenPlan = (i: number): { bus: GeneratedBU[]; anonymous?: number } | null => {
    const s = SEED_SECTIONS[i]
    const base = generateDemoBU(`${s.uf}-${s.zone}-${s.section}`, sections[i]?.eligibleVoters)
    if (i === 15) return { bus: [shifted(base, { '91': -12, '92': 12 }), shifted(base, { '91': -12, '92': 12 })] }
    if (i === 16) return { bus: [base, shifted(base, { '93': 9, '94': -9 }), shifted(base, { '93': 9, '94': -9 })] }
    if (i === 31) return { bus: [base, shifted(base, { '93': 7 }, -7)] }
    if (i === 30) return { bus: [base] }
    if (i <= 17) {
      const n = i % 3 === 0 ? 3 : i % 3 === 1 ? 2 : 1
      return { bus: Array.from({ length: n }, () => base), anonymous: i === 3 ? 1 : 0 }
    }
    return null
  }
  for (let i = 0; i < SEED_SECTIONS.length; i++) {
    const sec = sections[i]
    const plan = citizenPlan(i)
    if (!sec || !plan) continue
    const already = await prisma.ballotBoxBulletin.count({ where: { sectionId: sec.id, source: { not: 'OFFICIAL_TSE' } } })
    if (already > 0) continue
    const rnd = seededRandom(`cap-${sec.id}`)
    const total = plan.bus.length + (plan.anonymous ?? 0)
    for (let k = 0; k < total; k++) {
      const bu = plan.bus[k] ?? plan.bus[0]
      const anonymous = k >= plan.bus.length
      const collectorId = anonymous ? null : collectorIds[(i + k) % collectorIds.length]
      const ballotBoxId = String(2000000 + Math.floor(seededRandom(`urna-${sec.id}`)() * 900000))
      const qr = buildQrPayload({ uf: sec.uf, zone: sec.zone, section: sec.section, ballotBoxId, ...bu })
      await submitEvidence({
        sectionId: sec.id,
        type: 'BU',
        method: 'QR',
        collectorId,
        qrRawPayload: qr,
        deviceId: anonymous ? `demo-device-${i}-${k}` : null,
        capturedAt: new Date(Date.parse('2026-10-04T20:08:00Z') + Math.floor(rnd() * 240) * 60_000),
        skipCrossValidation: true,
      })
      citizenCount++
    }
  }
  log.push(`${citizenCount} BUs cidadãos`)

  // ---- Zerésimas ----
  const zCount = await prisma.zeresima.count({ where: { electionId: election.id } })
  if (zCount === 0) {
    for (const i of [0, 1, 2, 3, 4, 6, 7, 9, 12, 20]) {
      const sec = sections[i]
      if (!sec) continue
      const inconsistent = i === 20
      const votes: Record<string, number> = { '91': 0, '92': 0, '93': inconsistent ? 1 : 0, '94': 0, '95': 0 }
      const collectorId = collectorIds[i % collectorIds.length]
      const payload = buildQrPayload({ uf: sec.uf, zone: sec.zone, section: sec.section, candidateVotes: votes, blankVotes: 0, nullVotes: 0 })
      const ev = await prisma.evidence.create({
        data: {
          electionId: election.id,
          sectionId: sec.id,
          type: 'ZERESIMA',
          sourceType: 'CITIZEN_PHOTO',
          collectorId,
          sha256Original: sha256Hex(`zeresima-${sec.id}-${payload}`),
          qrRawPayload: payload,
          qrSignatureValid: true,
          capturedAt: new Date('2026-10-04T10:32:00Z'),
          provenanceLevel: 'AUTHENTICATED',
        },
      })
      await registerZeresima({
        electionId: election.id,
        sectionId: sec.id,
        evidenceId: ev.id,
        collectorId,
        data: { uf: sec.uf, zone: sec.zone, section: sec.section, candidateVotes: votes, blankVotes: 0, nullVotes: 0 },
        issuedAt: new Date('2026-10-04T10:30:00Z'),
      })
    }
    log.push('zerésimas')
  }

  // ---- Eventos de auditoria ----
  // A agenda (testes de integridade, carga e lacração, totalização) vem do calendário oficial do TSE.
  const cal = await importTseCalendar()
  log.push(`calendário TSE: ${cal.created} novos, ${cal.updated} atualizados`)
  // Evento local de exemplo, com relatório AVPART vinculado.
  type Ev = [string, 'BALLOT_BOX_PREPARATION', string, string, string, string, string, string, 'COMPLETED', string]
  const events: Ev[] = [
    [election.id, 'BALLOT_BOX_PREPARATION', 'TRE-SP', 'SP', 'SÃO PAULO', 'Cartório eleitoral – Zona 0001 (demo)', 'São Paulo/SP', '2026-09-22T12:00:00Z', 'COMPLETED', 'https://www.tre-sp.jus.br/'],
  ]
  for (const [eid, type, org, uf, municipality, venue, address, start, status, url] of events) {
    const startDate = new Date(start)
    const exists = await prisma.auditEvent.findFirst({ where: { electionId: eid, type, uf, scheduledStart: startDate } })
    if (exists) continue
    const created = await prisma.auditEvent.create({
      data: {
        electionId: eid,
        type,
        officialOrganizer: org,
        uf,
        municipality,
        venue,
        address,
        scheduledStart: startDate,
        scheduledEnd: new Date(startDate.getTime() + 9 * 3600_000),
        publicAccess: true,
        officialSourceUrl: url,
        status,
      },
    })
    if (type === 'BALLOT_BOX_PREPARATION') {
      await prisma.aVPARTReport.create({
        data: {
          eventId: created.id,
          tre: 'TRE-SP',
          uf: 'SP',
          ballotBoxId: '2045871',
          mediaId: 'MR-000123 (demo)',
          collectorOrganization: 'Entidade de auditoria (demo)',
          documentSha256: sha256Hex('avpart-demo-sp-2045871'),
          files: [
            { name: 'logd.dat', sha256: sha256Hex('logd-demo'), matchesOfficial: true },
            { name: 'bu.dat', sha256: sha256Hex('bu-demo'), matchesOfficial: true },
          ],
          signaturesValid: true,
          comparisonResult: 'MATCH',
        },
      })
    }
  }

  // ---- RDV (Registro Digital do Voto) e Log de Urna de demonstração ----
  // Gerados a partir do BU oficial de cada seção para que a conferência seja realista.
  const urnTargets: { uf: string; zone: string; section: string; mode: 'CONFERE' | 'DIVERGENCIA' }[] = [
    { uf: 'SP', zone: '0001', section: '0012', mode: 'CONFERE' },
    { uf: 'SP', zone: '0001', section: '0013', mode: 'DIVERGENCIA' },
    { uf: 'SP', zone: '0001', section: '0047', mode: 'CONFERE' },
  ]
  for (const t of urnTargets) {
    const sec = await prisma.electionSection.findFirst({ where: { electionId: election.id, uf: t.uf, zone: t.zone, section: t.section } })
    if (!sec) continue
    const officialBU = await prisma.ballotBoxBulletin.findFirst({ where: { sectionId: sec.id, source: 'OFFICIAL_TSE' }, orderBy: { createdAt: 'desc' } })
    if (!officialBU) continue
    const baseVotes = { ...((officialBU.candidateVotes ?? {}) as Record<string, number>) }
    const rdvVotes = { ...baseVotes }
    if (t.mode === 'DIVERGENCIA') {
      // Introduz uma divergência pontual para ilustrar a conferência voto a voto.
      const firstKey = Object.keys(rdvVotes)[0]
      if (firstKey) rdvVotes[firstKey] = Math.max(0, (rdvVotes[firstKey] ?? 0) + 3)
    }
    const hasRdv = await prisma.officialArtifact.findFirst({ where: { electionId: election.id, type: 'RDV', rawData: { path: ['sectionId'], equals: sec.id } } })
    if (!hasRdv) {
      const rdvContent = JSON.stringify({ office: 'Presidente', candidateVotes: rdvVotes, blankVotes: officialBU.blankVotes ?? 0, nullVotes: officialBU.nullVotes ?? 0 })
      const r = await ingestRdv({ electionId: election.id, geo: { uf: t.uf, zone: t.zone, section: t.section }, filename: `RDV-${t.uf}-${t.zone}-${t.section}.json`, content: rdvContent, sourceUrl: 'https://dadosabertos.tse.jus.br/', round: 1 })
      log.push(`RDV ${t.uf} ${t.zone}/${t.section}: ${r.reconciliation?.status ?? 'sem conferência'}`)
    }
    const hasLog = await prisma.officialArtifact.findFirst({ where: { electionId: election.id, type: 'LOG_URNA', rawData: { path: ['sectionId'], equals: sec.id } } })
    if (!hasLog) {
      const logContent = [
        '04/10/2026 07:00:00 INFO Início de carga da urna eletrônica',
        '04/10/2026 07:00:12 INFO Carga da urna concluída com sucesso',
        '04/10/2026 07:05:30 INFO Emissão da relação de zerésima',
        '04/10/2026 07:05:45 INFO Zerésima impressa — nenhum voto registrado antes da abertura',
        '04/10/2026 08:00:00 INFO Início da votação liberado para os eleitores',
        '04/10/2026 08:01:10 INFO Eleitor habilitado e voto computado',
        '04/10/2026 12:30:00 INFO Eleitor habilitado e voto computado',
        '04/10/2026 16:59:30 INFO Eleitor habilitado e voto computado',
        '04/10/2026 17:00:00 INFO Encerrada a votação pelos mesários',
        '04/10/2026 17:00:30 INFO Emissão do boletim de urna',
        '04/10/2026 17:01:00 INFO Impressão do boletim de urna concluída',
      ].join('\n')
      const lg = await ingestUrnLog({ electionId: election.id, geo: { uf: t.uf, zone: t.zone, section: t.section }, filename: `logurna-${t.uf}-${t.zone}-${t.section}.log`, content: logContent, sourceUrl: 'https://dadosabertos.tse.jus.br/', round: 1 })
      log.push(`Log urna ${t.uf} ${t.zone}/${t.section}: ${lg.lineCount} linhas`)
    }
  }

  const hashArtifact = await prisma.officialArtifact.findFirst({ where: { electionId: election.id, type: 'SYSTEM_HASH' } })
  if (!hashArtifact) {
    await prisma.officialArtifact.create({
      data: {
        electionId: election.id,
        type: 'SYSTEM_HASH',
        name: 'Resumos digitais dos sistemas lacrados (demonstração)',
        sha256Official: sha256Hex('sistemas-lacrados-2026-demo'),
        sha512Official: null,
        sourceUrl: 'https://www.tse.jus.br/',
        rawData: { note: 'Valores ilustrativos. Substituir pelos hashes publicados após a cerimônia de lacração.' },
      },
    })
  }

  const cv = await crossValidateAll(election.id)
  await prisma.jobQueue.create({
    data: { type: 'CROSS_VALIDATE_SECTION', payload: { scope: 'all', electionId: election.id, ...cv }, status: 'COMPLETED', attempts: 1, completedAt: new Date() },
  })
  log.push(`cross-validation: ${cv.processed} seções, ${cv.divergences} divergências`)
  return { electionId: election.id, log, crossValidation: cv }
}

/**
 * Remove, de forma automatizada e idempotente, apenas os dados ficticios de demonstracao
 * da eleicao corrente, deixando o banco limpo para receber somente os dados reais.
 *
 * PRESERVA: a geografia real das secoes do TSE, o calendario oficial de eventos do TSE,
 * as contas administrativas reais e os proprios ciclos eleitorais cadastrados.
 * REMOVE: secoes de demonstracao (marcadas com "(demo)"), boletins/evidencias/zeresimas/
 * incidentes dessas secoes, artefatos ilustrativos (candidatos ficticios, RDV, logs de urna,
 * hashes de demonstracao), achados de anomalia e substituicoes de urna de teste, eventos de
 * demonstracao, contas de coletores de demonstracao (@votoaudit.demo) e a fila de jobs.
 * Por fim, redefine o estado das secoes reais que haviam sido tocadas pelo cruzamento.
 */
export async function clearDemoData() {
  const log: string[] = []
  const election = await getActiveElection()
  if (!election) {
    throw Object.assign(new Error('Nenhuma eleição corrente encontrada.'), { status: 400 })
  }
  const E = election.id

  const demoSections = await prisma.electionSection.findMany({
    where: { electionId: E, pollingPlace: { contains: '(demo)' } },
    select: { id: true },
  })
  const demoSectionIds = demoSections.map((s) => s.id)
  log.push(`seções de demonstração encontradas: ${demoSectionIds.length}`)

  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: '@votoaudit.demo' } },
    select: { id: true, collector: { select: { id: true } } },
  })
  const demoUserIds = demoUsers.map((u) => u.id)
  const demoCollectorIds = demoUsers
    .map((u) => u.collector?.id)
    .filter((x): x is string => Boolean(x))

  const cvr = await prisma.crossValidationResult.deleteMany({ where: { electionId: E } })
  log.push(`resultados de cruzamento removidos: ${cvr.count}`)

  if (demoSectionIds.length) {
    const inc = await prisma.incident.deleteMany({ where: { sectionId: { in: demoSectionIds } } })
    const zer = await prisma.zeresima.deleteMany({ where: { sectionId: { in: demoSectionIds } } })
    const bus = await prisma.ballotBoxBulletin.deleteMany({ where: { sectionId: { in: demoSectionIds } } })
    const ev = await prisma.evidence.deleteMany({ where: { sectionId: { in: demoSectionIds } } })
    log.push(`incidentes: ${inc.count}, zerésimas: ${zer.count}, boletins: ${bus.count}, evidências: ${ev.count}`)
  }

  if (demoCollectorIds.length) {
    const evC = await prisma.evidence.deleteMany({ where: { collectorId: { in: demoCollectorIds } } })
    const buC = await prisma.ballotBoxBulletin.deleteMany({ where: { collectorId: { in: demoCollectorIds } } })
    if (evC.count || buC.count) {
      log.push(`evidências/boletins de coletores de demonstração: ${evC.count}/${buC.count}`)
    }
  }

  if (demoSectionIds.length) {
    const secDel = await prisma.electionSection.deleteMany({ where: { id: { in: demoSectionIds } } })
    log.push(`seções de demonstração removidas: ${secDel.count}`)
  }

  const art = await prisma.officialArtifact.deleteMany({ where: { electionId: E } })
  log.push(`artefatos removidos: ${art.count}`)

  const anom = await prisma.anomalyFinding.deleteMany({ where: { electionId: E } })
  const urn = await prisma.urnReplacement.deleteMany({ where: { electionId: E } })
  if (anom.count || urn.count) {
    log.push(`anomalias: ${anom.count}, substituições de urna: ${urn.count}`)
  }

  const demoEvents = await prisma.auditEvent.findMany({
    where: { electionId: E, venue: { contains: '(demo)' } },
    select: { id: true },
  })
  const demoEventIds = demoEvents.map((e) => e.id)
  if (demoEventIds.length) {
    await prisma.aVPARTReport.deleteMany({ where: { eventId: { in: demoEventIds } } })
    const evt = await prisma.auditEvent.deleteMany({ where: { id: { in: demoEventIds } } })
    log.push(`eventos de demonstração removidos: ${evt.count} (calendário oficial preservado)`)
  }

  if (demoUserIds.length) {
    const usr = await prisma.user.deleteMany({ where: { id: { in: demoUserIds } } })
    log.push(`contas de demonstração removidas: ${usr.count}`)
  }

  const jobs = await prisma.jobQueue.deleteMany({})
  log.push(`itens da fila de jobs removidos: ${jobs.count}`)

  const reset = await prisma.electionSection.updateMany({
    where: { electionId: E, status: { not: 'PENDING' } },
    data: { status: 'PENDING' },
  })
  log.push(`seções reais redefinidas para pendente: ${reset.count}`)

  return { electionId: E, log }
}
