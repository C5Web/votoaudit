'use client'

import { FileUp, Info } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ROLE_FORMS, UF_LIST, type RoleKey } from '@/lib/roles'
import { VERIFICATION_ACCEPT } from '@/lib/verification-client'

export const nativeSelectCls =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Campos extras do papel escolhido + envio do documento de comprovação. */
export function RoleFields({
  role,
  values,
  onChange,
  file,
  onFile,
  idPrefix = 'rf',
}: {
  role: string
  values: Record<string, string>
  onChange: (v: Record<string, string>) => void
  file: File | null
  onFile: (f: File | null) => void
  idPrefix?: string
}) {
  const form = ROLE_FORMS[role as RoleKey]
  if (!form) return null
  return (
    <div className="space-y-4 rounded-lg bg-muted/50 p-4">
      {form.fields.map((f) => {
        const id = `${idPrefix}-${f.key}`
        const v = values[f.key] ?? ''
        const set = (x: string) => onChange({ ...values, [f.key]: x })
        return (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={id}>{f.label}{f.required ? '' : ' (opcional)'}</Label>
            {f.type === 'select' || f.type === 'uf' ? (
              <select id={id} className={nativeSelectCls} value={v} required={f.required} onChange={(e) => set(e.target.value)}>
                <option value="">Selecione…</option>
                {(f.type === 'uf' ? UF_LIST : f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <Input id={id} value={v} required={f.required} maxLength={120} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} />
            )}
          </div>
        )
      })}
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-doc`}>{form.documentLabel}</Label>
        <label htmlFor={`${idPrefix}-doc`} className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-input bg-background px-3 py-3 text-sm hover:bg-muted">
          <FileUp className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{file ? file.name : 'Escolher foto ou PDF'}</span>
        </label>
        <input id={`${idPrefix}-doc`} type="file" accept={VERIFICATION_ACCEPT} className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        <p className="text-xs text-muted-foreground">{form.documentHint}</p>
      </div>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Um administrador confere os dados na fonte oficial. O documento fica em área privada e é apagado 30 dias após a decisão. Não pedimos CPF.
      </p>
    </div>
  )
}
