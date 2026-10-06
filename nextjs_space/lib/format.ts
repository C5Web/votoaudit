// Formatação determinística (pt-BR, horário de Brasília) — segura para SSR.
const TZ = 'America/Sao_Paulo'

export function fmtDateTime(iso?: string | Date | null): string {
  if (!iso) return '—'
  const d = iso instanceof Date ? iso : new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function fmtDate(iso?: string | Date | null): string {
  if (!iso) return '—'
  const d = iso instanceof Date ? iso : new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtNum(n?: number | null): string {
  return (n ?? 0).toLocaleString('pt-BR')
}

export function shortHash(h?: string | null, n = 12): string {
  return h ? `${h.slice(0, n)}…` : '—'
}
