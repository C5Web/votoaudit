'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Camera, Flashlight, ImageUp, Loader2, RotateCcw, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DetectorLike {
  detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]>
}
type DetectorCtor = new (opts: { formats: string[] }) => DetectorLike

/** Pré-leitura no cliente (sem verificar assinatura, que é feita no servidor). */
export function previewQr(raw: string) {
  const tokens = (raw ?? '').trim().split(/\s+/).filter(Boolean)
  if (!tokens[0]?.startsWith('QRBU')) return null
  const map: Record<string, string> = {}
  const votes: Record<string, number> = {}
  for (const t of tokens.slice(1)) {
    const i = t.indexOf(':')
    if (i <= 0) continue
    const k = t.slice(0, i)
    const v = t.slice(i + 1)
    if (/^\d+$/.test(k)) votes[k] = parseInt(v, 10) || 0
    else map[k] = v
  }
  const pad = (s?: string) => String(s ?? '').replace(/\D/g, '').padStart(4, '0')
  return {
    uf: (map.UNFE ?? '').toUpperCase(),
    zone: pad(map.ZONA),
    section: pad(map.SECA),
    blank: parseInt(map.BRAN ?? '0', 10) || 0,
    nulls: parseInt(map.NULO ?? '0', 10) || 0,
    turnout: map.COMP ? parseInt(map.COMP, 10) : null,
    votes,
    hasHash: !!map.HASH,
  }
}

const HEADER = /^QRBU:(\d+):(\d+)\s*/

/** Junta as partes de um BU com vários QR Codes (QRBU:i:n) em um único conteúdo. */
function joinParts(parts: Record<number, string>, total: number): string {
  const bodies = Array.from({ length: total }, (_, i) => (parts[i + 1] ?? '').replace(HEADER, ''))
  return `QRBU:1:1 ${bodies.join(' ')}`.trim()
}

