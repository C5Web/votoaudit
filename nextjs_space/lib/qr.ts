import { sha256Hex } from './hash'

/**
 * Formato simplificado do QR Code do BU (inspirado no padrão TSE "QRBU").
 * Tokens "CHAVE:VALOR" separados por espaço. Chaves numéricas = número do candidato.
 * Ex.: QRBU:1:1 UNFE:SP ZONA:0001 SECA:0015 IDUE:1234567 APTO:350 COMP:280 BRAN:10 NULO:20 91:120 92:130 HASH:<16 hex>
 * HASH = primeiros 16 hex do SHA-256 do conteúdo sem o token HASH (simula a assinatura).
 */
export interface BUData {
  uf: string
  zone: string
  section: string
  ballotBoxId?: string | null
  eligibleVoters?: number | null
  turnout?: number | null
  blankVotes?: number | null
  nullVotes?: number | null
  candidateVotes: Record<string, number>
}

export interface ParsedQR extends BUData {
  signatureValid: boolean
  hash: string | null
}

export function padZone(z: string | number | null | undefined): string {
  return String(z ?? '').replace(/\D/g, '').padStart(4, '0')
}

function bodyOf(data: BUData): string {
  const parts: string[] = [
    'QRBU:1:1',
    `UNFE:${(data?.uf ?? '').toUpperCase()}`,
    `ZONA:${padZone(data?.zone)}`,
    `SECA:${padZone(data?.section)}`,
  ]
  if (data?.ballotBoxId) parts.push(`IDUE:${data.ballotBoxId}`)
  if (data?.eligibleVoters != null) parts.push(`APTO:${data.eligibleVoters}`)
  if (data?.turnout != null) parts.push(`COMP:${data.turnout}`)
  parts.push(`BRAN:${data?.blankVotes ?? 0}`)
  parts.push(`NULO:${data?.nullVotes ?? 0}`)
  const keys = Object.keys(data?.candidateVotes ?? {}).sort()
  for (const k of keys) parts.push(`${k}:${Number(data?.candidateVotes?.[k] ?? 0)}`)
  return parts.join(' ')
}

export function buildQrPayload(data: BUData): string {
  const body = bodyOf(data)
  return `${body} HASH:${sha256Hex(body).slice(0, 16)}`
}

export function parseQrPayload(raw: string): ParsedQR | null {
  try {
    const tokens = (raw ?? '').trim().split(/\s+/).filter(Boolean)
    if (!tokens?.[0]?.startsWith('QRBU')) return null
    const map: Record<string, string> = {}
    const votes: Record<string, number> = {}
    for (const t of tokens.slice(1)) {
      const idx = t.indexOf(':')
      if (idx <= 0) continue
      const k = t.slice(0, idx)
      const v = t.slice(idx + 1)
      if (/^\d+$/.test(k)) votes[k] = parseInt(v, 10) || 0
      else map[k] = v
    }
    const num = (k: string): number | null => (map[k] != null && map[k] !== '' ? parseInt(map[k], 10) : null)
    const data: BUData = {
      uf: (map.UNFE ?? '').toUpperCase(),
      zone: padZone(map.ZONA),
      section: padZone(map.SECA),
      ballotBoxId: map.IDUE ?? null,
      eligibleVoters: num('APTO'),
      turnout: num('COMP'),
      blankVotes: num('BRAN') ?? 0,
      nullVotes: num('NULO') ?? 0,
      candidateVotes: votes,
    }
    const hash = map.HASH ?? null
    const expected = sha256Hex(bodyOf(data)).slice(0, 16)
    return { ...data, hash, signatureValid: !!hash && hash === expected }
  } catch {
    return null
  }
}

/** Assinatura canônica dos votos para comparação exata entre BUs. */
export function voteSignature(bu: {
  candidateVotes: unknown
  blankVotes?: number | null
  nullVotes?: number | null
}): string {
  const cv = (bu?.candidateVotes ?? {}) as Record<string, number>
  const keys = Object.keys(cv).sort()
  const c = keys.map((k: string) => `${k}=${Number(cv[k] ?? 0)}`).join(',')
  return `${c}|B=${bu?.blankVotes ?? 0}|N=${bu?.nullVotes ?? 0}`
}
