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

// ---- Rótulos de eleição (dinâmicos, sem ano/turno fixos no código) ----

export interface ElectionLabelInput {
  year: number
  round: number
  electionDate?: string | Date | null
}

/** "1º turno", "2º turno" etc. */
export function roundLabel(round?: number | null): string {
  return `${round ?? 1}º turno`
}

const MONTHS_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** "4 de outubro" (fuso de Brasília). */
export function dayMonthLabel(iso?: string | Date | null): string {
  if (!iso) return ''
  const d = iso instanceof Date ? iso : new Date(iso)
  if (isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: 'numeric', month: 'numeric' }).formatToParts(d)
  const day = Number(parts.find((p) => p.type === 'day')?.value ?? d.getUTCDate())
  const month = Number(parts.find((p) => p.type === 'month')?.value ?? d.getUTCMonth() + 1)
  return `${day} de ${MONTHS_PT[month - 1] ?? ''}`
}

/** "Eleições 2026 · 1º turno em 4 de outubro" — tudo derivado da eleição corrente. */
export function electionBadge(e?: ElectionLabelInput | null): string {
  if (!e) return 'Eleições'
  const date = dayMonthLabel(e.electionDate)
  return `Eleições ${e.year} · ${roundLabel(e.round)}${date ? ` em ${date}` : ''}`
}

/** "Eleições 2026 — 1º turno" (versão curta, sem data). */
export function electionShortLabel(e?: ElectionLabelInput | null): string {
  if (!e) return 'Eleições'
  return `Eleições ${e.year} — ${roundLabel(e.round)}`
}
