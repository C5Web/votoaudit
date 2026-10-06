import { buildEventsIcs } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

/**
 * Calendário público dos eventos oficiais de auditoria no formato iCalendar (.ics).
 * Pode ser assinado em qualquer agenda. Filtro opcional por UF: ?uf=SP
 */
export async function GET(req: Request) {
  const uf = new URL(req.url).searchParams.get('uf')
  const ics = await buildEventsIcs(uf)
  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="votoaudit-eventos.ics"',
      'Cache-Control': 'public, max-age=1800',
    },
  })
}
