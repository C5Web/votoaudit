'use client'

import { useState } from 'react'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { Mail, Lock, User, Loader2, LogIn, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RoleFields, nativeSelectCls } from '@/components/verification/role-fields'
import { PUBLIC_ROLES, UF_LIST, ROLE_FORMS, validateRoleFields, type RoleKey } from '@/lib/roles'
import { ROLE_LABEL } from '@/lib/constants'
import { submitVerificationRequest, uploadVerificationDoc } from '@/lib/verification-client'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  )
}

export function AuthForm({ mode, googleEnabled, callbackUrl }: { mode: 'login' | 'signup'; googleEnabled: boolean; callbackUrl: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [uf, setUf] = useState('')
  const [desiredRole, setDesiredRole] = useState<string>('CITIZEN')
  const [roleValues, setRoleValues] = useState<Record<string, string>>({})
  const [docFile, setDocFile] = useState<File | null>(null)
  const [stage, setStage] = useState('')
  const target = callbackUrl?.startsWith('/') ? callbackUrl : '/coletar'
  const institutional = mode === 'signup' && desiredRole !== 'CITIZEN' && !!ROLE_FORMS[desiredRole as RoleKey]

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        if (!uf) {
          setError('Selecione a sua UF.')
          return
        }
        if (institutional) {
          const v = validateRoleFields(desiredRole, roleValues)
          if (v.error) {
            setError(v.error)
            return
          }
          if (!docFile) {
            setError(`Envie: ${ROLE_FORMS[desiredRole as RoleKey]?.documentLabel ?? 'documento de comprovação'}.`)
            return
          }
        }
        setStage('Criando conta…')
        const r = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, uf, desiredRole }),
        })
        const j = (await r.json().catch(() => ({}))) as { error?: string }
        if (!r.ok) {
          setError(j?.error ?? 'Não foi possível criar a conta.')
          return
        }
      }
      const res = await signIn('credentials', { email, password, redirect: false })
      if (res?.error) {
        setError('E-mail ou senha inválidos.')
        return
      }
      if (mode === 'signup') {
        let next = '/meu-perfil?cadastro=ok'
        if (institutional && docFile) {
          try {
            setStage('Enviando documento…')
            const doc = await uploadVerificationDoc(docFile, 'credential')
            setStage('Registrando solicitação…')
            await submitVerificationRequest({ kind: 'CREDENTIAL', requestedRole: desiredRole, uf, fields: roleValues, documents: [doc] })
            next = '/meu-perfil?cadastro=ok&pedido=ok'
          } catch (err) {
            console.error(err)
            next = '/meu-perfil?cadastro=ok&pedido=erro'
          }
        }
        window.location.href = next
        return
      }
      window.location.href = target
    } catch (err) {
      console.error(err)
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
      setStage('')
    }
  }

  return (
    <div className="space-y-5">
      {googleEnabled && (
        <>
          <Button type="button" variant="outline" className="w-full" onClick={() => signIn('google', { callbackUrl: target })}>
            <GoogleIcon /> Continuar com Google
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" /></div>
        </>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        {mode === 'signup' && (
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome de exibição</Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="name" className="pl-10" value={name} onChange={(e) => setName(e.target.value)} placeholder="Como quer ser identificado (não é público)" />
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="email" name="email" type="email" required autoComplete="email" className="pl-10" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="password" name="password" type="password" required minLength={mode === 'signup' ? 8 : 1} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className="pl-10" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'Mínimo de 8 caracteres' : 'Sua senha'} />
          </div>
        </div>
        {mode === 'signup' && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="uf">UF onde vai atuar</Label>
              <select id="uf" className={nativeSelectCls} value={uf} required onChange={(e) => setUf(e.target.value)}>
                <option value="">Selecione…</option>
                {UF_LIST.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Quero atuar como…</Label>
              <select id="role" className={nativeSelectCls} value={desiredRole} onChange={(e) => { setDesiredRole(e.target.value); setRoleValues({}); setDocFile(null) }}>
                {PUBLIC_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>)}
              </select>
              {institutional && (
                <p className="text-xs text-muted-foreground">Enquanto a credencial é analisada, você já pode coletar evidências como cidadão.</p>
              )}
            </div>
            {institutional && (
              <RoleFields role={desiredRole} values={roleValues} onChange={setRoleValues} file={docFile} onFile={setDocFile} idPrefix="signup" />
            )}
          </>
        )}
        {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === 'login' ? <LogIn className="mr-2 h-4 w-4" /> : <UserPlus className="mr-2 h-4 w-4" />}
          {loading && stage ? stage : mode === 'login' ? 'Entrar' : 'Criar conta'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {mode === 'login' ? (
          <>Não tem conta? <Link href="/signup" className="font-medium text-primary hover:underline">Cadastre-se</Link></>
        ) : (
          <>Já tem conta? <Link href="/login" className="font-medium text-primary hover:underline">Entrar</Link></>
        )}
      </p>
    </div>
  )
}
