import { adminHandle } from '@/lib/admin-guard'
import { runDemoSeed } from '@/lib/demo-seed'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  return adminHandle(() => runDemoSeed(), 'ops.ingest.demo_seed')
}
