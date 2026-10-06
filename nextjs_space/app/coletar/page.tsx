import { redirect } from 'next/navigation'
import { Camera } from 'lucide-react'
import { auth } from '@/auth'
import { Container } from '@/components/layouts/container'
import { CollectWizard } from './_components/collect-wizard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Coletar evidência — VotoAudit' }

export default async function ColetarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth()
  if (!session?.user) redirect('/login?callbackUrl=/coletar')
  const sp = (await searchParams) ?? {}
  const presetSection = typeof sp.secao === 'string' ? sp.secao : ''
  return (
    <Container size="md" className="py-10">
      <h1 className="flex items-center gap-2 font-display text-3xl font-bold tracking-tight"><Camera className="h-7 w-7 text-primary" /> Coletar evidência</h1>
      <p className="mt-1 text-muted-foreground">Registre o BU, a Zerésima ou o Teste de Integridade da sua seção. O arquivo é preservado com hash SHA-256 e cruzado com as demais fontes.</p>
      <div className="mt-8">
        <CollectWizard presetSection={presetSection} />
      </div>
    </Container>
  )
}
