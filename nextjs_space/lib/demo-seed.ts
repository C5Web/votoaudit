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
    [election.id, 'BALLOT_BOX_PREPARATION', 'TRE-SP', 'SP', 'São Paulo', 'Cartório eleitoral – Zona 0001 (demo)', 'São Paulo/SP', '2026-09-22T12:00:00Z', 'COMPLETED', 'https://www.tre-sp.jus.br/'],
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
