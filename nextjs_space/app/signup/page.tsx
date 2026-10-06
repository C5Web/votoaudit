import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { auth, googleEnabled } from '@/auth'
import { LogoMark } from '@/components/logo'
import { AuthForm } from '../login/_components/auth-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Criar conta — VotoAudit' }

export default async function SignupPage() {
  const session = await auth()
  if (session?.user) redirect('/coletar')
  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md rounded-lg bg-card p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark />
          <h1 className="mt-3 font-display text-2xl font-bold">Criar conta</h1>
          <p className="mt-1 text-sm text-muted-foreground">Contas autenticadas têm evidências com maior peso de proveniência. Papéis institucionais são confirmados por um administrador.</p>
        </div>
        <AuthForm mode="signup" googleEnabled={googleEnabled()} callbackUrl="/coletar" />
        <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /> Publicamente, só exibimos o tipo de fonte (por exemplo, “fiscal de partido com credencial verificada”) — nunca sua identidade. Moderadores e administradores entram apenas por convite.</p>
      </div>
    </div>
  )
}
