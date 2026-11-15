/**
 * Análises eleitorais e detecção de suspeições — o "cérebro" analítico do VotoAudit.
 *
 * Toda a lógica é escrita como funções puras de leitura + persistência idempotente
 * em AnomalyFinding, pensada para ser portada tal e qual para o backend FastAPI na VPS.
 *
 * PRINCÍPIOS (importantes e inegociáveis):
 *  - Vocabulário NEUTRO e honesto: usamos "possível irregularidade", "incoerência",
 *    "divergência", "padrão atípico", "indicador" — NUNCA afirmamos "fraude" como fato.
 *  - As urnas brasileiras não registram o voto individual auditável; portanto vários
 *    indicadores (votos "espíritas", compra de votos) são apenas SINALIZADORES
 *    estatísticos, jamais prova. Cada achado carrega essa ressalva na descrição.
 *  - Nada é hardcoded por ano/turno: os parâmetros vêm do modelo Election
 *    (horários de encerramento, limiares de abstenção) via auditParams().
 *
 * Persistência idempotente: cada achado tem um dedupeKey estável. Ao reprocessar,
 * atualizamos severidade/descrição/métrica, mas NUNCA sobrescrevemos o `status`
 * (uma decisão humana — CONFIRMED/DISMISSED — é preservada).
 */
import type { AnomalyScope, AnomalyType, IncidentSeverity, Prisma } from '@prisma/client'
import { prisma } from './db'
import { auditParams, getActiveElection, getElectionByRound } from './election-config'
import { jsonSafe } from './queries'

// ------------------------------------------------------------------
// Tipos e utilitários internos
// ------------------------------------------------------------------

interface FindingInput {
  electionId: string
  round?: number | null
  type: AnomalyType
  severity: IncidentSeverity
  scope: AnomalyScope
  uf?: string | null
  municipality?: string | null
  zone?: string | null
  sectionId?: string | null
  candidate?: string | null
  title: string
  description: string
  metric?: number | null
  detail?: Prisma.InputJsonValue | null
}

function dedupeKeyOf(f: FindingInput): string {
  return [
    f.type,
    f.round ?? '',
    f.scope,
    f.uf ?? '',
    f.municipality ?? '',
    f.zone ?? '',
    f.sectionId ?? '',
    f.candidate ?? '',
  ].join('|')
}

/**
 * Grava/atualiza um achado de forma idempotente. Preserva o status decidido por humano.
 */
async function upsertFinding(f: FindingInput) {
  const dedupeKey = dedupeKeyOf(f)
  const base = {
    electionId: f.electionId,
    round: f.round ?? null,
    type: f.type,
    severity: f.severity,
    scope: f.scope,
    uf: f.uf ?? null,
    municipality: f.municipality ?? null,
    zone: f.zone ?? null,
    sectionId: f.sectionId ?? null,
    candidate: f.candidate ?? null,
    title: f.title,
    description: f.description,
    metric: f.metric ?? null,
    detail: (f.detail ?? undefined) as Prisma.InputJsonValue | undefined,
  }
  await prisma.anomalyFinding.upsert({
    where: { dedupeKey },
    create: { ...base, dedupeKey },
    // NUNCA sobrescreve `status` nem `detectedAt` originais.
    update: {
      severity: base.severity,
      title: base.title,
      description: base.description,
      metric: base.metric,
      detail: base.detail,
    },
  })
}

type CandVotes = Record<string, number>

function parseCandidateVotes(j: unknown): CandVotes {
  const out: CandVotes = {}
  if (j && typeof j === 'object') {
    for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
      const n = Number(v)
      if (Number.isFinite(n) && n >= 0) out[String(k).trim()] = Math.trunc(n)
    }
  }
  return out
}

interface BURow {
  sectionId: string
  uf: string
  municipality: string
  zone: string
  section: string
  eligible: number
  turnout: number
  blank: number
  nullv: number
  candidateVotes: CandVotes
  totalVotes: number
}

