'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function ProfileForm({ displayName, organization, organizationLocked = false }: { displayName: string; organization: string; organizationLocked?: boolean }) {
  const router = useRouter()
  const [name, setName] = useState(displayName ?? '')
  const [org, setOrg] = useState(organization ?? '')
  const [saving, setSaving] = useState(false)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: name, organization: org }) })
      const j = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) throw new Error(j?.error ?? 'Falha ao salvar.')
      toast.success('Perfil atualizado.')
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="space-y-1.5"><Label htmlFor="dn">Nome de exibição</Label><Input id="dn" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={60} required /></div>
      <div className="space-y-1.5"><Label htmlFor="org">Organização (opcional)</Label><Input id="org" value={org} onChange={(e) => setOrg(e.target.value)} maxLength={100} placeholder="Entidade, observatório, etc." disabled={organizationLocked} />{organizationLocked && <p className="text-xs text-muted-foreground">Definida pela credencial verificada.</p>}</div>
      <Button type="submit" disabled={saving} className="w-full">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar</Button>
    </form>
  )
}
