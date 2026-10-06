import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { auth, googleEnabled } from '@/auth'
import { LogoMark } from '@/components/logo'
import { AuthForm } from './_components/auth-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Entrar — VotoAudit' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth()
  const sp = (await searchParams) ?? {}
  const cb = typeof sp.callbackUrl === 'string' && sp.callbackUrl.startsWith('/') ? sp.callbackUrl : '/coletar'
  if (session?.user) redirect(cb)
  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md rounded-lg bg-card p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark />
          <h1 className="mt-3 font-display text-2xl font-bold">Entrar no VotoAudit</h1>
          <p className="mt-1 text-sm text-muted-foreground">Acesse para coletar e acompanhar suas evidências.</p>
        </div>
        <AuthForm mode="login" googleEnabled={googleEnabled()} callbackUrl={cb} />
        <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /> Seu nome e e-mail nunca são exibidos publicamente.</p>
      </div>
    </div>
  )
}
