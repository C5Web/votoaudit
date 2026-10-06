import { handle } from '@/lib/api'
import { getLatestValidation, getSectionBUs } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params
  return handle(async () => {
    const [bus, validation] = await Promise.all([getSectionBUs(sectionId), getLatestValidation(sectionId)])
    return {
      sectionId,
      official: bus.official,
      citizen: bus.citizen,
      result: validation?.result ?? 'PENDING',
      confidenceLevel: validation?.confidenceLevel ?? 'LOW',
      diff: validation?.diffDetails ?? null,
    }
  })
}
