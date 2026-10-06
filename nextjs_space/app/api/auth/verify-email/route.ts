import { NextResponse } from 'next/server'
import { confirmEmail } from '@/lib/email-verification'
import { appBaseUrl } from '@/lib/notify'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token') ?? ''
  const email = url.searchParams.get('email') ?? ''
  let ok = false
  try {
    ok = !!token && !!email && (await confirmEmail(email, token))
  } catch (e) {
    console.error('verify-email error', e)
  }
  const base = appBaseUrl() || url.origin
  return NextResponse.redirect(`${base}/meu-perfil?email=${ok ? 'ok' : 'invalido'}`)
}
