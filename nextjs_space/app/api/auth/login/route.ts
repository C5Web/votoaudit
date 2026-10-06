import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Valida credenciais (pré-checagem). A sessão é criada via signIn('credentials') do Auth.js. */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string }
    const email = String(body?.email ?? '').trim().toLowerCase()
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null
    const ok = !!user?.password && (await bcrypt.compare(String(body?.password ?? ''), user.password))
    if (!ok) return NextResponse.json({ ok: false, error: 'E-mail ou senha incorretos.' }, { status: 401 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('login check error', e)
    return NextResponse.json({ ok: false, error: 'Erro ao validar credenciais.' }, { status: 500 })
  }
}
