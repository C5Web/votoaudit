/**
 * Ingestão de arquivos de urna do TSE: RDV (Registro Digital do Voto) e Log de Urna.
 *
 * Princípios (conforme pesquisa TSE e recomendações de auditoria):
 *  - Preservar sempre o artefato original + URL + horário de coleta + hash + versão do parser.
 *  - Versionar o parser e NÃO interpretar silenciosamente formatos desconhecidos.
 *  - Separar validade sintática, verificação criptográfica e coincidência com a totalização.
 *  - Vocabulário neutro: nunca declarar "fraude"; apenas CONFERE / DIVERGÊNCIA / INSUFICIENTE.
 *
 * Observação de arquitetura: o RDV oficial é binário (ASN.1) e o Log de Urna é distribuído
 * compactado (.logjez). A decodificação binária pesada é delegada ao backend (a migração para
 * FastAPI/Python terá pyasn1 etc.). Aqui recebemos o CONTEÚDO TEXTUAL já decodificado
 * (exportação legível do RDV, ou o log já descompactado) e cuidamos de parse, hash,
 * armazenamento com proveniência e reconciliação com o BU oficial.
 */
import type { Prisma } from '@prisma/client'
import { prisma } from './db'
import { sha256Hex, sha512Hex } from './hash'

export const RDV_PARSER_VERSION = 'rdv-text-2026.1'
export const LOG_PARSER_VERSION = 'log-urna-text-2026.1'

/** Zero-pad de zona/seção para 4 dígitos, como no catálogo geográfico. */
function pad4(v: string | number): string {
  const s = String(v ?? '').trim().replace(/\D/g, '')
  return s ? s.padStart(4, '0') : ''
}

export interface GeoKey {
  uf: string
  zone: string
  section: string
}

/** Localiza a seção no catálogo pela chave geográfica. */
export async function findSection(electionId: string, geo: GeoKey) {
  const uf = (geo.uf ?? '').trim().toUpperCase()
  const zone = pad4(geo.zone)
  const section = pad4(geo.section)
  if (!uf || !zone || !section) return null
  return prisma.electionSection.findUnique({
    where: { electionId_uf_zone_section: { electionId, uf, zone, section } },
  })
}

// ------------------------------------------------------------------
// RDV — Registro Digital do Voto
// ------------------------------------------------------------------

export interface RdvTally {
  /** votos por número de candidato/legenda */
  candidateVotes: Record<string, number>
  blankVotes: number
  nullVotes: number
  /** total de votos registrados no RDV (soma de todas as cédulas) */
  totalVotes: number
}

export interface RdvParseResult {
  format: 'tse-rdv-text' | 'json-tally' | 'unknown'
  office?: string | null
  tally?: RdvTally
  /** linhas/cédulas efetivamente contabilizadas */
  ballotCount?: number
  warnings: string[]
}

/**
 * Converte o conteúdo textual do RDV em totais por candidato.
 * Aceita dois formatos seguros e conhecidos; rejeita o resto (format=unknown).
 *
 *  1) JSON com { candidateVotes, blankVotes, nullVotes } — já tabulado.
 *  2) Exportação textual "uma cédula por linha": cada linha contém o número votado
 *     (ou BRANCO / NULO), opcionalmente precedido por cargo. Linhas em branco e
 *     cabeçalhos são ignorados.
 */
