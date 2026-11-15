import { adminHandle } from '@/lib/admin-guard'
import { clearDemoData } from '@/lib/demo-seed'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  return adminHandle(() => clearDemoData(), 'ops.clear_demo')
}
