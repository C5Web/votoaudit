import { adminHandle } from '@/lib/admin-guard'
import { importTseCalendar } from '@/lib/tse-calendar'

export const dynamic = 'force-dynamic'

export async function POST() {
  return adminHandle(async () => importTseCalendar(), 'ops.ingest.tse_calendar')
}
