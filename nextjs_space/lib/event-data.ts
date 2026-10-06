import type { AuditEventStatus, AuditEventType } from '@prisma/client'

export interface EventBody {
  type?: AuditEventType
  officialOrganizer?: string
  uf?: string
  municipality?: string
  venue?: string
  address?: string
  scheduledStart?: string
  scheduledEnd?: string | null
  publicAccess?: boolean
  officialSourceUrl?: string
  status?: AuditEventStatus
}

export function eventData(b: EventBody) {
  return {
    ...(b?.type ? { type: b.type } : {}),
    ...(b?.officialOrganizer !== undefined ? { officialOrganizer: b.officialOrganizer || null } : {}),
    ...(b?.uf ? { uf: b.uf.toUpperCase() } : {}),
    ...(b?.municipality !== undefined ? { municipality: b.municipality || null } : {}),
    ...(b?.venue !== undefined ? { venue: b.venue || null } : {}),
    ...(b?.address !== undefined ? { address: b.address || null } : {}),
    ...(b?.scheduledStart ? { scheduledStart: new Date(b.scheduledStart) } : {}),
    ...(b?.scheduledEnd !== undefined ? { scheduledEnd: b.scheduledEnd ? new Date(b.scheduledEnd) : null } : {}),
    ...(b?.publicAccess !== undefined ? { publicAccess: !!b.publicAccess } : {}),
    ...(b?.officialSourceUrl !== undefined ? { officialSourceUrl: b.officialSourceUrl || null } : {}),
    ...(b?.status ? { status: b.status } : {}),
  }
}

