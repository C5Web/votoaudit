/** Confirmação de e-mail por link (token de uso único, 24h, guardado como hash). */
import { createHash, randomBytes } from 'crypto'
import { prisma } from './db'
import { appBaseUrl, emailLayout, sendUserEmail } from './notify'

const TTL_MS = 24 * 3600 * 1000
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')
const identifierOf = (email: string) => `email-verify:${email.toLowerCase()}`

export async function sendEmailConfirmation(email: string, name?: string | null): Promise<boolean> {
  const identifier = identifierOf(email)
  await prisma.verificationToken.deleteMany({ where: { identifier } })
  const token = randomBytes(32).toString('base64url')
  await prisma.verificationToken.create({ data: { identifier, token: hashToken(token), expires: new Date(Date.now() + TTL_MS) } })
  const url = `${appBaseUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email.toLowerCase())}`
  return sendUserEmail(
    process.env.NOTIF_ID_CONFIRMAO_DE_EMAIL,
    email,
    'Confirme seu e-mail no VotoAudit',
    emailLayout('Confirme seu e-mail', [
      `Olá${name ? `, ${name}` : ''}.`,
      'Clique no botão abaixo para confirmar seu endereço de e-mail. O link vale por 24 horas.',
      'Se você não criou uma conta no VotoAudit, ignore esta mensagem.',
    ], { label: 'Confirmar e-mail', url })
  )
}

export async function confirmEmail(email: string, token: string): Promise<boolean> {
  const identifier = identifierOf(email)
  const row = await prisma.verificationToken.findFirst({ where: { identifier, token: hashToken(token) } })
  if (!row) return false
  await prisma.verificationToken.deleteMany({ where: { identifier } })
  if (row.expires.getTime() < Date.now()) return false
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: { collector: true } })
  if (!user) return false
  await prisma.user.update({ where: { id: user.id }, data: { emailVerified: user.emailVerified ?? new Date() } })
  if (user.collector?.verificationLevel === 'ANONYMOUS') {
    await prisma.collector.update({ where: { id: user.collector.id }, data: { verificationLevel: 'EMAIL_VERIFIED' } })
  }
  return true
}
