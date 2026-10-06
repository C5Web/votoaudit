'use client'

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts'

export interface TimelinePoint {
  label: string
  count: number
  cumulative: number
}

export default function TimelineChart({ data }: { data: TimelinePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data ?? []} margin={{ top: 10, right: 16, left: 8, bottom: 30 }}>
        <XAxis dataKey="label" tickLine={false} tick={{ fontSize: 10 }} interval="preserveStartEnd" angle={-30} textAnchor="end" height={50} />
        <YAxis tickLine={false} tick={{ fontSize: 10 }} allowDecimals={false} width={40} label={{ value: 'BUs', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 11 } }} />
        <Tooltip contentStyle={{ fontSize: 11 }} />
        <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="cumulative" name="Acumulado" stroke="#1e3a5f" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="count" name="Por hora" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
