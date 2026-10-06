/**
 * Ingestor de dados públicos do TSE (simulado para demonstração).
 * Portal: https://dadosabertos.tse.jus.br/ (API CKAN em /api/3/action/*)
 *
 * - Candidatos: tenta consultar o pacote CKAN; sempre usa candidatos FICTÍCIOS para a demo.
 * - Seções: seed com seções de exemplo (capitais de SP, RJ, MG, RS, BA, PE).
 * - BUs oficiais: gerados deterministicamente; estrutura pronta para os BUs reais
 *   publicados após as 17h de 4/out/2026 (arquivos .bu / .imgbu / .rdv por seção).
 */
import type { Prisma } from '@prisma/client'
import { prisma } from './db'
import { sha256Hex, seededRandom } from './hash'
import { buildQrPayload } from './qr'
import { DEMO_CANDIDATES, DEMO_OFFICE } from './constants'

export const TSE_PORTAL = 'https://dadosabertos.tse.jus.br/'

export interface SeedSection {
  uf: string
  municipality: string
  zone: string
  section: string
  pollingPlace: string
  address: string
}

type Row = [string, string, string, string[], string, string]
// [UF, município, zona, seções, local de votação, endereço] — locais e endereços ilustrativos
const ROWS: Row[] = [
  ['SP', 'São Paulo', '0001', ['0012', '0013'], 'Escola Estadual Bela Vista (demo)', 'Rua Treze de Maio, 500 – Bela Vista'],
  ['SP', 'São Paulo', '0001', ['0047'], 'Colégio Municipal Liberdade (demo)', 'Rua Galvão Bueno, 210 – Liberdade'],
  ['SP', 'São Paulo', '0002', ['0021', '0022'], 'EMEF Perdizes (demo)', 'Rua Cardoso de Almeida, 900 – Perdizes'],
  ['SP', 'São Paulo', '0005', ['0103', '0104'], 'Escola Estadual Vila Mariana (demo)', 'Rua Domingos de Morais, 1200 – Vila Mariana'],
  ['SP', 'São Paulo', '0246', ['0077', '0078'], 'EMEF Butantã (demo)', 'Av. Vital Brasil, 300 – Butantã'],
  ['SP', 'São Paulo', '0258', ['0150', '0151', '0152'], 'Escola Estadual Itaquera (demo)', 'Av. José Pinheiro Borges, 1500 – Itaquera'],
  ['RJ', 'Rio de Janeiro', '0004', ['0031', '0032', '0033'], 'Escola Municipal Copacabana (demo)', 'Rua Barata Ribeiro, 400 – Copacabana'],
  ['RJ', 'Rio de Janeiro', '0016', ['0088', '0089', '0090'], 'CIEP Tijuca (demo)', 'Rua Conde de Bonfim, 700 – Tijuca'],
  ['RJ', 'Rio de Janeiro', '0179', ['0204', '0205', '0206'], 'Escola Municipal Campo Grande (demo)', 'Estrada do Monteiro, 120 – Campo Grande'],
  ['MG', 'Belo Horizonte', '0026', ['0015', '0016', '0017'], 'Escola Estadual Savassi (demo)', 'Rua Pernambuco, 800 – Savassi'],
  ['MG', 'Belo Horizonte', '0027', ['0058', '0059'], 'Escola Municipal Pampulha (demo)', 'Av. Otacílio Negrão de Lima, 2000 – Pampulha'],
  ['MG', 'Belo Horizonte', '0032', ['0110', '0111', '0112'], 'Escola Estadual Venda Nova (demo)', 'Rua Padre Pedro Pinto, 1000 – Venda Nova'],
  ['RS', 'Porto Alegre', '0001', ['0005', '0006', '0007', '0008'], 'Escola Estadual Centro Histórico (demo)', 'Rua dos Andradas, 1100 – Centro Histórico'],
  ['RS', 'Porto Alegre', '0111', ['0040', '0041', '0042'], 'Escola Municipal Restinga (demo)', 'Av. João Antônio da Silveira, 300 – Restinga'],
  ['BA', 'Salvador', '0001', ['0019', '0020', '0021', '0022'], 'Colégio Estadual Barra (demo)', 'Av. Sete de Setembro, 3000 – Barra'],
  ['BA', 'Salvador', '0005', ['0060', '0061', '0062'], 'Escola Municipal Liberdade (demo)', 'Estrada da Liberdade, 450 – Liberdade'],
  ['PE', 'Recife', '0001', ['0009', '0010', '0011', '0012'], 'Escola Estadual Boa Vista (demo)', 'Rua da Aurora, 600 – Boa Vista'],
  ['PE', 'Recife', '0007', ['0071', '0072', '0073'], 'Escola Municipal Boa Viagem (demo)', 'Av. Conselheiro Aguiar, 2500 – Boa Viagem'],
]

export const SEED_SECTIONS: SeedSection[] = ROWS.flatMap(([uf, municipality, zone, sections, pollingPlace, address]: Row) =>
  sections.map((section: string) => ({ uf, municipality, zone, section, pollingPlace, address }))
)

export interface GeneratedBU {
  eligibleVoters: number
  turnout: number
  blankVotes: number
  nullVotes: number
  candidateVotes: Record<string, number>
}

