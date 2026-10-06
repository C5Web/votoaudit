import { adminHandle } from '@/lib/admin-guard'
import { prisma } from '@/lib/db'
import { processPendingJobs, enqueueJob } from '@/lib/jobs'

export const dynamic = 'force-dynamic'

export async function GET() {
  return adminHandle(async () => ({ items: await prisma.jobQueue.findMany({ orderBy: { id: 'desc' }, take: 100 }) }))
}

/** body: { action: 'process' } ou { action: 'enqueue', type, payload } */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string; type?: string; payload?: Record<string, string> }
  return adminHandle(async () => {
    if (body?.action === 'enqueue' && (body?.type === 'CROSS_VALIDATE_SECTION' || body?.type === 'INGEST_TSE_DATA')) {
      return enqueueJob(body.type, body?.payload ?? {})
    }
    return processPendingJobs()
  }, `ops.jobs.${body?.action === 'enqueue' ? 'enqueue' : 'process'}`)
}
