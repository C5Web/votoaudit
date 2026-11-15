/**
 * Importador do calendário de atos fiscalizáveis das eleições — ELECTION-AGNOSTIC.
 *
 * O TSE não publica o calendário como API. Em vez de datas fixas por ano, este módulo
 * DERIVA os atos de cada eleição cadastrada a partir da sua data de pleito
 * (`Election.electionDate`) e dos parâmetros configuráveis (horário de encerramento,
 * fuso). Assim, para a próxima eleição basta cadastrá-la — nada precisa ser alterado
 * no código.
 *
 * Janelas derivadas (relativas ao dia do pleito D de cada turno):
 *  - Carga e lacração das urnas: D-11 a D-2 (edital de cada TRE define datas/locais exatos).
 *  - Teste de integridade (com biometria): no dia D, 07:00 até o horário de encerramento.
 *  - Totalização e divulgação (TSE): no dia D, a partir do horário de encerramento.
 *  - (Apenas 1º turno do ciclo) verificação do sistema de totalização (D-31) e
 *    assinatura/lacração dos sistemas (D-20).
 *
 * A importação é idempotente (chave `externalKey`) e recalcula o status pela data atual.
 * Eventos de calendário obsoletos (de esquemas antigos) são removidos com segurança,
 * exceto os que já possuem relatos vinculados. Na VPS, basta um cron chamando
 * POST /api/internal/ingest/tse-calendar.
 */
import type { AuditEventStatus, AuditEventType, Election } from '@prisma/client'
import { notifyEventPublished } from './notifications'
import { prisma } from './db'
import { UF_INFO } from './constants'
import { auditParams } from './election-config'

export const TSE_CALENDAR_URL = 'https://www.tse.jus.br/eleicoes/calendario-eleitoral'
const FRESH_MS = 6 * 60 * 60 * 1000

interface CalendarItem {
  key: string
  electionId: string
  type: AuditEventType
  uf: string
  organizer: string
  municipality: string | null
  venue: string
  start: Date
  end: Date | null
  publicAccess: boolean
  source: string
}

/** Partes YYYY-MM-DD da data do pleito no fuso da eleição. */
function ymdInTz(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** Soma `days` a uma data YYYY-MM-DD, devolvendo YYYY-MM-DD. */
function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d, 12))
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

/**
 * Constrói um Date a partir de YYYY-MM-DD + HH:mm no fuso da eleição.
 * As eleições brasileiras usam UTC-03:00 (o horário de verão foi extinto em 2019);
 * mantemos o offset explícito e deixamos o fuso configurável para exibição.
 */
function at(ymd: string, hhmm: string): Date {
  return new Date(`${ymd}T${hhmm}:00-03:00`)
}

