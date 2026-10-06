'use client'

import dynamic from 'next/dynamic'
import type { MapRow } from './uf-map'
import type { TimelinePoint } from './timeline-chart'

const Loading = ({ label }: { label: string }) => (
  <div className="flex h-full min-h-[300px] items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">{label}</div>
)

const UfMap = dynamic(() => import('./uf-map'), { ssr: false, loading: () => <Loading label="Carregando mapa…" /> })
const TimelineChart = dynamic(() => import('./timeline-chart'), { ssr: false, loading: () => <Loading label="Carregando gráfico…" /> })

export function MapWidget({ rows }: { rows: MapRow[] }) {
  return <UfMap rows={rows ?? []} />
}

export function TimelineWidget({ data }: { data: TimelinePoint[] }) {
  return <TimelineChart data={data ?? []} />
}
