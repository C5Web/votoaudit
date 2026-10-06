'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { MapPin, QrCode, Camera, FileCheck2, ShieldCheck, Upload, Hash, Loader2, ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle, RotateCcw, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DEMO_CANDIDATES, PROVENANCE_LABEL, EVIDENCE_STATUS_LABEL, VALIDATION_RESULT_LABEL, CONFIDENCE_LABEL } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { QrScanner, previewQr } from './qr-scanner'

interface SectionItem {
  id: string
  uf: string
  municipality: string
  zone: string
  section: string
  pollingPlace: string | null
}

type Kind = 'BU_QR' | 'BU_PHOTO' | 'ZERESIMA' | 'INTEGRITY_TEST'

const KINDS: { v: Kind; t: string; d: string; icon: typeof QrCode }[] = [
  { v: 'BU_QR', t: 'BU por QR Code', d: 'Leia o QR do boletim com a câmera do celular (ou cole/digite os dados).', icon: QrCode },
  { v: 'BU_PHOTO', t: 'BU por foto', d: 'Foto do boletim afixado + transcrição dos votos.', icon: Camera },
  { v: 'ZERESIMA', t: 'Zerésima', d: 'Relatório emitido antes da votação (deve estar zerado).', icon: FileCheck2 },
  { v: 'INTEGRITY_TEST', t: 'Teste de Integridade', d: 'Registro fotográfico/documental do teste público.', icon: ShieldCheck },
]

const STEPS = ['Seção', 'Tipo', 'Arquivo', 'Dados', 'Confirmação']
const selectCls = 'h-10 w-full rounded-md bg-background px-3 text-sm shadow-sm ring-1 ring-input focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50'

