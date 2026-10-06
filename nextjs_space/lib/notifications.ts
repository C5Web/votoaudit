/**
 * Backend de notificações do VotoAudit.
 *
 * Canais: WEBPUSH (Web Push / VAPID — usado também pelo app mobile) e EMAIL (reserva).
 * Gatilhos: evento oficial de auditoria publicado, lembrete às vésperas do evento e
 * atualizações de incidentes acompanhados.
 *
 * Idempotência: toda notificação tem um `dedupeKey` único; reenfileirar é no-op.
 * A entrega é feita por `dispatchPending`, acionada pelo painel admin ou por tarefa agendada.
 *
 * A lógica de negócio fica aqui (migração futura para FastAPI); as rotas apenas a chamam.
 */
import webpush from 'web-push'
import type { AuditEvent, NotificationType } from '@prisma/client'
import { prisma } from './db'
import { sendUserEmail, emailLayout, appBaseUrl } from './notify'

let vapidConfigured: boolean | null = null

/** Configura o VAPID uma única vez; retorna false se as chaves não estiverem no ambiente. */
function ensureVapid(): boolean {
  if (vapidConfigured !== null) return vapidConfigured
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@votoaudit.com.br'
  if (pub && priv) {
    try {
      webpush.setVapidDetails(subject, pub, priv)
      vapidConfigured = true
    } catch {
      vapidConfigured = false
    }
  } else {
    vapidConfigured = false
  }
  return vapidConfigured
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null
}

// ------------------------------------------------------------------
// Preferências e inscrições
// ------------------------------------------------------------------

export async function getOrCreatePreference(collectorId: string) {
  const existing = await prisma.notificationPreference.findUnique({ where: { collectorId } })
  if (existing) return existing
  return prisma.notificationPreference.create({ data: { collectorId } })
}

export interface PreferencePatch {
  eventPublished?: boolean
  eventReminder?: boolean
  incidentUpdates?: boolean
  reminderHoursBefore?: number
  emailFallback?: boolean
}

export async function updatePreference(collectorId: string, patch: PreferencePatch) {
  const data: PreferencePatch = {}
  if (typeof patch.eventPublished === 'boolean') data.eventPublished = patch.eventPublished
  if (typeof patch.eventReminder === 'boolean') data.eventReminder = patch.eventReminder
  if (typeof patch.incidentUpdates === 'boolean') data.incidentUpdates = patch.incidentUpdates
  if (typeof patch.emailFallback === 'boolean') data.emailFallback = patch.emailFallback
  if (typeof patch.reminderHoursBefore === 'number' && Number.isFinite(patch.reminderHoursBefore)) {
    data.reminderHoursBefore = Math.min(168, Math.max(1, Math.trunc(patch.reminderHoursBefore)))
  }
  return prisma.notificationPreference.upsert({
    where: { collectorId },
    create: { collectorId, ...data },
    update: data,
  })
}

export interface SubscriptionInput {
  collectorId?: string | null
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string | null
  uf?: string | null
}

/** Registra (ou reativa) uma inscrição de push. Única por endpoint. */
export async function saveSubscription(input: SubscriptionInput) {
  const uf = input.uf ? input.uf.trim().toUpperCase().slice(0, 2) : null
  return prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
      uf,
      collectorId: input.collectorId ?? null,
      active: true,
    },
    update: {
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
      uf,
      collectorId: input.collectorId ?? null,
      active: true,
      lastUsedAt: new Date(),
    },
  })
}

export async function removeSubscription(endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } })
  return { removed: true }
}

// ------------------------------------------------------------------
// Enfileiramento idempotente
// ------------------------------------------------------------------

export interface EnqueueInput {
  collectorId?: string | null
  type: NotificationType
  channel: 'WEBPUSH' | 'EMAIL'
  title: string
  body: string
  data?: Record<string, unknown>
  dedupeKey: string
}

/** Cria a notificação se o dedupeKey ainda não existir. Retorna true se criou. */
export async function enqueueNotification(input: EnqueueInput): Promise<boolean> {
  try {
    await prisma.notification.create({
      data: {
        collectorId: input.collectorId ?? null,
        type: input.type,
        channel: input.channel,
        title: input.title,
        body: input.body,
        data: (input.data ?? {}) as object,
        dedupeKey: input.dedupeKey,
      },
    })
    return true
  } catch (e) {
    // violação de unique (dedupeKey) => já enfileirada
    if ((e as { code?: string })?.code === 'P2002') return false
    throw e
  }
}

// ------------------------------------------------------------------
// Gatilhos
// ------------------------------------------------------------------

function eventTitle(ev: AuditEvent): string {
  const local = [ev.municipality, ev.uf].filter(Boolean).join('/')
  return local ? `Auditoria em ${local}` : 'Evento de auditoria'
}