export function parseRdv(content: string): RdvParseResult {
  const warnings: string[] = []
  const text = (content ?? '').trim()
  if (!text) return { format: 'unknown', warnings: ['Conteúdo vazio.'] }

  // Formato 1: JSON já tabulado
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text) as {
        candidateVotes?: Record<string, number>
        blankVotes?: number
        nullVotes?: number
        office?: string
      }
      const candidateVotes: Record<string, number> = {}
      for (const [k, v] of Object.entries(obj.candidateVotes ?? {})) {
        const n = Number(v)
        if (Number.isFinite(n) && n >= 0) candidateVotes[String(k).trim()] = Math.trunc(n)
      }
      const blankVotes = Math.max(0, Math.trunc(Number(obj.blankVotes ?? 0)) || 0)
      const nullVotes = Math.max(0, Math.trunc(Number(obj.nullVotes ?? 0)) || 0)
      const totalVotes = Object.values(candidateVotes).reduce((a, b) => a + b, 0) + blankVotes + nullVotes
      return {
        format: 'json-tally',
        office: obj.office ?? null,
        tally: { candidateVotes, blankVotes, nullVotes, totalVotes },
        ballotCount: totalVotes,
        warnings,
      }
    } catch {
      return { format: 'unknown', warnings: ['JSON inválido no conteúdo do RDV.'] }
    }
  }

  // Formato 2: exportação textual, uma cédula por linha
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const candidateVotes: Record<string, number> = {}
  let blankVotes = 0
  let nullVotes = 0
  let ballotCount = 0
  let recognized = 0
  let headerSkipped = 0
  let office: string | null = null

  for (const line of lines) {
    // ignora cabeçalhos comuns
    if (/^(rdv|registro digital|cargo|munic|zona|se[cç][aã]o|urna|turno|pleito|elei[cç])/i.test(line)) {
      const m = line.match(/cargo\s*[:\-]\s*(.+)$/i)
      if (m) office = m[1].trim()
      headerSkipped++
      continue
    }
    // captura o token de voto (último campo relevante)
    const token = line.split(/[\t;,|]/).map((t) => t.trim()).filter(Boolean).pop() ?? line
    const up = token.toUpperCase()
    if (/^BRANCO$/.test(up)) {
      blankVotes++; ballotCount++; recognized++
    } else if (/^(NULO|NUL)$/.test(up)) {
      nullVotes++; ballotCount++; recognized++
    } else if (/^\d{2,5}$/.test(up)) {
      candidateVotes[up] = (candidateVotes[up] ?? 0) + 1
      ballotCount++; recognized++
    } else {
      // linha não reconhecida — não interpretar silenciosamente
    }
  }

  if (recognized === 0) {
    return { format: 'unknown', warnings: ['Nenhuma cédula reconhecida no formato textual do RDV.'] }
  }
  const unrecognized = lines.length - recognized - headerSkipped
  if (unrecognized > 0) {
    warnings.push(`${unrecognized} linha(s) não reconhecida(s) foram ignoradas.`)
  }
  const totalVotes = Object.values(candidateVotes).reduce((a, b) => a + b, 0) + blankVotes + nullVotes
  return {
    format: 'tse-rdv-text',
    office,
    tally: { candidateVotes, blankVotes, nullVotes, totalVotes },
    ballotCount,
    warnings,
  }
}

export type ReconcileStatus = 'CONFERE' | 'DIVERGENCIA' | 'INSUFICIENTE'

export interface RdvReconciliation {
  status: ReconcileStatus
  /** soma das cédulas do RDV deve reproduzir os totais do BU oficial */
  comparedAgainst: 'OFFICIAL_TSE' | null
  diffs: { key: string; rdv: number; official: number }[]
  note: string
}

/** Reconcilia os totais do RDV com o BU oficial da seção (se existir). Nunca fala em fraude. */
export async function reconcileRdvWithOfficial(sectionId: string, tally: RdvTally): Promise<RdvReconciliation> {
  const official = await prisma.ballotBoxBulletin.findFirst({
    where: { sectionId, source: 'OFFICIAL_TSE' },
    orderBy: { createdAt: 'desc' },
  })
  if (!official) {
    return {
      status: 'INSUFICIENTE',
      comparedAgainst: null,
      diffs: [],
      note: 'Ainda não há BU oficial da seção para reconciliar. RDV armazenado para conferência posterior.',
    }
  }
  const offVotes = (official.candidateVotes ?? {}) as Record<string, number>
  const keys = new Set<string>([...Object.keys(tally.candidateVotes), ...Object.keys(offVotes)])
  const diffs: { key: string; rdv: number; official: number }[] = []
  for (const k of keys) {
    const r = tally.candidateVotes[k] ?? 0
    const o = Number(offVotes[k] ?? 0)
    if (r !== o) diffs.push({ key: k, rdv: r, official: o })
  }
  if ((tally.blankVotes ?? 0) !== (official.blankVotes ?? 0)) diffs.push({ key: 'BRANCO', rdv: tally.blankVotes, official: official.blankVotes ?? 0 })
  if ((tally.nullVotes ?? 0) !== (official.nullVotes ?? 0)) diffs.push({ key: 'NULO', rdv: tally.nullVotes, official: official.nullVotes ?? 0 })

  if (diffs.length === 0) {
    return {
      status: 'CONFERE',
      comparedAgainst: 'OFFICIAL_TSE',
      diffs: [],
      note: 'A soma das cédulas do RDV reproduz exatamente os totais do BU oficial.',
    }
  }
  return {
    status: 'DIVERGENCIA',
    comparedAgainst: 'OFFICIAL_TSE',
    diffs,
    note: 'A soma do RDV não coincide com o BU oficial. Requer conferência humana antes de qualquer conclusão.',
  }
}