async function sha256File(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

interface SubmitResult {
  evidenceId?: string
  sha256?: string
  validationStatus?: string
  provenanceLevel?: string
  qrSignatureValid?: boolean | null
  incidentId?: string | null
  message?: string
  crossValidation?: { result?: string; confidenceLevel?: string; sourcesCount?: number; concordantCount?: number } | null
}

export function CollectWizard({ presetSection }: { presetSection: string }) {
  const [step, setStep] = useState(0)
  const [sections, setSections] = useState<SectionItem[]>([])
  const [loadingSections, setLoadingSections] = useState(true)
  const [uf, setUf] = useState('')
  const [muni, setMuni] = useState('')
  const [zone, setZone] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [kind, setKind] = useState<Kind>('BU_QR')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [hash, setHash] = useState('')
  const [hashing, setHashing] = useState(false)
  const [qrMode, setQrMode] = useState<'scan' | 'fields' | 'raw'>('scan')
  const [qrRaw, setQrRaw] = useState('')
  const [votes, setVotes] = useState<Record<string, string>>({})
  const [blank, setBlank] = useState('')
  const [nulls, setNulls] = useState('')
  const [turnout, setTurnout] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<SubmitResult | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/sections/lookup')
      .then((r) => r.json())
      .then((j: { items?: SectionItem[] }) => {
        if (!alive) return
        const items = j?.items ?? []
        setSections(items)
        const pre = items.find((s: SectionItem) => s.id === presetSection)
        if (pre) {
          setUf(pre.uf)
          setMuni(pre.municipality)
          setZone(pre.zone)
          setSectionId(pre.id)
        }
      })
      .catch((e) => console.error('lookup', e))
      .finally(() => alive && setLoadingSections(false))
    return () => {
      alive = false
    }
  }, [presetSection])

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const ufs = useMemo(() => Array.from(new Set(sections.map((s: SectionItem) => s.uf))), [sections])
  const munis = useMemo(() => Array.from(new Set(sections.filter((s: SectionItem) => s.uf === uf).map((s: SectionItem) => s.municipality))), [sections, uf])
  const zones = useMemo(() => Array.from(new Set(sections.filter((s: SectionItem) => s.uf === uf && s.municipality === muni).map((s: SectionItem) => s.zone))), [sections, uf, muni])
  const secs = useMemo(() => sections.filter((s: SectionItem) => s.uf === uf && s.municipality === muni && s.zone === zone), [sections, uf, muni, zone])
  const selected = sections.find((s: SectionItem) => s.id === sectionId) ?? null
  const needsData = kind !== 'INTEGRITY_TEST'
  const fileRequired = kind !== 'BU_QR'

  const onFile = async (f: File | null) => {
    setFile(f)
    setHash('')
    if (preview) URL.revokeObjectURL(preview)
    setPreview(f && f.type.startsWith('image/') ? URL.createObjectURL(f) : '')
    if (!f) return
    if (f.size > 25 * 1024 * 1024) {
      setError('Arquivo acima de 25 MB. Reduza a resolução.')
      return
    }
    setError('')
    setHashing(true)
    try {
      setHash(await sha256File(f))
    } catch (e) {
      console.error(e)
      setError('Não foi possível calcular o hash do arquivo.')
    } finally {
      setHashing(false)
    }
  }

  const canNext = [
    !!sectionId,
    !!kind,
    fileRequired ? !!file && !!hash && !hashing : !hashing,
    !needsData || (kind === 'BU_QR' && qrMode === 'scan' ? false : kind === 'BU_QR' && qrMode === 'raw' ? qrRaw.trim().length > 10 : true),
    true,
  ][step]

  const submit = async () => {
    if (!selected) return
    setSubmitting(true)
    setError('')
    try {
      let cloudStoragePath: string | null = null
      if (file) {
        const pr = await fetch('/api/upload/presigned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, contentType: file.type }),
        })
        const pj = (await pr.json().catch(() => ({}))) as { uploadUrl?: string; cloud_storage_path?: string; error?: string }
        if (!pr.ok || !pj?.uploadUrl) throw new Error(pj?.error ?? 'Falha ao preparar o upload.')
        const signed = new URL(pj.uploadUrl).searchParams.get('X-Amz-SignedHeaders') ?? ''
        const headers: Record<string, string> = { 'Content-Type': file.type }
        if (signed.includes('content-disposition')) headers['Content-Disposition'] = 'attachment'
        const up = await fetch(pj.uploadUrl, { method: 'PUT', headers, body: file })
        if (!up.ok) throw new Error('Falha no envio do arquivo para o armazenamento.')
        cloudStoragePath = pj.cloud_storage_path ?? null
      }
      let deviceId = ''
      try {
        deviceId = localStorage.getItem('va_device') ?? ''
        if (!deviceId) {
          deviceId = crypto.randomUUID()
          localStorage.setItem('va_device', deviceId)
        }
      } catch {
        deviceId = ''
      }
      const type = kind === 'ZERESIMA' ? 'ZERESIMA' : kind === 'INTEGRITY_TEST' ? 'INTEGRITY_TEST' : 'BU'
      const candidateVotes = Object.fromEntries(DEMO_CANDIDATES.map((c) => [c.number, kind === 'ZERESIMA' ? Number(votes[c.number] || 0) : Number(votes[c.number] || 0)]))
      const useRaw = kind === 'BU_QR' && qrMode === 'raw'
      const body = {
        sectionId: selected.id,
        type,
        method: kind === 'BU_QR' ? 'QR' : 'PHOTO',
        cloudStoragePath,
        clientSha256: hash || null,
        fileSizeBytes: file?.size ?? null,
        mimeType: file?.type ?? null,
        qrRawPayload: useRaw ? qrRaw.trim() : null,
        buData:
          needsData && !useRaw
            ? {
                uf: selected.uf,
                zone: selected.zone,
                section: selected.section,
                turnout: turnout ? Number(turnout) : null,
                blankVotes: Number(blank || 0),
                nullVotes: Number(nulls || 0),
                candidateVotes,
              }
            : null,
        capturedAt: new Date().toISOString(),
        deviceId,
        notes: notes.trim() || null,
      }
      const r = await fetch('/api/evidence/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = (await r.json().catch(() => ({}))) as SubmitResult & { error?: string }
      if (!r.ok) throw new Error(j?.error ?? 'Não foi possível registrar a evidência.')
      setResult(j)
    } catch (e) {
      console.error('submit', e)
      setError(e instanceof Error ? e.message : 'Erro ao enviar.')
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setResult(null)
    setStep(0)
    onFile(null)
    setVotes({})
    setBlank('')
    setNulls('')
    setTurnout('')
    setQrRaw('')
    setNotes('')
  }

  if (result) {
    const inc = !!result.incidentId
    return (
      <div className="rounded-lg bg-card p-6 shadow-md">
        <div className={cn('flex items-center gap-3 rounded-md p-4', inc ? 'bg-divergence/15' : 'bg-verified/15')}>
          {inc ? <AlertTriangle className="h-8 w-8 text-divergence" /> : <CheckCircle2 className="h-8 w-8 text-verified" />}
          <div>
            <p className="font-semibold">Evidência registrada</p>
            <p className="text-sm">{result.message ?? 'Obrigado pela contribuição.'}</p>
          </div>
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">Status</dt><dd className="font-medium">{EVIDENCE_STATUS_LABEL[result.validationStatus ?? ''] ?? result.validationStatus}</dd></div>
          <div className="rounded-md bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">Proveniência</dt><dd className="font-medium">{PROVENANCE_LABEL[result.provenanceLevel ?? ''] ?? result.provenanceLevel}</dd></div>
          {result.crossValidation && (
            <>
              <div className="rounded-md bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">Cross-validation</dt><dd className="font-medium">{VALIDATION_RESULT_LABEL[result.crossValidation.result ?? ''] ?? result.crossValidation.result}</dd></div>
              <div className="rounded-md bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">Confiança</dt><dd className="font-medium">{CONFIDENCE_LABEL[result.crossValidation.confidenceLevel ?? ''] ?? '—'} · {result.crossValidation.sourcesCount ?? 0} fonte(s)</dd></div>
            </>
          )}
          {result.qrSignatureValid !== null && result.qrSignatureValid !== undefined && (
            <div className="rounded-md bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">Integridade do QR</dt><dd className="font-medium">{result.qrSignatureValid ? 'Válida' : 'Inválida'}</dd></div>
          )}
          <div className="rounded-md bg-muted/50 p-3 sm:col-span-2"><dt className="text-xs text-muted-foreground">SHA-256 registrado</dt><dd className="break-all font-mono text-xs">{result.sha256}</dd></div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          {selected && <Button asChild><Link href={`/secoes/${selected.id}`}>Ver a seção</Link></Button>}
          {result.incidentId && <Button asChild variant="outline"><Link href={`/incidentes/${result.incidentId}`}>Ver incidente</Link></Button>}
          <Button variant="ghost" onClick={reset}><RotateCcw className="mr-1 h-4 w-4" /> Nova coleta</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-card p-5 shadow-md sm:p-6">
      <ol className="mb-6 flex items-center gap-1 overflow-x-auto text-xs">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-1">
            <span className={cn('flex h-6 w-6 items-center justify-center rounded-full font-semibold', i < step ? 'bg-verified text-verified-foreground' : i === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
            <span className={cn('whitespace-nowrap', i === step ? 'font-semibold' : 'text-muted-foreground')}>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-4 bg-border sm:w-8" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 font-semibold"><MapPin className="h-5 w-5 text-primary" /> Onde você está?</h2>
          {loadingSections ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando seções…</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="uf">UF</Label><select id="uf" className={selectCls} value={uf} onChange={(e) => { setUf(e.target.value); setMuni(''); setZone(''); setSectionId('') }}><option value="">Selecione</option>{ufs.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
              <div><Label htmlFor="muni">Município</Label><select id="muni" className={selectCls} value={muni} disabled={!uf} onChange={(e) => { setMuni(e.target.value); setZone(''); setSectionId('') }}><option value="">Selecione</option>{munis.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
              <div><Label htmlFor="zona">Zona</Label><select id="zona" className={selectCls} value={zone} disabled={!muni} onChange={(e) => { setZone(e.target.value); setSectionId('') }}><option value="">Selecione</option>{zones.map((z) => <option key={z} value={z}>Zona {z}</option>)}</select></div>
              <div><Label htmlFor="secao">Seção</Label><select id="secao" className={selectCls} value={sectionId} disabled={!zone} onChange={(e) => setSectionId(e.target.value)}><option value="">Selecione</option>{secs.map((s) => <option key={s.id} value={s.id}>Seção {s.section}</option>)}</select></div>
            </div>
          )}
          {selected?.pollingPlace && <p className="rounded-md bg-muted/50 p-3 text-sm">{selected.pollingPlace}</p>}
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {KINDS.map((k) => (
            <button key={k.v} type="button" onClick={() => setKind(k.v)} className={cn('rounded-lg p-4 text-left shadow-sm ring-1 transition', kind === k.v ? 'bg-primary/5 ring-2 ring-primary' : 'bg-background ring-border hover:bg-muted/50')}>
              <k.icon className="h-6 w-6 text-primary" />
              <p className="mt-2 font-semibold">{k.t}</p>
              <p className="text-sm text-muted-foreground">{k.d}</p>
            </button>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 font-semibold"><Upload className="h-5 w-5 text-primary" /> Arquivo da evidência {fileRequired ? '' : <span className="text-sm font-normal text-muted-foreground">(opcional para QR)</span>}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg bg-primary/5 p-6 text-center ring-1 ring-primary/30 hover:bg-primary/10 active:scale-[0.99]">
              <Camera className="h-8 w-8 text-primary" />
              <span className="text-sm font-medium">Abrir câmera</span>
              <span className="text-xs text-muted-foreground">No celular, abre a câmera traseira direto</span>
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = '' }} />
            </label>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg bg-muted/50 p-6 text-center ring-1 ring-dashed ring-border hover:bg-muted active:scale-[0.99]">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">Galeria ou arquivos</span>
              <span className="text-xs text-muted-foreground">Foto já tirada, PDF ou vídeo</span>
              <input type="file" accept="image/*,application/pdf,video/mp4" className="sr-only" onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = '' }} />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">JPG, PNG, WEBP, HEIC, PDF ou MP4 · até 25 MB. No computador, as duas opções abrem o seletor de arquivos.</p>
          {file && (
            <div className="flex gap-4 rounded-md bg-muted/40 p-3">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Pré-visualização da evidência" className="h-24 w-24 rounded object-cover" />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded bg-background"><FileText className="h-8 w-8 text-muted-foreground" /></div>
              )}
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB · {file.type || 'desconhecido'}</p>
                <p className="mt-2 flex items-center gap-1 break-all font-mono text-xs">{hashing ? <><Loader2 className="h-3 w-3 animate-spin" /> calculando SHA-256…</> : <><Hash className="h-3 w-3 shrink-0" /> {hash}</>}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          {!needsData ? (
            <>
              <p className="text-sm text-muted-foreground">Para o Teste de Integridade, basta o arquivo. Adicione observações se quiser.</p>
              <div><Label htmlFor="notes">Observações</Label><Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></div>
            </>
          ) : (
            <>
              {kind === 'BU_QR' && (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant={qrMode === 'scan' ? 'default' : 'outline'} onClick={() => setQrMode('scan')}><Camera className="h-4 w-4" /> Ler com a câmera</Button>
                  <Button type="button" size="sm" variant={qrMode === 'raw' ? 'default' : 'outline'} onClick={() => setQrMode('raw')}>Colar conteúdo</Button>
                  <Button type="button" size="sm" variant={qrMode === 'fields' ? 'default' : 'outline'} onClick={() => setQrMode('fields')}>Digitar campos</Button>
                </div>
              )}
              {kind === 'BU_QR' && qrMode === 'scan' ? (
                <QrScanner onResult={(raw) => { setQrRaw(raw); setQrMode('raw') }} />
              ) : kind === 'BU_QR' && qrMode === 'raw' ? (
                <div className="space-y-3">
                  {(() => {
                    const p = previewQr(qrRaw)
                    if (!p) return null
                    const mismatch = !!selected && (p.uf !== selected.uf || p.zone !== selected.zone.padStart(4, '0') || p.section !== selected.section.padStart(4, '0'))
                    return (
                      <div className="rounded-lg bg-verified/10 p-3 text-sm">
                        <p className="flex items-center gap-2 font-semibold text-verified-foreground"><CheckCircle2 className="h-4 w-4" /> QR Code lido: UF {p.uf} · Zona {p.zone} · Seção {p.section}</p>
                        <p className="mt-1 text-muted-foreground">
                          {Object.entries(p.votes).map(([n, v]) => `${n}: ${v}`).join(' · ')}{' '}· Brancos: {p.blank} · Nulos: {p.nulls}{p.turnout != null ? ` · Comparecimento: ${p.turnout}` : ''}
                        </p>
                        {mismatch && (
                          <p className="mt-2 flex items-start gap-2 rounded-md bg-divergence/15 p-2 text-divergence-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> A seção do QR não é a mesma escolhida no passo 1. Volte e selecione a seção correta antes de enviar.</p>
                        )}
                      </div>
                    )
                  })()}
                  <div>
                    <Label htmlFor="qr">Conteúdo bruto do QR Code</Label>
                    <Textarea id="qr" rows={4} className="font-mono text-xs" value={qrRaw} onChange={(e) => setQrRaw(e.target.value)} placeholder="QRBU:1:1 UNFE:SP ZONA:0001 SECA:0015 ... 91:120 92:98 ... HASH:..." />
                    <p className="mt-1 text-xs text-muted-foreground">A integridade do QR é verificada automaticamente no servidor.</p>
                  </div>
                  {qrRaw && <Button type="button" size="sm" variant="outline" onClick={() => { setQrRaw(''); setQrMode('scan') }}><RotateCcw className="h-4 w-4" /> Ler outro QR</Button>}
                </div>
              ) : (
                <>
                  {selected && <p className="rounded-md bg-muted/50 p-2 text-sm">UF {selected.uf} · Zona {selected.zone} · Seção {selected.section}</p>}
                  {kind === 'ZERESIMA' && <p className="text-sm text-muted-foreground">Transcreva os valores exatamente como impressos. Em uma Zerésima regular, todos devem ser 0.</p>}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {DEMO_CANDIDATES.map((c) => (
                      <div key={c.number}><Label htmlFor={`v${c.number}`}>{c.name} ({c.number})</Label><Input id={`v${c.number}`} type="number" min={0} inputMode="numeric" value={votes[c.number] ?? ''} onChange={(e) => setVotes((p) => ({ ...(p ?? {}), [c.number]: e.target.value }))} placeholder="0" /></div>
                    ))}
                    <div><Label htmlFor="blank">Brancos</Label><Input id="blank" type="number" min={0} value={blank} onChange={(e) => setBlank(e.target.value)} placeholder="0" /></div>
                    <div><Label htmlFor="nulls">Nulos</Label><Input id="nulls" type="number" min={0} value={nulls} onChange={(e) => setNulls(e.target.value)} placeholder="0" /></div>
                    {kind !== 'ZERESIMA' && <div><Label htmlFor="turnout">Comparecimento</Label><Input id="turnout" type="number" min={0} value={turnout} onChange={(e) => setTurnout(e.target.value)} placeholder="opcional" /></div>}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {step === 4 && selected && (
        <div className="space-y-3 text-sm">
          <h2 className="font-semibold">Confira antes de enviar</h2>
          <div className="rounded-md bg-muted/50 p-3">{selected.uf} · {selected.municipality} · Zona {selected.zone} · Seção {selected.section}</div>
          <div className="rounded-md bg-muted/50 p-3">Tipo: <strong>{KINDS.find((k) => k.v === kind)?.t}</strong></div>
          <div className="rounded-md bg-muted/50 p-3">Arquivo: {file ? <><strong>{file.name}</strong><p className="mt-1 break-all font-mono text-xs">SHA-256: {hash}</p></> : 'nenhum (somente dados do QR)'}</div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /> O servidor recalcula o hash do arquivo. Sua identidade nunca é exibida publicamente.</p>
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="mt-6 flex justify-between gap-3">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting}><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => { setError(''); setStep((s) => s + 1) }} disabled={!canNext}>Avançar <ArrowRight className="ml-1 h-4 w-4" /></Button>
        ) : (
          <Button onClick={submit} disabled={submitting} className="bg-verified text-verified-foreground hover:bg-verified/90">
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Enviar evidência
          </Button>
        )}
      </div>
    </div>
  )
}
