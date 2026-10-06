import { adminHandle } from '@/lib/admin-guard'
import { verifyAuditChain } from '@/lib/audit-log'

export const dynamic = 'force-dynamic'

export async function GET() {
  return adminHandle(() => verifyAuditChain())
}
