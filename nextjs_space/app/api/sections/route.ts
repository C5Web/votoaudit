import { handle } from '@/lib/api'
import { listSections } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  return handle(() =>
    listSections({
      uf: sp.get('uf') ?? undefined,
      municipality: sp.get('municipality') ?? undefined,
      zone: sp.get('zone') ?? undefined,
      status: sp.get('status') ?? undefined,
      page: Number(sp.get('page') ?? 1) || 1,
      pageSize: Number(sp.get('pageSize') ?? 15) || 15,
    })
  )
}
