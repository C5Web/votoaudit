import { handle } from '@/lib/api'
import { getLatestValidation } from '@/lib/queries'
import { crossValidateSection } from '@/lib/cross-validation'
import { requireAdmin } from '@/lib/authz'

export const dynamic = 'force-dynamic'

/** Retorna o último resultado de cross-validation. `?recompute=1` (admin) recalcula. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const recompute = new URL(req.url).searchParams.get('recompute') === '1'
  return handle(async () => {
    if (recompute) {
      if (!(await requireAdmin())) throw Object.assign(new Error('Acesso restrito a administradores.'), { status: 403 })
      await crossValidateSection(id)
    }
    let latest = await getLatestValidation(id)
    if (!latest) {
      await crossValidateSection(id)
      latest = await getLatestValidation(id)
    }
    return latest
  })
}
