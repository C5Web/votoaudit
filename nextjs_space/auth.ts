import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { refreshSessionRole, isSuperAdminEmail } from '@/lib/staff-sync'

const googleId = process.env.GOOGLE_CLIENT_ID ?? ''
export const googleEnabled = (): boolean => {
  const id = process.env.GOOGLE_CLIENT_ID ?? ''
  return !!id && !id.startsWith('placeholder') && !!process.env.GOOGLE_CLIENT_SECRET && !(process.env.GOOGLE_CLIENT_SECRET ?? '').startsWith('placeholder')
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      name: 'E-mail e senha',
      credentials: { email: { label: 'E-mail', type: 'email' }, password: { label: 'Senha', type: 'password' } },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '').trim().toLowerCase()
        const password = String(credentials?.password ?? '')
        if (!email || !password) return null
        const user = await prisma.user.findUnique({ where: { email } })
        if (!user?.password) return null
        const ok = await bcrypt.compare(password, user.password)
        if (!ok) return null
        const c = await prisma.collector.findUnique({ where: { userId: user.id }, select: { suspendedAt: true } })
        if (c?.suspendedAt && !isSuperAdminEmail(email)) return null
        return { id: user.id, email: user.email, name: user.name }
      },
    }),
    ...(googleId
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
  cookies: {
    state: {
      name: 'authjs.state',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' },
    },
    pkceCodeVerifier: {
      name: 'authjs.pkce.code_verifier',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' },
    },
  },
  events: {
    async createUser({ user }) {
      // Contas criadas via Google recebem perfil de coletor automaticamente.
      if (!user?.id) return
      // O Google já confirma o e-mail.
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } }).catch(() => null)
      await prisma.collector.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, displayName: user.name ?? (user.email ?? 'Coletor').split('@')[0] },
      })
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      const id = (user?.id ?? token?.id) as string | undefined
      if (!id) return token
      token.id = id
      // Papel e suspensão são relidos do banco a cada acesso: suspender uma conta encerra as sessões dela.
      const role = await refreshSessionRole(id, (user?.email ?? token?.email) as string | undefined)
      if (role === null) return null
      token.role = role
      return token
    },
    async session({ session, token }) {
      if (token?.id && session?.user) {
        session.user.id = token.id as string
        session.user.role = (token.role as string) ?? 'CITIZEN'
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`
      try {
        if (new URL(url).origin === baseUrl) return url
      } catch {
        /* ignore */
      }
      return baseUrl
    },
  },
})