export function QrScanner({ onResult }: { onResult: (raw: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const partsRef = useRef<Record<number, string>>({})
  const lastRef = useRef('')
  const doneRef = useRef(false)
  const [state, setState] = useState<'idle' | 'starting' | 'scanning' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState<{ read: number; total: number } | null>(null)
  const [torch, setTorch] = useState<boolean | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => stop, [stop])

  const handleText = useCallback(
    (text: string) => {
      if (doneRef.current || !text || text === lastRef.current) return
      lastRef.current = text
      const h = text.match(HEADER)
      if (!h) {
        setMessage('Esse QR Code não é de um Boletim de Urna. Aponte para o QR impresso no BU.')
        return
      }
      const idx = Number(h[1])
      const total = Math.max(1, Number(h[2]))
      partsRef.current[idx] = text
      const read = Object.keys(partsRef.current).length
      setProgress({ read, total })
      if (total === 1) {
        doneRef.current = true
      } else if (read >= total) {
        doneRef.current = true
        text = joinParts(partsRef.current, total)
      } else {
        setMessage(`Parte ${idx} de ${total} lida. Aponte para o próximo QR Code do boletim.`)
        navigator.vibrate?.(60)
        return
      }
      navigator.vibrate?.([80, 40, 80])
      stop()
      onResult(text)
    },
    [onResult, stop]
  )

  const decodeFrame = useCallback((source: CanvasImageSource, w: number, h: number): string | null => {
    if (!w || !h) return null
    const scale = Math.min(1, 900 / Math.max(w, h))
    const cw = Math.round(w * scale)
    const ch = Math.round(h * scale)
    const canvas = canvasRef.current ?? document.createElement('canvas')
    canvasRef.current = canvas
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(source, 0, 0, cw, ch)
    const img = ctx.getImageData(0, 0, cw, ch)
    return jsQR(img.data, cw, ch, { inversionAttempts: 'attemptBoth' })?.data ?? null
  }, [])

  const start = async () => {
    setMessage('')
    doneRef.current = false
    partsRef.current = {}
    lastRef.current = ''
    setProgress(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('error')
      setMessage('Este navegador não permite acesso à câmera. Use “Ler de uma foto” ou cole o conteúdo.')
      return
    }
    setState('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()
      const track = stream.getVideoTracks()[0]
      const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean }
      setTorch(caps.torch ? false : null)
      setState('scanning')

      const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
      let detector: DetectorLike | null = null
      if (Ctor) {
        try {
          detector = new Ctor({ formats: ['qr_code'] })
        } catch {
          detector = null
        }
      }
      let last = 0
      const loop = async (t: number) => {
        if (doneRef.current || !streamRef.current) return
        if (t - last > 160 && video.readyState >= 2) {
          last = t
          try {
            let text: string | null = null
            if (detector) text = (await detector.detect(video))?.[0]?.rawValue ?? null
            else text = decodeFrame(video, video.videoWidth, video.videoHeight)
            if (text) handleText(text)
          } catch (e) {
            console.error('qr decode', e)
            detector = null
          }
        }
        requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
    } catch (e) {
      console.error('camera', e)
      stop()
      setState('error')
      const name = e instanceof Error ? e.name : ''
      setMessage(
        name === 'NotAllowedError'
          ? 'Permissão da câmera negada. Libere o acesso nas configurações do navegador e tente de novo.'
          : name === 'NotFoundError'
            ? 'Nenhuma câmera encontrada neste dispositivo. Use “Ler de uma foto”.'
            : 'Não foi possível abrir a câmera. Use “Ler de uma foto” ou cole o conteúdo.'
      )
    }
  }

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track || torch === null) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] })
      setTorch(!torch)
    } catch (e) {
      console.error('torch', e)
      setTorch(null)
    }
  }

  const fromPhoto = async (f: File | null) => {
    if (!f) return
    setMessage('')
    try {
      const bmp = await createImageBitmap(f)
      const text = decodeFrame(bmp, bmp.width, bmp.height)
      bmp.close?.()
      if (text) {
        lastRef.current = ''
        handleText(text)
      } else setMessage('Nenhum QR Code encontrado na foto. Tente uma imagem mais nítida e bem enquadrada.')
    } catch (e) {
      console.error('qr foto', e)
      setMessage('Não foi possível ler a imagem.')
    }
  }

  const scanning = state === 'scanning' || state === 'starting'

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-slate-900 sm:aspect-video">
        <video ref={videoRef} muted playsInline className={scanning ? 'h-full w-full object-cover' : 'hidden'} />
        {scanning ? (
          <>
            <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-[62%] aspect-square rounded-xl" style={{ boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)' }}>
                {['left-0 top-0 border-l-4 border-t-4 rounded-tl-xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-xl', 'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-xl', 'right-0 bottom-0 border-r-4 border-b-4 rounded-br-xl'].map((c) => (
                  <span key={c} className={`absolute h-8 w-8 border-white ${c}`} />
                ))}
                <span className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse bg-verified" />
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-slate-950/80 to-transparent p-3 text-white">
              <span className="flex items-center gap-2 text-sm">
                {state === 'starting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                {state === 'starting' ? 'Abrindo câmera…' : progress && progress.total > 1 ? `Partes lidas: ${progress.read}/${progress.total}` : 'Enquadre o QR Code do BU'}
              </span>
              <div className="flex gap-2">
                {torch !== null && (
                  <Button type="button" size="sm" variant="secondary" onClick={toggleTorch} aria-pressed={torch}>
                    <Flashlight className="h-4 w-4" /> {torch ? 'Apagar' : 'Lanterna'}
                  </Button>
                )}
                <Button type="button" size="sm" variant="secondary" onClick={() => { doneRef.current = true; stop(); setState('idle') }}>Parar</Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-white">
            <Camera className="h-10 w-10 opacity-80" />
            <p className="max-w-xs text-sm text-slate-200">Aponte a câmera traseira para o QR Code impresso no Boletim de Urna afixado na seção.</p>
            <Button type="button" onClick={start}>
              {state === 'error' ? <RotateCcw className="h-4 w-4" /> : <Camera className="h-4 w-4" />} {state === 'error' ? 'Tentar de novo' : 'Abrir câmera e ler QR'}
            </Button>
          </div>
        )}
      </div>
      {message && <p role="status" className="rounded-md bg-divergence/10 p-2 text-sm text-divergence-foreground">{message}</p>}
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-primary hover:underline">
        <ImageUp className="h-4 w-4" /> Ler de uma foto do QR
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => { fromPhoto(e.target.files?.[0] ?? null); e.target.value = '' }} />
      </label>
    </div>
  )
}
