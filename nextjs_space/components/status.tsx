import { CheckCircle2, AlertTriangle, Circle, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SECTION_STATUS_LABEL, SEVERITY_LABEL, INCIDENT_STATUS_LABEL, sectionState, type EvidenceState } from '@/lib/constants'

const STATE_META: Record<EvidenceState, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  VERIFIED: { label: 'VERIFICADO', cls: 'bg-verified/15 text-verified-foreground', Icon: CheckCircle2 },
  DIVERGENCE: { label: 'DIVERGÊNCIA', cls: 'bg-divergence/15 text-divergence-foreground', Icon: AlertTriangle },
  UNVERIFIED: { label: 'NÃO VERIFICADO', cls: 'bg-unverified/20 text-unverified-foreground', Icon: Circle },
}

/** Badge dos 3 estados canônicos: ✅ VERIFICADO / ⚠️ DIVERGÊNCIA / ○ NÃO VERIFICADO */
export function EvidenceStateBadge({ state, className, detail }: { state: EvidenceState; className?: string; detail?: string }) {
  const m = STATE_META[state] ?? STATE_META.UNVERIFIED
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', m.cls, className)}>
      <m.Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {m.label}
      {detail ? <span className="font-normal opacity-80">· {detail}</span> : null}
    </span>
  )
}

export function SectionStatusBadge({ status }: { status: string }) {
  const state = sectionState(status)
  const detail = status === 'PARTIAL' ? 'parcial' : status === 'NO_EVIDENCE' ? 'sem evidência' : status === 'PENDING' ? 'sem BU cidadão' : undefined
  return <EvidenceStateBadge state={state} detail={detail} />
}

export function sectionStatusText(status: string) {
  return SECTION_STATUS_LABEL[status] ?? status
}

const SEV_CLS: Record<string, string> = {
  LOW: 'bg-unverified/20 text-unverified-foreground',
  MEDIUM: 'bg-divergence/15 text-divergence-foreground',
  HIGH: 'bg-divergence/30 text-divergence-foreground',
  CRITICAL: 'bg-destructive/15 text-destructive',
}

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', SEV_CLS[severity] ?? SEV_CLS.LOW)}>
      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
      {SEVERITY_LABEL[severity] ?? severity}
    </span>
  )
}

export function IncidentStatusBadge({ status }: { status: string }) {
  const closed = ['RESOLVED', 'CONFIRMED', 'INCONCLUSIVE'].includes(status)
  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', closed ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary')}>
      {INCIDENT_STATUS_LABEL[status] ?? status}
    </span>
  )
}
