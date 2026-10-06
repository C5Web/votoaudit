import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'VotoAudit — Auditoria cidadã',
    short_name: 'VotoAudit',
    description: 'Colete e verifique evidências do processo eleitoral brasileiro de forma apartidária.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#1e3a5f',
    lang: 'pt-BR',
    icons: [
      { src: '/icon-192-v1.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512-v1.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512-v1.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
