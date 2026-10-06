import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { UF_LIST, PUBLIC_ROLES, type RoleKey } from '@/lib/roles'
import { isSuperAdminEmail } from '@/lib/staff-sync'
import { sendEmailConfirmation } from '@/lib/email-verification'

export const dynamic = 'force-dynamic'

/**
 * Cadastro público. A conta sempre nasce como Cidadão; o papel institucional desejado
 * é solicitado em seguida (POST /api/verification/requests) e só vale após aprovação.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { name?: string; email?: string; password?: string; uf?: string; desiredRole?: string }
    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')
    const name = String(body?.name ?? '').trim().slice(0, 60) || email.split('@')[0]
    const uf = String(body?.uf ?? '').toUpperCase()
    const desiredRole = String(body?.desiredRole ?? 'CITIZEN')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ error: 'A senha deve ter pelo menos 8 caracteres.' }, { status: 400 })
    if (uf && !UF_LIST.includes(uf)) return NextResponse.json({ error: 'Selecione a sua UF.' }, { status: 400 })
    if (!PUBLIC_ROLES.includes(desiredRole as RoleKey)) return NextResponse.json({ error: 'Papel indisponível no cadastro público.' }, { status: 400 })
    if (isSuperAdminEmail(email)) return NextResponse.json({ error: 'Este e-mail é reservado.' }, { status: 403 })
    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists) return NextResponse.json({ error: 'Já existe uma conta com este e-mail.' }, { status: 409 })
    const user = await prisma.user.create({ data: { email, name, password: await bcrypt.hash(password, 10) } })
    await prisma.collector.create({ data: { userId: user.id, displayName: name, uf: uf || null, role: 'CITIZEN', verificationLevel: 'ANONYMOUS' } })
    const emailSent = await sendEmailConfirmation(email, name)
    return NextResponse.json({ ok: true, id: user.id, emailSent }, { status: 201 })
  } catch (e) {
    console.error('signup error', e)
    return NextResponse.json({ error: 'Não foi possível criar a conta.' }, { status: 500 })
  }
}