function eventBody(ev: AuditEvent, kind: 'published' | 'reminder'): string {
  const when = ev.scheduledStart ? new Date(ev.scheduledStart).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }) : ''
  const venue = ev.venue ? ` em ${ev.venue}` : ''
  return kind === 'published'
    ? `Novo evento oficial de auditoria${venue}, previsto para ${when}.`
    : `Lembrete: evento de auditoria${venue} começa em ${when}.`
}

/** Coletores inscritos (preferência ligada) relevantes para o tipo e a UF do evento. */
async function collectorRecipients(prefField: 'eventPublished' | 'eventReminder', uf?: string | null) {
  const prefs = await prisma.notificationPreference.findMany({
    where: { [prefField]: true } as Record<string, boolean>,
    include: { collector: { include: { user: { select: { email: true } } } } },
  })
  return prefs
    .filter((p) => !p.collector?.suspendedAt)
    .filter((p) => !p.collector?.uf || !uf || p.collector.uf === uf)
    .map((p) => ({
      collectorId: p.collectorId,
      email: p.collector?.user?.email ?? null,
      emailFallback: p.emailFallback,
      reminderHoursBefore: p.reminderHoursBefore,
    }))
}

/** Inscrições anônimas (sem coletor) ativas, filtradas por UF quando informada. */
async function anonymousSubscriptions(uf?: string | null) {
  return prisma.pushSubscription.findMany({
    where: { active: true, collectorId: null, ...(uf ? { OR: [{ uf }, { uf: null }] } : {}) },
  })
}

/** Enfileira notificações de “evento publicado”. Idempotente por evento+destinatário. */
export async function notifyEventPublished(ev: AuditEvent): Promise<{ queued: number }> {
  let queued = 0
  const recipients = await collectorRecipients('eventPublished', ev.uf)
  for (const r of recipients) {
    if (await enqueueNotification({
      collectorId: r.collectorId,
      type: 'EVENT_PUBLISHED',
      channel: 'WEBPUSH',
      title: eventTitle(ev),
      body: eventBody(ev, 'published'),
      data: { eventId: ev.id, url: '/eventos' },
      dedupeKey: `evpub:${ev.id}:${r.collectorId}`,
    })) queued++
    if (r.emailFallback && r.email) {
      if (await enqueueNotification({
        collectorId: r.collectorId,
        type: 'EVENT_PUBLISHED',
        channel: 'EMAIL',
        title: eventTitle(ev),
        body: eventBody(ev, 'published'),
        data: { eventId: ev.id, email: r.email },
        dedupeKey: `evpub:${ev.id}:${r.collectorId}:email`,
      })) queued++
    }
  }
  const anon = await anonymousSubscriptions(ev.uf)
  for (const s of anon) {
    if (await enqueueNotification({
      type: 'EVENT_PUBLISHED',
      channel: 'WEBPUSH',
      title: eventTitle(ev),
      body: eventBody(ev, 'published'),
      data: { eventId: ev.id, url: '/eventos', subscriptionId: s.id },
      dedupeKey: `evpub:${ev.id}:sub:${s.id}`,
    })) queued++
  }
  return { queued }
}

/** Varredura de lembretes: eventos próximos dentro da janela de cada coletor. */
export async function runEventReminders(now = new Date()): Promise<{ queued: number; events: number }> {
  const maxWindowMs = 168 * 3600_000 // 7 dias
  const horizon = new Date(now.getTime() + maxWindowMs)
  const events = await prisma.auditEvent.findMany({
    where: { scheduledStart: { gt: now, lte: horizon }, status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
  })
  let queued = 0
  for (const ev of events) {
    const recipients = await collectorRecipients('eventReminder', ev.uf)
    for (const r of recipients) {
      const triggerAt = new Date(new Date(ev.scheduledStart).getTime() - r.reminderHoursBefore * 3600_000)
      if (now < triggerAt) continue
      if (await enqueueNotification({
        collectorId: r.collectorId,
        type: 'EVENT_REMINDER',
        channel: 'WEBPUSH',
        title: eventTitle(ev),
        body: eventBody(ev, 'reminder'),
        data: { eventId: ev.id, url: '/eventos' },
        dedupeKey: `evrem:${ev.id}:${r.collectorId}`,
      })) queued++
      if (r.emailFallback && r.email) {
        if (await enqueueNotification({
          collectorId: r.collectorId,
          type: 'EVENT_REMINDER',
          channel: 'EMAIL',
          title: eventTitle(ev),
          body: eventBody(ev, 'reminder'),
          data: { eventId: ev.id, email: r.email },
          dedupeKey: `evrem:${ev.id}:${r.collectorId}:email`,
        })) queued++
      }
    }
  }
  return { queued, events: events.length }
}

// ------------------------------------------------------------------
// Entrega
// ------------------------------------------------------------------

async function deliverWebpush(collectorId: string | null, subscriptionId: string | null, title: string, body: string, data: Record<string, unknown>): Promise<'SENT' | 'SKIPPED' | 'FAILED'> {
  if (!ensureVapid()) return 'SKIPPED'
  const subs = subscriptionId
    ? await prisma.pushSubscription.findMany({ where: { id: subscriptionId, active: true } })
    : collectorId
      ? await prisma.pushSubscription.findMany({ where: { collectorId, active: true } })
      : []
  if (subs.length === 0) return 'SKIPPED'
  const payload = JSON.stringify({ title, body, ...data })
  let anySent = false
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
      anySent = true
      await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } })
    } catch (e) {
      const code = (e as { statusCode?: number })?.statusCode
      if (code === 404 || code === 410) {
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { active: false } }).catch(() => {})
      }
    }
  }
  return anySent ? 'SENT' : 'FAILED'
}

