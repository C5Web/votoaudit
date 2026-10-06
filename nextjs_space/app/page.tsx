import Image from 'next/image'
import Link from 'next/link'
import { Camera, Map, CheckCircle2, AlertTriangle, Circle, Fingerprint, Scale, Database, Smartphone, ShieldCheck, ArrowRight, Hash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/layouts/container'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { CountUp } from '@/components/count-up'
import { getOverview } from '@/lib/queries'

export const dynamic = 'force-dynamic'

const STATES = [
  {
    icon: CheckCircle2,
    title: 'VERIFICADO',
    cls: 'bg-verified/15 text-verified-foreground',
    text: 'O BU coletado por cidadãos confere, campo a campo, com o boletim oficial publicado pelo TSE.',
  },
  {
    icon: AlertTriangle,
    title: 'DIVERGÊNCIA',
    cls: 'bg-divergence/15 text-divergence-foreground',
    text: 'Há diferença entre fontes. Um incidente é aberto para revisão técnica e humana — sem conclusões antecipadas.',
  },
  {
    icon: Circle,
    title: 'NÃO VERIFICADO',
    cls: 'bg-unverified/20 text-unverified-foreground',
    text: 'Ainda não há evidências suficientes para cruzar. Seção aguardando coleta ou publicação oficial.',
  },
]

const PILLARS = [
  { icon: Fingerprint, title: 'Integridade por hash', text: 'Cada arquivo recebe SHA-256 no seu aparelho e é recalculado no servidor. O original nunca é alterado.' },
  { icon: Scale, title: 'Neutralidade', text: 'Não apontamos culpados. Mostramos o que confere e o que diverge, com os dados à vista.' },
  { icon: Database, title: 'Cruzamento com o oficial', text: 'Os BUs cidadãos são comparados automaticamente com os dados abertos do TSE.' },
  { icon: ShieldCheck, title: 'Privacidade do coletor', text: 'Nenhum nome ou e-mail aparece publicamente — só a quantidade e o nível de verificação das fontes.' },
]

export default async function Home() {
  let o: Awaited<ReturnType<typeof getOverview>> | null = null
  try {
    o = await getOverview()
  } catch (e) {
    console.error('overview', e)
  }

  return (
    <>
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <Image
          src="/images/hero-urna-v1.jpg"
          alt="Urna eletrônica brasileira em seção de votação"
          fill
          priority
          className="object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/60 via-primary/80 to-primary" />
        <Container className="relative py-20 md:py-28">
          <FadeIn>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
              <ShieldCheck className="h-4 w-4" /> Eleições 2026 · 1º turno em 4 de outubro
            </p>
            <h1 className="max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight md:text-6xl">
              Auditoria cidadã, <span className="text-verified">evidência verificável</span>
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-primary-foreground/80">
              Fotografe o Boletim de Urna da sua seção, preserve a prova com hash criptográfico e acompanhe, em tempo real, o cruzamento com os dados oficiais.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="bg-verified text-verified-foreground hover:bg-verified/90">
                <Link href="/coletar">
                  <Camera className="mr-2 h-5 w-5" /> Colete um BU
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/10 text-primary-foreground hover:bg-white/20">
                <Link href="/dashboard">
                  <Map className="mr-2 h-5 w-5" /> Acompanhe o mapa
                </Link>
              </Button>
            </div>
          </FadeIn>
        </Container>
      </section>

      <section className="bg-muted/40 py-12">
        <Container>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: 'BUs cidadãos recebidos', value: o?.citizenBUs ?? 0 },
              { label: 'BUs oficiais ingeridos', value: o?.officialBUs ?? 0 },
              { label: 'Seções verificadas', value: o?.verifiedSections ?? 0 },
              { label: 'Contribuintes', value: (o?.contributors?.verifiedAccounts ?? 0) + (o?.contributors?.visitors ?? 0) },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-card p-5 text-center shadow-sm">
                <div className="font-display text-3xl font-bold text-primary">
                  <CountUp value={s.value} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="py-16">
        <Container>
          <FadeIn>
            <h2 className="font-display text-3xl font-semibold tracking-tight">Três estados, nenhuma ambiguidade</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">Toda seção e toda evidência é classificada em um destes estados. Nada além disso.</p>
          </FadeIn>
          <Stagger className="mt-8 grid gap-4 md:grid-cols-3">
            {STATES.map((s) => (
              <StaggerItem key={s.title}>
                <div className="h-full rounded-lg bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${s.cls}`}>
                    <s.icon className="h-4 w-4" /> {s.title}
                  </span>
                  <p className="mt-4 text-sm text-muted-foreground">{s.text}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </Container>
      </section>

      <section className="bg-muted/40 py-16">
        <Container className="grid items-center gap-10 md:grid-cols-2">
          <FadeIn>
            <h2 className="font-display text-3xl font-semibold tracking-tight">Uma proposta neutra</h2>
            <p className="mt-3 text-muted-foreground">
              O VotoAudit não defende candidatos, partidos ou teses. Registramos evidências públicas do processo eleitoral e as comparamos com os dados oficiais. Divergências viram incidentes para análise — nunca acusações.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {PILLARS.map((p) => (
                <div key={p.title} className="rounded-lg bg-card p-4 shadow-sm">
                  <p.icon className="h-5 w-5 text-primary" />
                  <h3 className="mt-2 text-sm font-semibold">{p.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{p.text}</p>
                </div>
              ))}
            </div>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted shadow-md">
              <Image
                src="/images/observadores-auditoria-v1.jpg"
                alt="Observadores acompanhando procedimentos de auditoria eleitoral"
                fill
                className="object-cover"
              />
            </div>
          </FadeIn>
        </Container>
      </section>

      <section className="py-16">
        <Container>
          <h2 className="font-display text-3xl font-semibold tracking-tight">Como funciona</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {[
              { icon: Camera, t: '1. Colete', d: 'Fotografe o BU afixado na seção ao fim da votação e leia o QR Code.' },
              { icon: Hash, t: '2. Preserve', d: 'O arquivo recebe hash SHA-256 e é armazenado sem alterações.' },
              { icon: Database, t: '3. Cruze', d: 'Comparação automática com outros cidadãos e com o BU oficial do TSE.' },
              { icon: CheckCircle2, t: '4. Publique', d: 'O resultado aparece no mapa: verificado, divergência ou não verificado.' },
            ].map((s) => (
              <div key={s.t} className="rounded-lg bg-card p-5 shadow-sm">
                <s.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-3 font-semibold">{s.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-lg bg-primary p-6 text-primary-foreground shadow-md md:flex-row md:items-center">
            <div className="flex items-center gap-3">
              <Smartphone className="h-8 w-8 shrink-0" />
              <div>
                <p className="font-semibold">Aplicativo móvel — em breve nas lojas</p>
                <p className="text-sm text-primary-foreground/75">Leitura nativa do QR Code do BU e coleta offline. Enquanto isso, use a versão web no celular.</p>
              </div>
            </div>
            <Button asChild variant="secondary">
              <Link href="/coletar">
                Coletar pela web <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </Container>
      </section>
    </>
  )
}