/** Carrega os BUs oficiais de uma eleição já normalizados (uma única leitura reutilizável). */
async function loadOfficialBUs(electionId: string, take = 80000): Promise<BURow[]> {
  const rows = await prisma.ballotBoxBulletin.findMany({
    where: { electionId, source: 'OFFICIAL_TSE' },
    select: {
      sectionId: true,
      eligibleVoters: true,
      turnout: true,
      blankVotes: true,
      nullVotes: true,
      candidateVotes: true,
      section: { select: { uf: true, municipality: true, zone: true, section: true, eligibleVoters: true } },
    },
    take,
  })
  return rows.map((r) => {
    const cv = parseCandidateVotes(r.candidateVotes)
    const blank = r.blankVotes ?? 0
    const nullv = r.nullVotes ?? 0
    const candSum = Object.values(cv).reduce((a, b) => a + b, 0)
    const totalVotes = candSum + blank + nullv
    const eligible = r.eligibleVoters ?? r.section?.eligibleVoters ?? 0
    const turnout = r.turnout ?? totalVotes
    return {
      sectionId: r.sectionId,
      uf: r.section?.uf ?? '',
      municipality: r.section?.municipality ?? '',
      zone: r.section?.zone ?? '',
      section: r.section?.section ?? '',
      eligible,
      turnout,
      blank,
      nullv,
      candidateVotes: cv,
      totalVotes,
    }
  })
}

/** Soma mapas de votos candidato->quantidade. */
function addVotes(into: CandVotes, from: CandVotes) {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v
}

const MIN_SECTIONS_REGION = 5 // mínimo de seções para uma agregação regional ser significativa
const SECTION_TURNOUT_FLOOR = 50 // comparecimento mínimo numa seção para heurísticas por seção

// ------------------------------------------------------------------
// G) Votos acima do previsto (teto de votos)
// ------------------------------------------------------------------
export async function analyzeVoteCeiling(electionId: string, round?: number | null) {
  const bus = await loadOfficialBUs(electionId)
  let count = 0
  for (const b of bus) {
    if (b.eligible <= 0) continue
    const overCandidate = Object.entries(b.candidateVotes).find(([, v]) => v > b.eligible)
    const overTurnout = b.turnout > b.eligible
    const overTotal = b.totalVotes > b.eligible
    if (!overCandidate && !overTurnout && !overTotal) continue
    const excedente = Math.max(b.turnout, b.totalVotes, overCandidate ? overCandidate[1] : 0) - b.eligible
    await upsertFinding({
      electionId,
      round: round ?? null,
      type: 'VOTE_CEILING_EXCEEDED',
      severity: 'HIGH',
      scope: 'SECTION',
      uf: b.uf,
      municipality: b.municipality,
      zone: b.zone,
      sectionId: b.sectionId,
      candidate: overCandidate ? overCandidate[0] : null,
      title: 'Votos acima do eleitorado apto da seção',
      description:
        `A seção tem ${b.eligible} eleitores aptos, mas foram apurados ${Math.max(b.turnout, b.totalVotes)} votos` +
        (overCandidate ? ` (candidato ${overCandidate[0]} com ${overCandidate[1]} votos)` : '') +
        '. Excedente de ' + excedente + ' voto(s): possível irregularidade que requer verificação da fonte oficial.',
      metric: excedente,
      detail: { eligible: b.eligible, turnout: b.turnout, totalVotes: b.totalVotes, candidateVotes: b.candidateVotes },
    })
    count++
  }
  return { type: 'VOTE_CEILING_EXCEEDED', findings: count, scanned: bus.length }
}

