'use client'

import { SessionProvider } from 'next-auth/react'
import { useEffect } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const onError = (e: ErrorEvent) => console.error('[VotoAudit] Erro no cliente:', e?.error ?? e?.message)
    const onRejection = (e: PromiseRejectionEvent) => console.error('[VotoAudit] Promessa rejeitada:', e?.reason)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return <SessionProvider>{children}</SessionProvider>
}
