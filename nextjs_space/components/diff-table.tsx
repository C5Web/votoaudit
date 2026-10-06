import { cn } from '@/lib/utils'

export interface DiffRowView {
  key: string
  label: string
  official: number | null
  citizen: number | null
  diff: number | null
}

export function DiffTable({ rows, citizenLabel = 'BU cidadão (maioria)' }: { rows: DiffRowView[]; citizenLabel?: string }) {
  const list = Array.isArray(rows) ? rows : []
  if (list.length === 0) return <p className="text-sm text-muted-foreground">Sem dados suficientes para comparação.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Campo</th>
            <th className="px-3 py-2 text-right font-medium">BU oficial (TSE)</th>
            <th className="px-3 py-2 text-right font-medium">{citizenLabel}</th>
            <th className="px-3 py-2 text-right font-medium">Diferença</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r: DiffRowView) => {
            const bad = r?.diff !== null && r?.diff !== undefined && r.diff !== 0
            return (
              <tr key={r?.key} className={cn('border-t border-border/50', bad && 'bg-divergence/10')}>
                <td className="px-3 py-2 font-medium">{r?.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r?.official ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r?.citizen ?? '—'}</td>
                <td className={cn('px-3 py-2 text-right font-semibold tabular-nums', bad ? 'text-divergence-foreground' : 'text-muted-foreground')}>
                  {r?.diff === null || r?.diff === undefined ? '—' : r.diff === 0 ? '✓' : r.diff > 0 ? `+${r.diff}` : r.diff}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
