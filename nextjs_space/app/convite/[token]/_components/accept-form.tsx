'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { Loader2, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AcceptInviteForm({ token, accountExists }: { token: string; accountExists: boolean }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const r = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, name, password }),
      })
      const j = (await r.json().catch(() => ({}))) as { error?: string; role?: string }
      if (!r.ok) {
        setError(j?.error ?? 'Não foi possível aceitar o convite.')
        return
      }
      const res = await signIn('credentials', { email, password, redirect: false })
      if (res?.error) {
        window.location.href = '/login'
        return
      }
      window.location.href = ['MODERATOR', 'ADMIN'].includes(j?.role ?? '') ? '/admin' : '/meu-perfil'
    } catch (err) {
      console.error(err)
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5"><Label htmlFor="inv-email">E-mail convidado</Label><Input id="inv-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      {!accountExists && (
        <div className="space-y-1.5"><Label htmlFor="inv-name">Nome de exibição</Label><Input id="inv-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="inv-pass">{accountExists ? 'Senha da sua conta' : 'Crie uma senha'}</Label>
        <Input id="inv-pass" type="password" required minLength={accountExists ? 1 : 8} autoComplete={accountExists ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={accountExists ? '' : 'Mínimo de 8 caracteres'} />
      </div>
      {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />} Aceitar convite</Button>
    </form>
  )
}
