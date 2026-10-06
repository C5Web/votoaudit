import Link from 'next/link'
import { LogoMark } from '@/components/logo'
import { inviteInfo } from '@/lib/invites'
import { AcceptInviteForm } from './_components/accept-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Convite — VotoAudit', robots: { index: false } }

export default async function ConvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const info = await inviteInfo(token)
  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md rounded-lg bg-card p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark />
          <h1 className="mt-3 font-display text-2xl font-bold">Convite para o VotoAudit</h1>
        </div>
        {!info ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">Este convite é inválido, expirou (validade de 48 horas) ou já foi utilizado. Peça um novo convite a quem enviou.</p>
            <Link href="/" className="text-sm font-medium text-primary hover:underline">Voltar ao início</Link>
          </div>
        ) : (
          <>
            <p className="mb-5 rounded-md bg-muted/60 p-3 text-sm">
              Você foi convidado(a) para atuar como <strong>{info.roleLabel}</strong>{info.organization ? ` (${info.organization})` : ''}. O convite só vale para o e-mail <span suppressHydrationWarning className="font-medium">{info.emailMasked}</span>.
            </p>
            <AcceptInviteForm token={token} accountExists={info.accountExists} />
          </>
        )}
      </div>
    </div>
  )
}