export interface IngestRdvInput {
  electionId: string
  geo: GeoKey
  filename: string
  content: string
  sourceUrl?: string | null
  round?: number | null
}

export interface IngestRdvResult {
  artifactId: string
  sectionId: string | null
  format: RdvParseResult['format']
  ballotCount: number
  reconciliation: RdvReconciliation | null
  sha256: string
  warnings: string[]
}

/** Ingesta um RDV: calcula hashes, tabula, reconcilia e grava como OfficialArtifact (type=RDV). */
export async function ingestRdv(input: IngestRdvInput): Promise<IngestRdvResult> {
  const sha256 = sha256Hex(input.content)
  const sha512 = sha512Hex(input.content)
  const parsed = parseRdv(input.content)
  const section = await findSection(input.electionId, input.geo)

  let reconciliation: RdvReconciliation | null = null
  if (section && parsed.tally) {
    reconciliation = await reconcileRdvWithOfficial(section.id, parsed.tally)
  }

  const rawData = {
    kind: 'RDV',
    parserVersion: RDV_PARSER_VERSION,
    geo: { uf: (input.geo.uf ?? '').toUpperCase(), zone: pad4(input.geo.zone), section: pad4(input.geo.section) },
    sectionId: section?.id ?? null,
    round: input.round ?? null,
    format: parsed.format,
    office: parsed.office ?? null,
    tally: parsed.tally ?? null,
    ballotCount: parsed.ballotCount ?? 0,
    reconciliation,
    sha512,
    warnings: parsed.warnings,
  } as unknown as Prisma.InputJsonValue

  const artifact = await prisma.officialArtifact.create({
    data: {
      electionId: input.electionId,
      type: 'RDV',
      name: input.filename,
      sha256Official: sha256,
      sha512Official: sha512,
      sourceUrl: input.sourceUrl ?? null,
      rawData,
    },
  })

  return {
    artifactId: artifact.id,
    sectionId: section?.id ?? null,
    format: parsed.format,
    ballotCount: parsed.ballotCount ?? 0,
    reconciliation,
    sha256,
    warnings: parsed.warnings,
  }
}

// ------------------------------------------------------------------
// Log de Urna
// ------------------------------------------------------------------

export interface UrnLogEvent {
  timestamp: string | null
  level: string | null
  tag: string | null
  message: string
}

export interface UrnLogParseResult {
  format: 'tse-log-text' | 'unknown'
  lineCount: number
  events: UrnLogEvent[]
  notable: UrnLogEvent[]
  /** destaques de auditoria */
  flags: {
    zeresimaEmitted: boolean
    votingStarted: boolean
    votingEnded: boolean
    buEmitted: boolean
  }
  warnings: string[]
}

// padrão das linhas do log da urna: "DD/MM/AAAA HH:MM:SS NIVEL ... mensagem"
const LOG_LINE = /^(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})\s+(\w+)?\s*(.*)$/
const NOTABLE_PATTERNS: { tag: string; re: RegExp }[] = [
  { tag: 'ZERESIMA', re: /zer[eé]sima|rela[cç][aã]o de zer[eé]sima|zera(ndo|da)? (a )?urna/i },
  { tag: 'URNA_LIGADA', re: /in[ií]cio.*urna|urna.*(ligad|inicializ)|carga.*urna|bootou|turn[\- ]?on/i },
  { tag: 'VOTACAO_INICIO', re: /in[ií]cio da vota[cç][aã]o|habilitado.*vota|abertura.*vota/i },
  { tag: 'VOTACAO_FIM', re: /encerrad(a|o).*vota[cç][aã]o|t[eé]rmino da vota[cç][aã]o|fim da vota/i },
  { tag: 'BU', re: /boletim de urna|emiss[aã]o.*bu|impress[aã]o.*boletim/i },
  { tag: 'ALERTA', re: /\b(alerta|erro|falha|viola[cç][aã]o|tentativa)\b/i },
]