/** Gera um BU fictício determinístico para a seção. */
export function generateDemoBU(key: string, eligibleVoters?: number | null): GeneratedBU {
  const rnd = seededRandom(key)
  const eligible = eligibleVoters ?? 280 + Math.floor(rnd() * 170)
  const turnout = Math.round(eligible * (0.76 + rnd() * 0.1))
  const blankVotes = Math.round(turnout * (0.02 + rnd() * 0.02))
  const nullVotes = Math.round(turnout * (0.03 + rnd() * 0.03))
  const valid = turnout - blankVotes - nullVotes
  const base = [0.33, 0.28, 0.19, 0.12, 0.08].map((w: number) => w * (0.7 + rnd() * 0.6))
  const sum = base.reduce((a: number, b: number) => a + b, 0)
  const candidateVotes: Record<string, number> = {}
  let used = 0
  DEMO_CANDIDATES.forEach((c, i: number) => {
    const v = i === DEMO_CANDIDATES.length - 1 ? valid - used : Math.floor((valid * (base[i] ?? 0)) / sum)
    candidateVotes[c.number] = v
    used += v
  })
  return { eligibleVoters: eligible, turnout, blankVotes, nullVotes, candidateVotes }
}

async function logJob(type: 'INGEST_TSE_DATA', payload: Record<string, unknown>, ok: boolean, error?: string) {
  await prisma.jobQueue.create({
    data: {
      type,
      payload: payload as object,
      status: ok ? 'COMPLETED' : 'FAILED',
      attempts: 1,
      completedAt: ok ? new Date() : null,
      errorMessage: error ?? null,
    },
  })
}

/** Tenta consultar o portal CKAN do TSE (curto timeout). Nunca bloqueia a demo. */
async function probeTsePortal(packageId: string): Promise<{ reachable: boolean; resources: number }> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(`${TSE_PORTAL}api/3/action/package_show?id=${encodeURIComponent(packageId)}`, {
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!res.ok) return { reachable: true, resources: 0 }
    const json = (await res.json()) as { result?: { resources?: unknown[] } }
    return { reachable: true, resources: json?.result?.resources?.length ?? 0 }
  } catch {
    return { reachable: false, resources: 0 }
  }
}

export async function ingestCandidates(electionId: string) {
  const probe = await probeTsePortal('candidatos-2026')
  const existing = await prisma.officialArtifact.findFirst({ where: { electionId, type: 'CANDIDATES_DATA' } })
  const rawData = {
    office: DEMO_OFFICE,
    candidates: DEMO_CANDIDATES,
    note: 'Candidatos fictícios para demonstração. Nenhum nome real de candidato ou partido.',
    portalProbe: probe,
  }
  const data = {
    name: 'Candidatos — Eleições 2026 (demonstração)',
    sourceUrl: `${TSE_PORTAL}dataset/?q=candidatos+2026`,
    sha256Official: sha256Hex(JSON.stringify(DEMO_CANDIDATES)),
    rawData: rawData as unknown as Prisma.InputJsonValue,
    fetchedAt: new Date(),
  }
  if (existing) await prisma.officialArtifact.update({ where: { id: existing.id }, data })
  else await prisma.officialArtifact.create({ data: { ...data, electionId, type: 'CANDIDATES_DATA' } })
  await logJob('INGEST_TSE_DATA', { kind: 'candidates', electionId, count: DEMO_CANDIDATES.length, portalProbe: probe }, true)
  return { candidates: DEMO_CANDIDATES.length, portalReachable: probe.reachable }
}

export async function ingestSections(electionId: string) {
  let upserted = 0
  for (const s of SEED_SECTIONS) {
    const eligible = generateDemoBU(`${s.uf}-${s.zone}-${s.section}`).eligibleVoters
    await prisma.electionSection.upsert({
      where: { electionId_uf_zone_section: { electionId, uf: s.uf, zone: s.zone, section: s.section } },
      update: { municipality: s.municipality, pollingPlace: s.pollingPlace, address: s.address },
      create: { ...s, electionId, eligibleVoters: eligible, status: 'NO_EVIDENCE' },
    })
    upserted++
  }
  await logJob('INGEST_TSE_DATA', { kind: 'sections', electionId, count: upserted }, true)
  return { sections: upserted }
}

/** Ingestão de BUs oficiais (simulada). `limit` = nº de seções (na ordem do seed) com BU publicado. */
export async function ingestOfficialBUs(electionId: string, limit = 30) {
  let created = 0
  for (const s of SEED_SECTIONS.slice(0, limit)) {
    const section = await prisma.electionSection.findUnique({
      where: { electionId_uf_zone_section: { electionId, uf: s.uf, zone: s.zone, section: s.section } },
    })
    if (!section) continue
    const exists = await prisma.ballotBoxBulletin.findFirst({ where: { sectionId: section.id, source: 'OFFICIAL_TSE' } })
    if (exists) continue
    const bu = generateDemoBU(`${s.uf}-${s.zone}-${s.section}`, section.eligibleVoters)
    const ballotBoxId = String(2000000 + Math.floor(seededRandom(`urna-${section.id}`)() * 900000))
    const qrPayload = buildQrPayload({ uf: s.uf, zone: s.zone, section: s.section, ballotBoxId, ...bu })
    await prisma.ballotBoxBulletin.create({
      data: {
        electionId,
        sectionId: section.id,
        ballotBoxId,
        generatedAt: new Date('2026-10-04T20:05:00Z'),
        ...bu,
        qrPayload,
        sha256: sha256Hex(qrPayload),
        source: 'OFFICIAL_TSE',
        validationResult: 'MATCH',
      },
    })
    created++
  }
  await logJob('INGEST_TSE_DATA', { kind: 'official_bus', electionId, created, simulated: true }, true)
  return { officialBUs: created }
}
