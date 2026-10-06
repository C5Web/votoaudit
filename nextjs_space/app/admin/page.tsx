import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { Container } from '@/components/layouts/container'
import { auth } from '@/auth'
import { requireStaff } from '@/lib/authz'
import { rankOf } from '@/lib/roles'
import { prisma } from '@/lib/db'
import { getOverview, listIncidents, listEvents } from '@/lib/queries'
import { AdminPanel } from './_components/admin-panel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Administração — VotoAudit' }

export default async function AdminPage() {
  const ctx = await requireStaff(1)
  if (!ctx) {
    const session = await auth()
    redirect(session?.user ? '/' : '/login?callbackUrl=/admin')
  }
  const viewerRole = ctx.collector.role as string
  const isAdmin = rankOf(viewerRole) >= 2
  const [overview, incidents, events, collectors] = await Promise.all([
    getOverview(),
    listIncidents({}, 100),
    isAdmin ? listEvents({}) : Promise.resolve([]),
    isAdmin
      ? prisma.collector.findMany({
          orderBy: { createdAt: 'desc' },
          take: 200,
          select: { id: true, displayName: true, role: true, verificationLevel: true, organization: true, createdAt: true, suspendedAt: true, suspendedReason: true, user: { select: { email: true } }, _count: { select: { evidences: true } } },
        })
      : Promise.resolve([]),
  ])
  const collectorRows = collectors.map((c) => ({
    id: c.id,
    displayName: c.displayName,
    email: c.user?.email ?? '',
    role: c.role as string,
    verificationLevel: c.verificationLevel as string,
    organization: c.organization,
    evidences: c._count?.evidences ?? 0,
    createdAt: c.createdAt.toISOString(),
    suspendedAt: c.suspendedAt ? c.suspendedAt.toISOString() : null,
    suspendedReason: c.suspendedReason,
  }))

  return (
    <Container size="xl" className="py-10">
      <h1 className="flex items-center gap-2 font-display text-3xl font-bold tracking-tight"><ShieldCheck className="h-7 w-7 text-primary" /> Administração</h1>
      <p className="mt-1 text-muted-foreground">{isAdmin ? 'Revisão humana de incidentes, verificação de contas, convites, auditoria, agenda de eventos, ingestão de dados oficiais e gestão da equipe.' : 'Moderação: revisão de incidentes e análise de verificações de identidade.'}</p>
      <div className="mt-6">
        <AdminPanel overview={overview} incidents={incidents} events={events} collectors={collectorRows} viewerRole={viewerRole} viewerId={ctx.collector.id} />
      </div>
    </Container>
  )
}
