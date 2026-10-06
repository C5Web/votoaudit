/**
 * Importador do calendário oficial de atos fiscalizáveis das Eleições 2026.
 *
 * Fontes:
 *  - Res. TSE nº 23.760/2026 (calendário eleitoral), alterada pela Res. nº 23.771/2026.
 *  - Editais e normas dos TREs (carga e lacração, teste de integridade).
 *
 * O TSE não publica o calendário como API; as datas nacionais são transcritas da resolução
 * e os atos regionais são gerados para as 27 UFs a partir das janelas do calendário.
 * A importação é idempotente (chave `externalKey`) e recalcula o status pela data atual.
 * Na VPS, basta um cron chamando POST /api/internal/ingest/tse-calendar.
 */
import type { AuditEventStatus, AuditEventType } from '@prisma/client'
import { notifyEventPublished } from './notifications'
import { prisma } from './db'
import { UF_INFO } from './constants'

export const TSE_CALENDAR_URL = 'https://www.tse.jus.br/legislacao/compilada/res/2026/resolucao-no-23-760-de-2-de-marco-de-2026'
const FRESH_MS = 6 * 60 * 60 * 1000

interface CalendarItem {
  key: string
  round: 1 | 2
  type: AuditEventType
  uf: string
  organizer: string
  municipality: string | null
  venue: string
  start: string
  end: string | null
  publicAccess: boolean
  source: string
}

const br = (d: string) => `${d}-03:00`

function nationalItems(): CalendarItem[] {
  const base = { uf: 'DF', organizer: 'TSE', municipality: 'Brasília', source: TSE_CALENDAR_URL }
  return [
    { ...base, key: 'tse:verificacao-totalizacao', round: 1, type: 'TOTALIZATION_AUDIT', venue: 'Sede do TSE — Cerimônia de verificação do sistema de totalização, receptor de arquivos e transportador', start: br('2026-09-03T10:00:00'), end: br('2026-09-03T18:00:00'), publicAccess: false },
    { ...base, key: 'tse:lacracao-sistemas', round: 1, type: 'SOURCE_INSPECTION', venue: 'Sede do TSE — Assinatura digital e lacração dos sistemas eleitorais (prazo-limite do calendário)', start: br('2026-09-14T10:00:00'), end: br('2026-09-14T18:00:00'), publicAccess: false },
    { ...base, key: 'tse:totalizacao-t1', round: 1, type: 'TOTALIZATION_AUDIT', venue: 'Sede do TSE — Totalização e divulgação dos resultados do 1º turno', start: br('2026-10-04T17:00:00'), end: br('2026-10-04T23:59:00'), publicAccess: false },
    { ...base, key: 'tse:totalizacao-t2', round: 2, type: 'TOTALIZATION_AUDIT', venue: 'Sede do TSE — Totalização e divulgação dos resultados do 2º turno', start: br('2026-10-25T17:00:00'), end: br('2026-10-25T23:59:00'), publicAccess: false },
  ]
}

function regionalItems(): CalendarItem[] {
  return Object.keys(UF_INFO).sort().flatMap((uf) => {
    const tre = `TRE-${uf}`
    const source = `https://www.tre-${uf.toLowerCase()}.jus.br/`
    const common = { uf, organizer: tre, municipality: null, publicAccess: true, source }
    return [
      { ...common, key: `${uf}:carga-t1`, round: 1, type: 'BALLOT_BOX_PREPARATION', venue: `Zonas eleitorais — geração de mídias, carga e lacração. Datas e locais exatos no edital do ${tre}`, start: br('2026-09-23T09:00:00'), end: br('2026-10-02T18:00:00') },
      { ...common, key: `${uf}:integridade-t1`, round: 1, type: 'INTEGRITY_TEST', venue: `Local definido pelo ${tre} (em geral, a sede do tribunal)`, start: br('2026-10-04T07:00:00'), end: br('2026-10-04T17:00:00') },
      { ...common, key: `${uf}:carga-t2`, round: 2, type: 'BALLOT_BOX_PREPARATION', venue: `Zonas eleitorais — carga e lacração para o 2º turno (se houver). Datas e locais no edital do ${tre}`, start: br('2026-10-14T09:00:00'), end: br('2026-10-23T18:00:00') },
      { ...common, key: `${uf}:integridade-t2`, round: 2, type: 'INTEGRITY_TEST', venue: `Local definido pelo ${tre} (em geral, a sede do tribunal)`, start: br('2026-10-25T07:00:00'), end: br('2026-10-25T17:00:00') },
    ] as CalendarItem[]
  })
}

export function officialCalendar(): CalendarItem[] {
  return [...nationalItems(), ...regionalItems()]
}

function statusFor(start: Date, end: Date | null, now: Date): AuditEventStatus {
  if (now < start) return 'SCHEDULED'
  if (end && now <= end) return 'IN_PROGRESS'
  return 'COMPLETED'
}

export async function importTseCalendar() {
  const elections = await prisma.election.findMany({ where: { year: 2026 }, select: { id: true, round: true } })
  const byRound = new Map(elections.map((e) => [e.round, e.id]))
  if (!byRound.get(1)) throw new Error('Eleição 2026 não encontrada. Rode a ingestão inicial.')

  const items = officialCalendar()
  const existing = await prisma.auditEvent.findMany({
    where: { externalKey: { in: items.map((i) => i.key) } },
    select: { id: true, externalKey: true, status: true },
  })
  const byKey = new Map(existing.map((e) => [e.externalKey, e]))
  const now = new Date()
  let created = 0
  let updated = 0

  for (const it of items) {
    const start = new Date(it.start)
    const end = it.end ? new Date(it.end) : null
    const prev = byKey.get(it.key)
    const status = prev?.status === 'CANCELLED' ? 'CANCELLED' : statusFor(start, end, now)
    const data = {
      electionId: byRound.get(it.round) ?? byRound.get(1)!,
      type: it.type,
      officialOrganizer: it.organizer,
      uf: it.uf,
      municipality: it.municipality,
      venue: it.venue,
      scheduledStart: start,
      scheduledEnd: end,
      publicAccess: it.publicAccess,
      officialSourceUrl: it.source,
      status,
    }
    if (prev) {
      await prisma.auditEvent.update({ where: { id: prev.id }, data })
      updated++
    } else {
      const ev = await prisma.auditEvent.create({ data: { ...data, externalKey: it.key } })
      created++
      // Notifica os inscritos sobre o novo evento oficial (idempotente via dedupeKey).
      try {
        await notifyEventPublished(ev)
      } catch (e) {
        console.error('Falha ao enfileirar notificação de evento publicado', e)
      }
    }
  }
  return { total: items.length, created, updated, source: TSE_CALENDAR_URL }
}

/** Garante que o calendário foi importado nas últimas 6 h; registra a execução na fila de jobs. */
export async function ensureCalendarFresh() {
  const last = await prisma.jobQueue.findFirst({
    where: { type: 'INGEST_TSE_DATA', status: 'COMPLETED', payload: { path: ['kind'], equals: 'calendar' } },
    orderBy: { completedAt: 'desc' },
    select: { completedAt: true },
  })
  if (last?.completedAt && Date.now() - last.completedAt.getTime() < FRESH_MS) return null
  const result = await importTseCalendar()
  await prisma.jobQueue.create({
    data: { type: 'INGEST_TSE_DATA', payload: { kind: 'calendar', auto: true }, status: 'COMPLETED', attempts: 1, completedAt: new Date() },
  })
  return result
}
