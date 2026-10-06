import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const base = host ? `https://${host}` : (process.env.NEXTAUTH_URL ?? 'http://localhost:3000')
  return ['', '/dashboard', '/secoes', '/eventos', '/incidentes', '/login', '/signup'].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: 'hourly' as const,
    priority: p === '' ? 1 : 0.7,
  }))
}
