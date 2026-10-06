'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Plus, Save, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SeverityBadge, IncidentStatusBadge } from '@/components/status'
import { INCIDENT_STATUS_LABEL, INCIDENT_CATEGORY_LABEL, EVENT_TYPE_LABEL, EVENT_STATUS_LABEL, UF_INFO } from '@/lib/constants'
import { fmtDateTime } from '@/lib/format'

export async function callApi(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok) throw new Error(String(j?.error ?? 'Falha na operação.'))
  return j
}

export interface AdminIncident {
  id: string
  severity: string
  category: string
  status: string
  detectedAt: string
  summary: string | null
  section: { id: string; uf: string; municipality: string; zone: string; section: string } | null
}

export interface AdminEvent {
  id: string
  type: string
  officialOrganizer: string | null
  uf: string
  municipality: string | null
  venue: string | null
  address: string | null
  scheduledStart: string
  scheduledEnd: string | null
  publicAccess: boolean
  officialSourceUrl: string | null
  status: string
}

const selectCls = 'h-10 w-full rounded-md bg-background px-3 text-sm shadow-sm ring-1 ring-input focus:outline-none focus:ring-2 focus:ring-ring'

// Horário de Brasília (UTC-3, sem horário de verão) <-> input datetime-local
const toLocalInput = (iso?: string | null) => (iso ? new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 16) : '')
const fromLocalInput = (v: string) => (v ? `${v}:00-03:00` : null)

