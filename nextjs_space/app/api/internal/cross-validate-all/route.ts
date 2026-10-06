import { adminHandle } from '@/lib/admin-guard'
import { crossValidateAll } from '@/lib/cross-validation'
import { getCurrentElection } from '@/lib/queries'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  return adminHandle(async () => {
    const election = await getCurrentElection()
    const r = await crossValidateAll(election?.id)
    await prisma.jobQueue.create({
      data: { type: 'CROSS_VALIDATE_SECTION', payload: { scope: 'all', trigger: 'admin', ...r }, status: 'COMPLETED', attempts: 1, completedAt: new Date() },
    })
    return r
  }, 'ops.cross_validate_all')
}
