'use client'

import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet'
import { useRouter } from 'next/navigation'
import { UF_INFO } from '@/lib/constants'

export interface MapRow {
  key: string
  total: number
  verified: number
  divergence: number
  coveragePct: number
}

function colorFor(r: MapRow): string {
  if ((r?.divergence ?? 0) > 0) return '#f59e0b'
  if ((r?.coveragePct ?? 0) >= 50) return '#22c55e'
  if ((r?.coveragePct ?? 0) > 0) return '#86efac'
  return '#94a3b8'
}

export default function UfMap({ rows }: { rows: MapRow[] }) {
  const router = useRouter()
  const byUf = new Map((rows ?? []).map((r: MapRow) => [r.key, r]))
  return (
    <MapContainer center={[-14.5, -52]} zoom={4} scrollWheelZoom={false} className="h-full w-full rounded-lg" style={{ minHeight: 380 }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {Object.entries(UF_INFO).map(([uf, info]) => {
        const r = byUf.get(uf)
        const has = !!r && (r.total ?? 0) > 0
        const c = r ? colorFor(r) : '#cbd5e1'
        return (
          <CircleMarker
            key={uf}
            center={[info.lat, info.lng]}
            radius={has ? 9 + Math.min(14, Math.sqrt(r?.total ?? 0) * 2.5) : 5}
            pathOptions={{ color: '#1e3a5f', weight: 1, fillColor: c, fillOpacity: has ? 0.85 : 0.35 }}
            eventHandlers={{ click: () => has && router.push(`/secoes?uf=${uf}`) }}
          >
            <Tooltip direction="top">
              <strong>
                {info.name} ({uf})
              </strong>
              <br />
              {has ? (
                <>
                  {r?.total} seções · {r?.coveragePct}% com BU cidadão
                  <br />
                  {r?.verified} verificadas · {r?.divergence} com divergência
                </>
              ) : (
                'Sem seções monitoradas'
              )}
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