export function IncidentsAdmin({ incidents }: { incidents: AdminIncident[] }) {
  const router = useRouter()
  const [edit, setEdit] = useState<AdminIncident | null>(null)
  const [status, setStatus] = useState('')
  const [note, setNote] = useState('')
  const [resolution, setResolution] = useState('')
  const [saving, setSaving] = useState(false)

  const open = (i: AdminIncident) => {
    setEdit(i)
    setStatus(i.status)
    setNote('')
    setResolution('')
  }

  const save = async () => {
    if (!edit) return
    setSaving(true)
    try {
      await callApi(`/api/admin/incidents/${edit.id}`, 'PATCH', { status, note, resolution })
      toast.success('Revisão registrada.')
      setEdit(null)
      router.refresh()
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Falha.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg bg-card shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left">Severidade</th><th className="px-3 py-2 text-left">Categoria</th><th className="px-3 py-2 text-left">Seção</th><th className="px-3 py-2 text-left">Detectado</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2" /></tr></thead>
          <tbody>
            {(incidents ?? []).length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Nenhum incidente.</td></tr>}
            {(incidents ?? []).map((i) => (
              <tr key={i.id} className="border-t border-border/50">
                <td className="px-3 py-2"><SeverityBadge severity={i.severity} /></td>
                <td className="px-3 py-2"><Link href={`/incidentes/${i.id}`} className="font-medium text-primary hover:underline">{INCIDENT_CATEGORY_LABEL[i.category] ?? i.category}</Link></td>
                <td className="px-3 py-2">{i.section ? `${i.section.uf} Z${i.section.zone}/S${i.section.section}` : '—'}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmtDateTime(i.detectedAt)}</td>
                <td className="px-3 py-2"><IncidentStatusBadge status={i.status} /></td>
                <td className="px-3 py-2 text-right"><Button size="sm" variant="outline" onClick={() => open(i)}><Pencil className="mr-1 h-3.5 w-3.5" /> Revisar</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revisão humana</DialogTitle>
            <DialogDescription>{edit ? `${INCIDENT_CATEGORY_LABEL[edit.category] ?? edit.category}${edit.section ? ` · ${edit.section.uf} Z${edit.section.zone}/S${edit.section.section}` : ''}` : ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {edit?.summary && <p className="rounded-md bg-muted/50 p-3 text-sm">{edit.summary}</p>}
            <div className="space-y-1.5"><Label htmlFor="ist">Novo status</Label><select id="ist" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(INCIDENT_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="inote">Nota da revisão</Label><Textarea id="inote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Descreva a análise em termos técnicos (ex.: divergência causada por foto ilegível)." maxLength={1000} /></div>
            <div className="space-y-1.5"><Label htmlFor="ires">Resolução (opcional)</Label><Input id="ires" value={resolution} onChange={(e) => setResolution(e.target.value)} maxLength={300} /></div>
            <Button onClick={save} disabled={saving} className="w-full">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Registrar revisão</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

const EMPTY: AdminEvent = { id: '', type: 'INTEGRITY_TEST', officialOrganizer: '', uf: 'SP', municipality: '', venue: '', address: '', scheduledStart: '', scheduledEnd: null, publicAccess: true, officialSourceUrl: '', status: 'SCHEDULED' }

export function EventsAdmin({ events }: { events: AdminEvent[] }) {
  const router = useRouter()
  const [form, setForm] = useState<AdminEvent | null>(null)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [saving, setSaving] = useState(false)

  const open = (e: AdminEvent | null) => {
    const base = e ?? EMPTY
    setForm({ ...base })
    setStart(toLocalInput(base.scheduledStart))
    setEnd(toLocalInput(base.scheduledEnd))
  }
  const set = (k: keyof AdminEvent, v: string | boolean) => setForm((f) => (f ? { ...f, [k]: v } : f))

  const save = async () => {
    if (!form) return
    if (!start) {
      toast.error('Informe a data de início.')
      return
    }
    setSaving(true)
    try {
      const body = {
        type: form.type,
        officialOrganizer: form.officialOrganizer ?? '',
        uf: form.uf,
        municipality: form.municipality ?? '',
        venue: form.venue ?? '',
        address: form.address ?? '',
        scheduledStart: fromLocalInput(start),
        scheduledEnd: fromLocalInput(end),
        publicAccess: form.publicAccess,
        officialSourceUrl: form.officialSourceUrl ?? '',
        status: form.status,
      }
      if (form.id) await callApi(`/api/admin/events/${form.id}`, 'PATCH', body)
      else await callApi('/api/admin/events', 'POST', body)
      toast.success('Evento salvo.')
      setForm(null)
      router.refresh()
    } catch (e) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Falha.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="mb-3 flex justify-end"><Button onClick={() => open(null)}><Plus className="mr-1 h-4 w-4" /> Novo evento</Button></div>
      <div className="overflow-x-auto rounded-lg bg-card shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left">Tipo</th><th className="px-3 py-2 text-left">UF</th><th className="px-3 py-2 text-left">Local</th><th className="px-3 py-2 text-left">Início</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2" /></tr></thead>
          <tbody>
            {(events ?? []).map((e) => (
              <tr key={e.id} className="border-t border-border/50">
                <td className="px-3 py-2 font-medium">{EVENT_TYPE_LABEL[e.type] ?? e.type}</td>
                <td className="px-3 py-2">{e.uf}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-muted-foreground">{[e.venue, e.municipality].filter(Boolean).join(' · ') || '—'}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmtDateTime(e.scheduledStart)}</td>
                <td className="px-3 py-2">{EVENT_STATUS_LABEL[e.status] ?? e.status}</td>
                <td className="px-3 py-2 text-right">
                  {e.officialSourceUrl && <a href={e.officialSourceUrl} target="_blank" rel="noopener noreferrer" className="mr-2 inline-flex text-muted-foreground hover:text-primary" aria-label="Fonte oficial"><ExternalLink className="h-4 w-4" /></a>}
                  <Button size="sm" variant="outline" onClick={() => open(e)}><Pencil className="mr-1 h-3.5 w-3.5" /> Editar</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Editar evento' : 'Novo evento'}</DialogTitle>
            <DialogDescription>Horários em horário de Brasília.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="et">Tipo</Label><select id="et" className={selectCls} value={form.type} onChange={(e) => set('type', e.target.value)}>{Object.entries(EVENT_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div className="space-y-1.5"><Label htmlFor="euf">UF</Label><select id="euf" className={selectCls} value={form.uf} onChange={(e) => set('uf', e.target.value)}>{Object.keys(UF_INFO).sort().map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
              <div className="space-y-1.5"><Label htmlFor="est">Status</Label><select id="est" className={selectCls} value={form.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(EVENT_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div className="space-y-1.5"><Label htmlFor="es">Início</Label><Input id="es" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="ee">Término</Label><Input id="ee" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="eo">Organizador</Label><Input id="eo" value={form.officialOrganizer ?? ''} onChange={(e) => set('officialOrganizer', e.target.value)} placeholder="Ex.: TRE-SP" /></div>
              <div className="space-y-1.5"><Label htmlFor="em">Município</Label><Input id="em" value={form.municipality ?? ''} onChange={(e) => set('municipality', e.target.value)} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ev">Local</Label><Input id="ev" value={form.venue ?? ''} onChange={(e) => set('venue', e.target.value)} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ea">Endereço</Label><Input id="ea" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="eu">URL da fonte oficial</Label><Input id="eu" type="url" value={form.officialSourceUrl ?? ''} onChange={(e) => set('officialSourceUrl', e.target.value)} placeholder="https://" /></div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.publicAccess} onChange={(e) => set('publicAccess', e.target.checked)} /> Aberto ao público</label>
              <Button onClick={save} disabled={saving} className="sm:col-span-2">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar evento</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
