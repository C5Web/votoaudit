import { prisma } from '@/lib/db'
import { fail, handle } from '@/lib/api'
import { getCurrentCollector } from '@/lib/authz'
import { sendEmailConfirmation } from '@/lib/email-verification'

export const dynamic = 'force-dynamic'

export async function POST() {
  const ctx = await getCurrentCollector()
  if (!ctx) return fail('Faça login para continuar.', 401)
  if (ctx.emailVerified) return fail('Seu e-mail já está confirmado.')
  return handle(async () => {
    const last = await prisma.verificationToken.findFirst({ where: { identifier: `email-verify:${ctx.email.toLowerCase()}` } })
    // Limita reenvios: no máximo um por minuto.
    if (last && last.expires.getTime() - 24 * 3600 * 1000 > Date.now() - 60 * 1000) {
      throw Object.assign(new Error('Aguarde um minuto antes de pedir outro e-mail.'), { status: 429 })
    }
    const sent = await sendEmailConfirmation(ctx.email, ctx.collector.displayName)
    if (!sent) throw Object.assign(new Error('Não foi possível enviar o e-mail agora. Tente mais tarde.'), { status: 502 })
    return { ok: true }
  })
}