/** Processa notificações PENDENTES, entregando por push/e-mail. Seguro para reexecução. */
export async function dispatchPending(limit = 100): Promise<{ sent: number; failed: number; skipped: number }> {
  const pending = await prisma.notification.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: Math.min(500, Math.max(1, limit)),
  })
  let sent = 0, failed = 0, skipped = 0
  for (const n of pending) {
    const data = (n.data ?? {}) as Record<string, unknown>
    let result: 'SENT' | 'SKIPPED' | 'FAILED' = 'SKIPPED'
    try {
      if (n.channel === 'WEBPUSH') {
        result = await deliverWebpush(n.collectorId, (data.subscriptionId as string) ?? null, n.title, n.body, { url: (data.url as string) ?? '/eventos', type: n.type })
      } else if (n.channel === 'EMAIL') {
        const to = (data.email as string) || ''
        const url = `${appBaseUrl()}${(data.url as string) ?? '/eventos'}`
        const html = emailLayout(n.title, [n.body], { label: 'Ver no VotoAudit', url })
        const okEmail = await sendUserEmail(process.env.NOTIF_ID_ALERTAS_DE_AUDITORIA, to, n.title, html)
        result = okEmail ? 'SENT' : 'SKIPPED'
      }
    } catch (e) {
      result = 'FAILED'
      await prisma.notification.update({ where: { id: n.id }, data: { error: e instanceof Error ? e.message.slice(0, 300) : String(e) } }).catch(() => {})
    }
    await prisma.notification.update({
      where: { id: n.id },
      data: { status: result === 'SENT' ? 'SENT' : result === 'FAILED' ? 'FAILED' : 'SKIPPED', sentAt: result === 'SENT' ? new Date() : null },
    }).catch(() => {})
    if (result === 'SENT') sent++
    else if (result === 'FAILED') failed++
    else skipped++
  }
  return { sent, failed, skipped }
}

/** Executa a varredura de lembretes e entrega o que estiver pendente. */
export async function runNotificationsSweep(): Promise<{ reminders: Awaited<ReturnType<typeof runEventReminders>>; delivery: Awaited<ReturnType<typeof dispatchPending>> }> {
  const reminders = await runEventReminders()
  const delivery = await dispatchPending(200)
  return { reminders, delivery }
}

// ------------------------------------------------------------------
// Calendário (.ics)
// ------------------------------------------------------------------

function icsEscape(s: string): string {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Gera um feed .ics com os eventos de auditoria (para assinatura em agendas). */
export async function buildEventsIcs(uf?: string | null): Promise<string> {
  const events = await prisma.auditEvent.findMany({
    where: { ...(uf ? { uf } : {}) },
    orderBy: { scheduledStart: 'asc' },
    take: 1000,
  })
  const base = appBaseUrl() || 'https://votoaudit.abacusai.app'
  const host = (() => { try { return new URL(base).hostname } catch { return 'votoaudit.abacusai.app' } })()
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VotoAudit//Eventos de Auditoria 2026//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:VotoAudit — Eventos de Auditoria',
  ]
  for (const ev of events) {
    const start = new Date(ev.scheduledStart)
    const end = ev.scheduledEnd ? new Date(ev.scheduledEnd) : new Date(start.getTime() + 2 * 3600_000)
    const loc = [ev.venue, ev.address, ev.municipality, ev.uf].filter(Boolean).join(', ')
    const descParts = [ev.officialOrganizer ? `Organização: ${ev.officialOrganizer}` : '', ev.officialSourceUrl ? `Fonte: ${ev.officialSourceUrl}` : '', `${base}/eventos`].filter(Boolean)
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.id}@${host}`,
      `DTSTAMP:${icsDate(new Date(ev.createdAt))}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(eventTitle(ev))}`,
      `DESCRIPTION:${icsEscape(descParts.join('\n'))}`,
      loc ? `LOCATION:${icsEscape(loc)}` : '',
      ev.officialSourceUrl ? `URL:${icsEscape(ev.officialSourceUrl)}` : '',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.filter(Boolean).join('\r\n')
}