// ------------------------------------------------------------------
// H) Zero votos para um candidato (incoerência)
// ------------------------------------------------------------------
export async function analyzeZeroVotes(electionId: string, round?: number | null) {
  const bus = await loadOfficialBUs(electionId)
  // Participação municipal de cada candidato para calibrar o que é "inesperado".
  const muniTotals = new Map<string, { byCand: CandVotes; total: number; sections: number }>()
  for (const b of bus) {
    const key = `${b.uf}|${b.municipality}`
    const agg = muniTotals.get(key) ?? { byCand: {}, total: 0, sections: 0 }
    addVotes(agg.byCand, b.candidateVotes)
    agg.total += Object.values(b.candidateVotes).reduce((a, c) => a + c, 0)
    agg.sections++
    muniTotals.set(key, agg)
  }
  let count = 0
  for (const b of bus) {
    if (b.turnout < SECTION_TURNOUT_FLOOR) continue
    const key = `${b.uf}|${b.municipality}`
    const agg = muniTotals.get(key)
    if (!agg || agg.total <= 0 || agg.sections < MIN_SECTIONS_REGION) continue
    for (const [cand, muniVotes] of Object.entries(agg.byCand)) {
      const muniShare = muniVotes / agg.total
      if (muniShare < 0.1) continue // candidato relevante no município (>=10%)
      const got = b.candidateVotes[cand] ?? 0
      if (got > 0) continue
      await upsertFinding({
        electionId,
        round: round ?? null,
        type: 'ZERO_VOTES_CANDIDATE',
        severity: 'MEDIUM',
        scope: 'SECTION',
        uf: b.uf,
        municipality: b.municipality,
        zone: b.zone,
        sectionId: b.sectionId,
        candidate: cand,
        title: `Zero votos para o candidato ${cand} em seção de comparecimento relevante`,
        description:
          `O candidato ${cand} tem ${(muniShare * 100).toFixed(1)}% dos votos no município, mas 0 voto nesta seção ` +
          `(comparecimento ${b.turnout}). Zero votos é normal para candidatos pequenos; aqui é sinalizado como possível ` +
          'incoerência por envolver candidato expressivo no município. Requer verificação da fonte oficial.',
        metric: muniShare * 100,
        detail: { municipalShare: muniShare, sectionTurnout: b.turnout, candidate: cand },
      })
      count++
    }
  }
  return { type: 'ZERO_VOTES_CANDIDATE', findings: count, scanned: bus.length }
}

// ------------------------------------------------------------------
// C) Abstenção atípica (baixa e alta) por UF e município
// ------------------------------------------------------------------
interface AbsAgg {
  uf: string
  municipality?: string
  eligible: number
  turnout: number
  sections: number
}

function summarizeAbstention(bus: BURow[]) {
  const byUf = new Map<string, AbsAgg>()
  const byMuni = new Map<string, AbsAgg>()
  for (const b of bus) {
    if (b.eligible <= 0) continue
    const u = byUf.get(b.uf) ?? { uf: b.uf, eligible: 0, turnout: 0, sections: 0 }
    u.eligible += b.eligible
    u.turnout += b.turnout
    u.sections++
    byUf.set(b.uf, u)
    const mk = `${b.uf}|${b.municipality}`
    const m = byMuni.get(mk) ?? { uf: b.uf, municipality: b.municipality, eligible: 0, turnout: 0, sections: 0 }
    m.eligible += b.eligible
    m.turnout += b.turnout
    m.sections++
    byMuni.set(mk, m)
  }
  return { byUf, byMuni }
}

export async function analyzeAbstention(electionId: string, round?: number | null) {
  const bus = await loadOfficialBUs(electionId)
  const e = await prisma.election.findUnique({ where: { id: electionId } })
  if (!e) return { type: 'ABSTENTION', findings: 0, scanned: 0 }
  const p = auditParams(e)
  const { byUf, byMuni } = summarizeAbstention(bus)
  let count = 0

  const emit = async (agg: AbsAgg, scope: AnomalyScope) => {
    if (agg.eligible <= 0 || agg.sections < MIN_SECTIONS_REGION) return
    const absPct = ((agg.eligible - agg.turnout) / agg.eligible) * 100
    const low = absPct < p.abstentionLowPct
    const high = absPct > p.abstentionHighPct
    if (!low && !high) return
    const type: AnomalyType = low ? 'LOW_ABSTENTION' : 'HIGH_ABSTENTION'
    const regiao = scope === 'UF' ? agg.uf : `${agg.municipality} (${agg.uf})`
    await upsertFinding({
      electionId,
      round: round ?? null,
      type,
      severity: 'LOW',
      scope,
      uf: agg.uf,
      municipality: scope === 'MUNICIPALITY' ? agg.municipality : null,
      title: `${low ? 'Abstenção atipicamente baixa' : 'Abstenção atipicamente alta'} em ${regiao}`,
      description:
        `Abstenção de ${absPct.toFixed(1)}% (${low ? 'abaixo' : 'acima'} do limiar de ` +
        `${low ? p.abstentionLowPct : p.abstentionHighPct}% configurado para esta eleição), ` +
        `sobre ${agg.sections} seções e ${agg.eligible} eleitores aptos. Indicador para acompanhamento regional.`,
      metric: absPct,
      detail: { eligible: agg.eligible, turnout: agg.turnout, sections: agg.sections, abstentionPct: absPct },
    })
    count++
  }

  for (const agg of byUf.values()) await emit(agg, 'UF')
  for (const agg of byMuni.values()) await emit(agg, 'MUNICIPALITY')
  return { type: 'ABSTENTION', findings: count, scanned: bus.length }
}