export function parseUrnLog(content: string): UrnLogParseResult {
  const warnings: string[] = []
  const text = (content ?? '').replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/)
  const events: UrnLogEvent[] = []
  const notable: UrnLogEvent[] = []
  let matched = 0

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) continue
    const m = line.match(LOG_LINE)
    let ev: UrnLogEvent
    if (m) {
      matched++
      ev = { timestamp: m[1] ?? null, level: m[2] ?? null, tag: null, message: (m[3] ?? '').trim() }
    } else {
      ev = { timestamp: null, level: null, tag: null, message: line.trim() }
    }
    for (const p of NOTABLE_PATTERNS) {
      if (p.re.test(line)) {
        ev.tag = p.tag
        notable.push(ev)
        break
      }
    }
    events.push(ev)
  }

  const nonEmpty = lines.filter((l) => l.trim()).length
  if (nonEmpty === 0) {
    return {
      format: 'unknown',
      lineCount: 0,
      events: [],
      notable: [],
      flags: { zeresimaEmitted: false, votingStarted: false, votingEnded: false, buEmitted: false },
      warnings: ['Log vazio.'],
    }
  }
  if (matched === 0) {
    warnings.push('Nenhuma linha no formato de log da urna reconhecida; conteúdo preservado como texto bruto.')
  }

  const has = (tag: string) => notable.some((e) => e.tag === tag)
  return {
    format: matched > 0 ? 'tse-log-text' : 'unknown',
    lineCount: nonEmpty,
    events,
    notable,
    flags: {
      zeresimaEmitted: has('ZERESIMA'),
      votingStarted: has('VOTACAO_INICIO'),
      votingEnded: has('VOTACAO_FIM'),
      buEmitted: has('BU'),
    },
    warnings,
  }
}

export interface IngestUrnLogInput {
  electionId: string
  geo: GeoKey
  filename: string
  content: string
  sourceUrl?: string | null
  round?: number | null
}

export interface IngestUrnLogResult {
  artifactId: string
  sectionId: string | null
  format: UrnLogParseResult['format']
  lineCount: number
  notableCount: number
  flags: UrnLogParseResult['flags']
  sha256: string
  warnings: string[]
}

/** Ingesta um Log de Urna: hashes, parse de eventos e gravação como OfficialArtifact (type=LOG_URNA). */
export async function ingestUrnLog(input: IngestUrnLogInput): Promise<IngestUrnLogResult> {
  const sha256 = sha256Hex(input.content)
  const sha512 = sha512Hex(input.content)
  const parsed = parseUrnLog(input.content)
  const section = await findSection(input.electionId, input.geo)

  // Mantém no máximo os eventos notáveis + uma amostra, para não inflar o banco.
  const storedEvents = parsed.notable.slice(0, 500)

  const rawData = {
    kind: 'LOG_URNA',
    parserVersion: LOG_PARSER_VERSION,
    geo: { uf: (input.geo.uf ?? '').toUpperCase(), zone: pad4(input.geo.zone), section: pad4(input.geo.section) },
    sectionId: section?.id ?? null,
    round: input.round ?? null,
    format: parsed.format,
    lineCount: parsed.lineCount,
    flags: parsed.flags,
    notable: storedEvents,
    sha512,
    warnings: parsed.warnings,
  } as unknown as Prisma.InputJsonValue

  const artifact = await prisma.officialArtifact.create({
    data: {
      electionId: input.electionId,
      type: 'LOG_URNA',
      name: input.filename,
      sha256Official: sha256,
      sha512Official: sha512,
      sourceUrl: input.sourceUrl ?? null,
      rawData,
    },
  })

  return {
    artifactId: artifact.id,
    sectionId: section?.id ?? null,
    format: parsed.format,
    lineCount: parsed.lineCount,
    notableCount: parsed.notable.length,
    flags: parsed.flags,
    sha256,
    warnings: parsed.warnings,
  }
}