function buildElectionItems(e: Election): CalendarItem[] {
  const p = auditParams(e)
  const D = ymdInTz(e.electionDate, p.timezone)
  const close = p.officialCloseTime
  const src = e.calendarSourceUrl || TSE_CALENDAR_URL
  const yr = e.year
  const r = e.round
  const items: CalendarItem[] = []

  // Atos nacionais (TSE)
  items.push({
    key: `tse:${yr}:r${r}:totalizacao`,
    electionId: e.id,
    type: 'TOTALIZATION_AUDIT',
    uf: 'DF',
    organizer: 'TSE',
    municipality: 'BRASÍLIA',
    venue: `Sede do TSE — Totalização e divulgação dos resultados (${r}º turno)`,
    start: at(D, close),
    end: at(D, '23:59'),
    publicAccess: false,
    source: src,
  })
  if (r === 1) {
    items.push(
      {
        key: `tse:${yr}:verificacao-totalizacao`,
        electionId: e.id,
        type: 'TOTALIZATION_AUDIT',
        uf: 'DF',
        organizer: 'TSE',
        municipality: 'BRASÍLIA',
        venue: 'Sede do TSE — Cerimônia de verificação do sistema de totalização, receptor de arquivos e transportador',
        start: at(addDays(D, -31), '10:00'),
        end: at(addDays(D, -31), '18:00'),
        publicAccess: false,
        source: src,
      },
      {
        key: `tse:${yr}:lacracao-sistemas`,
        electionId: e.id,
        type: 'SOURCE_INSPECTION',
        uf: 'DF',
        organizer: 'TSE',
        municipality: 'BRASÍLIA',
        venue: 'Sede do TSE — Assinatura digital e lacração dos sistemas eleitorais',
        start: at(addDays(D, -20), '10:00'),
        end: at(addDays(D, -20), '18:00'),
        publicAccess: false,
        source: src,
      },
    )
  }

  // Atos regionais por UF (carga/lacração e teste de integridade)
  for (const uf of Object.keys(UF_INFO).sort()) {
    const tre = `TRE-${uf}`
    const treSrc = `https://www.tre-${uf.toLowerCase()}.jus.br/`
    items.push(
      {
        key: `${uf}:${yr}:r${r}:carga`,
        electionId: e.id,
        type: 'BALLOT_BOX_PREPARATION',
        uf,
        organizer: tre,
        municipality: null,
        venue: `Zonas eleitorais — geração de mídias, carga e lacração. Datas e locais exatos no edital do ${tre}`,
        start: at(addDays(D, -11), '09:00'),
        end: at(addDays(D, -2), '18:00'),
        publicAccess: true,
        source: treSrc,
      },
      {
        key: `${uf}:${yr}:r${r}:integridade`,
        electionId: e.id,
        type: 'INTEGRITY_TEST',
        uf,
        organizer: tre,
        municipality: null,
        venue: `Teste de integridade das urnas — local definido pelo ${tre} (em geral, a sede do tribunal)`,
        start: at(D, '07:00'),
        end: at(D, close),
        publicAccess: true,
        source: treSrc,
      },
    )
  }
  return items
}

function statusFor(start: Date, end: Date | null, now: Date): AuditEventStatus {
  if (now < start) return 'SCHEDULED'
  if (end && now <= end) return 'IN_PROGRESS'
  return 'COMPLETED'
}

export async function importTseCalendar() {
  const elections = await prisma.election.findMany({ orderBy: [{ year: 'asc' }, { round: 'asc' }] })
  if (elections.length === 0) throw new Error('Nenhuma eleição cadastrada. Rode a ingestão inicial.')

  const items = elections.flatMap(buildElectionItems)
  const keys = items.map((i) => i.key)
  const existing = await prisma.auditEvent.findMany({
    where: { externalKey: { in: keys } },
    select: { id: true, externalKey: true, status: true },
  })
  const byKey = new Map(existing.map((e) => [e.externalKey, e]))
  const now = new Date()
  let created = 0
  let updated = 0

  for (const it of items) {
    const prev = byKey.get(it.key)
    const status = prev?.status === 'CANCELLED' ? 'CANCELLED' : statusFor(it.start, it.end, now)
    const data = {
      electionId: it.electionId,
      type: it.type,
      officialOrganizer: it.organizer,
      uf: it.uf,
      municipality: it.municipality,
      venue: it.venue,
      scheduledStart: it.start,
      scheduledEnd: it.end,
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
      try {
        await notifyEventPublished(ev)
      } catch (e) {
        console.error('Falha ao enfileirar notificação de evento publicado', e)
      }
    }
  }

  // Remove eventos de calendário obsoletos (de esquemas de chave antigos), preservando
  // qualquer um que já tenha relatos vinculados (AVPART) para não violar integridade.
  let pruned = 0
  const stale = await prisma.auditEvent.findMany({
    where: { externalKey: { not: null }, NOT: { externalKey: { in: keys } } },
    select: { id: true, _count: { select: { avpartReports: true } } },
  })
  const deletable = stale.filter((s) => (s._count?.avpartReports ?? 0) === 0).map((s) => s.id)
  if (deletable.length) {
    const res = await prisma.auditEvent.deleteMany({ where: { id: { in: deletable } } })
    pruned = res.count
  }

  return { total: items.length, created, updated, pruned, source: TSE_CALENDAR_URL }
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