// ------------------------------------------------------------------
// D) Votação após o horário + liberação manual do mesário (do Log de Urna)
// ------------------------------------------------------------------
function minutesFromLogTimestamp(ts: string | null): number | null {
  if (!ts) return null
  // "DD/MM/AAAA HH:MM:SS"
  const m = ts.match(/\d{2}\/\d{2}\/\d{4}\s+(\d{2}):(\d{2})/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export async function analyzeAfterHours(electionId: string, round?: number | null) {
  const e = await prisma.election.findUnique({ where: { id: electionId } })
  if (!e) return { type: 'AFTER_HOURS', findings: 0, scanned: 0 }
  const p = auditParams(e)
  const cutoffOfficial = p.officialCloseMin
  const cutoffExtended = p.extendedCloseMin ?? p.officialCloseMin

  const logs = await prisma.officialArtifact.findMany({
    where: { electionId, type: 'LOG_URNA' },
    orderBy: { fetchedAt: 'desc' },
    take: 20000,
  })
  let count = 0
  for (const a of logs) {
    const raw = (a.rawData ?? {}) as Record<string, unknown>
    const geo = (raw.geo ?? {}) as { uf?: string; zone?: string; section?: string }
    const sectionId = (raw.sectionId as string) ?? null
    const flags = (raw.flags ?? {}) as Record<string, boolean>
    const notable = (raw.notable ?? []) as { timestamp: string | null; tag: string | null; message: string }[]

    // Liberação manual do mesário — sinalizada explicitamente.
    if (flags.manualRelease) {
      await upsertFinding({
        electionId,
        round: round ?? null,
        type: 'MANUAL_RELEASE_AFTER_HOURS',
        severity: 'HIGH',
        scope: 'SECTION',
        uf: geo.uf ?? null,
        zone: geo.zone ?? null,
        sectionId,
        title: 'Liberação manual do mesário registrada no log da urna',
        description:
          'O log da urna registra liberação/habilitação manual pelo mesário (voto permitido fora do fluxo automático). ' +
          'Possível irregularidade conforme o horário em que ocorreu; requer verificação da justificativa oficial.',
        detail: { geo, source: a.name },
      })
      count++
    }

    // Evento de encerramento/voto após o horário de corte.
    const closing = notable.filter((n) => n.tag === 'VOTACAO_FIM')
    let latest: number | null = null
    for (const n of closing) {
      const mm = minutesFromLogTimestamp(n.timestamp)
      if (mm != null) latest = latest == null ? mm : Math.max(latest, mm)
    }
    if (latest != null && latest > cutoffOfficial) {
      const beyondExtended = latest > cutoffExtended
      await upsertFinding({
        electionId,
        round: round ?? null,
        type: 'AFTER_HOURS_VOTING',
        severity: beyondExtended ? 'HIGH' : 'MEDIUM',
        scope: 'SECTION',
        uf: geo.uf ?? null,
        zone: geo.zone ?? null,
        sectionId,
        title: 'Encerramento da votação após o horário',
        description:
          `Encerramento registrado às ${String(Math.floor(latest / 60)).padStart(2, '0')}:` +
          `${String(latest % 60).padStart(2, '0')}, após o horário oficial de ${p.officialCloseTime}` +
          (p.extendedCloseTime ? ` (prorrogação autorizada até ${p.extendedCloseTime})` : '') +
          `. ${beyondExtended ? 'Além de qualquer prorrogação autorizada.' : 'Dentro da prorrogação autorizada — registrado para acompanhamento.'}`,
        metric: latest - cutoffOfficial,
        detail: { closingMinute: latest, cutoffOfficial, cutoffExtended, geo },
      })
      count++
    }
  }
  return { type: 'AFTER_HOURS', findings: count, scanned: logs.length }
}

// ------------------------------------------------------------------
// E) Suspeições: votos "espíritas" (comparecimento quase total) e concentração atípica
// ------------------------------------------------------------------
export async function analyzeSpiritVotes(electionId: string, round?: number | null) {
  const bus = await loadOfficialBUs(electionId)
  let count = 0
  for (const b of bus) {
    if (b.eligible < SECTION_TURNOUT_FLOOR) continue
    const ratio = b.turnout / b.eligible
    if (ratio < 0.98) continue
    await upsertFinding({
      electionId,
      round: round ?? null,
      type: 'SPIRIT_VOTE_PATTERN',
      severity: ratio >= 1 ? 'HIGH' : 'MEDIUM',
      scope: 'SECTION',
      uf: b.uf,
      municipality: b.municipality,
      zone: b.zone,
      sectionId: b.sectionId,
      title: 'Comparecimento quase total na seção (padrão atípico)',
      description:
        `Comparecimento de ${(ratio * 100).toFixed(1)}% (${b.turnout}/${b.eligible}). ` +
        'Comparecimento próximo de 100% é estatisticamente atípico e, popularmente, associado à hipótese de "votos espíritas". ' +
        'IMPORTANTE: é apenas um indicador — as urnas brasileiras não registram o voto individual auditável, logo isto NÃO é prova de irregularidade.',
      metric: ratio * 100,
      detail: { turnout: b.turnout, eligible: b.eligible, ratio },
    })
    count++
  }
  return { type: 'SPIRIT_VOTE_PATTERN', findings: count, scanned: bus.length }
}

export async function analyzeVoteBuying(electionId: string, round?: number | null) {
  const bus = await loadOfficialBUs(electionId)
  // Share municipal por candidato.
  const muni = new Map<string, { byCand: CandVotes; total: number }>()
  for (const b of bus) {
    const key = `${b.uf}|${b.municipality}`
    const agg = muni.get(key) ?? { byCand: {}, total: 0 }
    addVotes(agg.byCand, b.candidateVotes)
    agg.total += Object.values(b.candidateVotes).reduce((a, c) => a + c, 0)
    muni.set(key, agg)
  }
  let count = 0
  for (const b of bus) {
    const validVotes = Object.values(b.candidateVotes).reduce((a, c) => a + c, 0)
    if (validVotes < SECTION_TURNOUT_FLOOR) continue
    const top = Object.entries(b.candidateVotes).sort((a, c) => c[1] - a[1])[0]
    if (!top) continue
    const sectionShare = top[1] / validVotes
    if (sectionShare < 0.9) continue
    const key = `${b.uf}|${b.municipality}`
    const agg = muni.get(key)
    const muniShare = agg && agg.total > 0 ? (agg.byCand[top[0]] ?? 0) / agg.total : 0
    if (sectionShare - muniShare < 0.4) continue
    await upsertFinding({
      electionId,
      round: round ?? null,
      type: 'VOTE_BUYING_PATTERN',
      severity: 'MEDIUM',
      scope: 'SECTION',
      uf: b.uf,
      municipality: b.municipality,
      zone: b.zone,
      sectionId: b.sectionId,
      candidate: top[0],
      title: `Concentração atípica de votos no candidato ${top[0]}`,
      description:
        `O candidato ${top[0]} tem ${(sectionShare * 100).toFixed(1)}% dos votos válidos nesta seção, contra ` +
        `${(muniShare * 100).toFixed(1)}% no município (diferença de ${((sectionShare - muniShare) * 100).toFixed(1)} p.p.). ` +
        'Concentração muito acima da média local é um outlier estatístico que pode, em tese, associar-se a aliciamento/compra de votos. ' +
        'IMPORTANTE: é apenas um indicador estatístico, jamais prova — requer apuração própria pelas autoridades.',
      metric: (sectionShare - muniShare) * 100,
      detail: { sectionShare, muniShare, candidate: top[0], validVotes },
    })
    count++
  }
  return { type: 'VOTE_BUYING_PATTERN', findings: count, scanned: bus.length }
}

// ------------------------------------------------------------------
// F) Virada de 2º turno por região (ganho/perda vs 1º turno)
// ------------------------------------------------------------------
function shareByRegion(bus: BURow[]) {
  const byUf = new Map<string, { byCand: CandVotes; total: number; sections: number }>()
  const byMuni = new Map<string, { uf: string; municipality: string; byCand: CandVotes; total: number; sections: number }>()
  for (const b of bus) {
    const u = byUf.get(b.uf) ?? { byCand: {}, total: 0, sections: 0 }
    addVotes(u.byCand, b.candidateVotes)
    u.total += Object.values(b.candidateVotes).reduce((a, c) => a + c, 0)
    u.sections++
    byUf.set(b.uf, u)
    const mk = `${b.uf}|${b.municipality}`
    const m = byMuni.get(mk) ?? { uf: b.uf, municipality: b.municipality, byCand: {}, total: 0, sections: 0 }
    addVotes(m.byCand, b.candidateVotes)
    m.total += Object.values(b.candidateVotes).reduce((a, c) => a + c, 0)
    m.sections++
    byMuni.set(mk, m)
  }
  return { byUf, byMuni }
}

export async function secondRoundSwing(year: number) {
  const r1 = await getElectionByRound(year, 1)
  const r2 = await getElectionByRound(year, 2)
  if (!r1 || !r2) return { type: 'SECOND_ROUND_SWING', findings: 0, note: 'Requer 1º e 2º turnos cadastrados.' }
  const [bus1, bus2] = await Promise.all([loadOfficialBUs(r1.id), loadOfficialBUs(r2.id)])
  if (bus2.length === 0) return { type: 'SECOND_ROUND_SWING', findings: 0, note: 'Sem BUs oficiais do 2º turno.' }

  // Os dois candidatos do 2º turno (maiores totais nacionais no r2).
  const nat2: CandVotes = {}
  for (const b of bus2) addVotes(nat2, b.candidateVotes)
  const finalists = Object.entries(nat2).sort((a, c) => c[1] - a[1]).slice(0, 2).map(([c]) => c)
  if (finalists.length < 2) return { type: 'SECOND_ROUND_SWING', findings: 0, note: 'Menos de dois candidatos no 2º turno.' }

  const s1 = shareByRegion(bus1)
  const s2 = shareByRegion(bus2)
  let count = 0

  const emit = async (
    scope: AnomalyScope,
    uf: string,
    municipality: string | null,
    a1: { byCand: CandVotes; total: number; sections: number } | undefined,
    a2: { byCand: CandVotes; total: number; sections: number } | undefined,
  ) => {
    if (!a2 || a2.total <= 0 || a2.sections < MIN_SECTIONS_REGION) return
    const perCand = finalists.map((c) => {
      const sh1 = a1 && a1.total > 0 ? (a1.byCand[c] ?? 0) / a1.total : null
      const sh2 = (a2.byCand[c] ?? 0) / a2.total
      const deltaPp = sh1 == null ? null : (sh2 - sh1) * 100
      return { candidate: c, share1: sh1, share2: sh2, deltaPp }
    })
    const mover = perCand.filter((x) => x.deltaPp != null).sort((a, b) => Math.abs(b.deltaPp!) - Math.abs(a.deltaPp!))[0]
    if (!mover || mover.deltaPp == null) return
    const regiao = scope === 'UF' ? uf : `${municipality} (${uf})`
    const subiu = mover.deltaPp >= 0
    await upsertFinding({
      electionId: r2.id,
      round: 2,
      type: 'SECOND_ROUND_SWING',
      severity: 'LOW',
      scope,
      uf,
      municipality: scope === 'MUNICIPALITY' ? municipality : null,
      candidate: mover.candidate,
      title: `Virada entre turnos em ${regiao}: candidato ${mover.candidate} ${subiu ? 'cresceu' : 'caiu'} ${Math.abs(mover.deltaPp).toFixed(1)} p.p.`,
      description:
        `Comparativo 1º→2º turno em ${regiao}. Candidato ${mover.candidate} passou de ` +
        `${mover.share1 == null ? 'n/d' : (mover.share1 * 100).toFixed(1) + '%'} para ${(mover.share2 * 100).toFixed(1)}% ` +
        `(${subiu ? '+' : ''}${mover.deltaPp.toFixed(1)} p.p.). Dado comparativo para análise regional da virada.`,
      metric: mover.deltaPp,
      detail: { finalists, perCand, sections: a2.sections },
    })
    count++
  }

  for (const [uf, a2] of s2.byUf) await emit('UF', uf, null, s1.byUf.get(uf), a2)
  for (const [mk, a2] of s2.byMuni) await emit('MUNICIPALITY', a2.uf, a2.municipality, s1.byMuni.get(mk), a2)
  return { type: 'SECOND_ROUND_SWING', findings: count, finalists }
}

// ------------------------------------------------------------------
// I) Variação de abstenção entre turnos
// ------------------------------------------------------------------
export async function abstentionShift(year: number) {
  const r1 = await getElectionByRound(year, 1)
  const r2 = await getElectionByRound(year, 2)
  if (!r1 || !r2) return { type: 'ABSTENTION_SHIFT', findings: 0, note: 'Requer 1º e 2º turnos cadastrados.' }
  const [bus1, bus2] = await Promise.all([loadOfficialBUs(r1.id), loadOfficialBUs(r2.id)])
  if (bus2.length === 0) return { type: 'ABSTENTION_SHIFT', findings: 0, note: 'Sem BUs oficiais do 2º turno.' }
  const a1 = summarizeAbstention(bus1)
  const a2 = summarizeAbstention(bus2)
  let count = 0

  const absOf = (agg?: AbsAgg) => (agg && agg.eligible > 0 ? ((agg.eligible - agg.turnout) / agg.eligible) * 100 : null)

  const emit = async (scope: AnomalyScope, uf: string, municipality: string | null, g1?: AbsAgg, g2?: AbsAgg) => {
    if (!g2 || g2.sections < MIN_SECTIONS_REGION) return
    const p1 = absOf(g1)
    const p2 = absOf(g2)
    if (p1 == null || p2 == null) return
    const delta = p2 - p1
    if (Math.abs(delta) < 3) return // só variações relevantes (>=3 p.p.)
    const regiao = scope === 'UF' ? uf : `${municipality} (${uf})`
    await upsertFinding({
      electionId: r2.id,
      round: 2,
      type: 'ABSTENTION_SHIFT',
      severity: 'LOW',
      scope,
      uf,
      municipality: scope === 'MUNICIPALITY' ? municipality : null,
      title: `Variação de abstenção entre turnos em ${regiao}: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} p.p.`,
      description:
        `Abstenção passou de ${p1.toFixed(1)}% (1º turno) para ${p2.toFixed(1)}% (2º turno) em ${regiao}. ` +
        'Comparativo regional de comparecimento entre os turnos.',
      metric: delta,
      detail: { abstention1: p1, abstention2: p2, deltaPp: delta, sections: g2.sections },
    })
    count++
  }

  for (const [uf, g2] of a2.byUf) await emit('UF', uf, null, a1.byUf.get(uf), g2)
  for (const [mk, g2] of a2.byMuni) await emit('MUNICIPALITY', g2.uf, g2.municipality ?? null, a1.byMuni.get(mk), g2)
  return { type: 'ABSTENTION_SHIFT', findings: count }
}

// ------------------------------------------------------------------
// J) Espelhar urnas problemáticas (substituídas/danificadas/etc.) como achados
// ------------------------------------------------------------------
const URN_ISSUE_SEVERITY: Record<string, IncidentSeverity> = {
  ALTERED: 'HIGH',
  REPLACED: 'MEDIUM',
  DAMAGED: 'MEDIUM',
  DEFECTIVE: 'MEDIUM',
  NOT_INSTALLED: 'LOW',
  CONTINGENCY: 'LOW',
  OTHER: 'LOW',
}

export async function mirrorUrnReplacements(electionId: string) {
  const rows = await prisma.urnReplacement.findMany({ where: { electionId }, take: 50000 })
  let count = 0
  for (const r of rows) {
    const key = r.externalKey ?? r.id
    await upsertFinding({
      electionId,
      round: r.round ?? null,
      type: 'URN_REPLACED',
      severity: URN_ISSUE_SEVERITY[r.issueType] ?? 'LOW',
      scope: 'SECTION',
      uf: r.uf,
      municipality: r.municipality,
      zone: r.zone,
      sectionId: r.sectionId,
      candidate: null,
      title: `Urna ${r.issueType === 'REPLACED' ? 'substituída' : 'com ocorrência'} — ${r.uf} zona ${r.zone} seção ${r.section}`,
      description: `Ocorrência de urna (${r.issueType}). Justificativa: ${r.justification}`,
      detail: { issueType: r.issueType, ballotBoxId: r.ballotBoxId, occurredAt: r.occurredAt?.toISOString() ?? null, dedupeSource: key },
    })
    count++
  }
  return { type: 'URN_REPLACED', findings: count, scanned: rows.length }
}

// ------------------------------------------------------------------
// Orquestração
// ------------------------------------------------------------------
export async function runAnalysisSweep(electionId?: string) {
  const election = electionId ? await prisma.election.findUnique({ where: { id: electionId } }) : await getActiveElection()
  if (!election?.id) return { ran: false, note: 'Nenhuma eleição disponível.' }
  const id = election.id
  const round = election.round
  const results: Record<string, unknown>[] = []
  results.push(await analyzeVoteCeiling(id, round))
  results.push(await analyzeZeroVotes(id, round))
  results.push(await analyzeAbstention(id, round))
  results.push(await analyzeAfterHours(id, round))
  results.push(await analyzeSpiritVotes(id, round))
  results.push(await analyzeVoteBuying(id, round))
  results.push(await mirrorUrnReplacements(id))

  // Comparativos de turno — só quando há 2º turno do mesmo ano.
  const r2 = await getElectionByRound(election.year, 2)
  if (r2) {
    results.push(await secondRoundSwing(election.year) as unknown as Record<string, unknown>)
    results.push(await abstentionShift(election.year) as unknown as Record<string, unknown>)
  }
  return { ran: true, electionId: id, year: election.year, round, results }
}

/** Guard de frescor: roda a varredura no máximo a cada 6h (controle via JobQueue). */
export async function ensureAnalysisFresh() {
  try {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)
    const recent = await prisma.jobQueue.findFirst({
      where: { type: 'INGEST_TSE_DATA', createdAt: { gte: sixHoursAgo }, payload: { path: ['kind'], equals: 'analysis' } },
    })
    if (recent) return { skipped: true }
    await prisma.jobQueue.create({ data: { type: 'INGEST_TSE_DATA', payload: { kind: 'analysis' }, status: 'COMPLETED', completedAt: new Date() } })
    return await runAnalysisSweep()
  } catch (e) {
    console.error('ensureAnalysisFresh error', e)
    return { ran: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ------------------------------------------------------------------
// Leitura (para API e páginas)
// ------------------------------------------------------------------
export interface AnomalyFilters {
  type?: string
  severity?: string
  uf?: string
  scope?: string
  status?: string
}

export async function getAnomalySummary(electionId?: string) {
  const election = electionId ? { id: electionId } : await getActiveElection()
  if (!election?.id) return { total: 0, byType: [], bySeverity: [] }
  const where = { electionId: election.id }
  const [total, byType, bySeverity] = await Promise.all([
    prisma.anomalyFinding.count({ where }),
    prisma.anomalyFinding.groupBy({ by: ['type'], where, _count: { _all: true } }),
    prisma.anomalyFinding.groupBy({ by: ['severity'], where, _count: { _all: true } }),
  ])
  return jsonSafe({
    total,
    byType: byType.map((t) => ({ type: t.type, count: t._count._all })),
    bySeverity: bySeverity.map((s) => ({ severity: s.severity, count: s._count._all })),
  })
}

export async function listAnomalyFindings(f: AnomalyFilters, take = 300, electionId?: string) {
  const election = electionId ? { id: electionId } : await getActiveElection()
  if (!election?.id) return []
  const where: Prisma.AnomalyFindingWhereInput = {
    electionId: election.id,
    ...(f?.type ? { type: f.type as AnomalyType } : {}),
    ...(f?.severity ? { severity: f.severity as IncidentSeverity } : {}),
    ...(f?.uf ? { uf: f.uf } : {}),
    ...(f?.scope ? { scope: f.scope as AnomalyScope } : {}),
    ...(f?.status ? { status: f.status as never } : {}),
  }
  const rows = await prisma.anomalyFinding.findMany({
    where,
    orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
    take,
  })
  return jsonSafe(
    rows.map((r) => ({
      ...r,
      detectedAt: r.detectedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })),
  )
}

export async function listUrnReplacements(f: { uf?: string; issueType?: string }, take = 500, electionId?: string) {
  const election = electionId ? { id: electionId } : await getActiveElection()
  if (!election?.id) return []
  const rows = await prisma.urnReplacement.findMany({
    where: {
      electionId: election.id,
      ...(f?.uf ? { uf: f.uf } : {}),
      ...(f?.issueType ? { issueType: f.issueType as never } : {}),
    },
    orderBy: [{ uf: 'asc' }, { createdAt: 'desc' }],
    take,
  })
  return jsonSafe(
    rows.map((r) => ({
      ...r,
      occurredAt: r.occurredAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  )
}
