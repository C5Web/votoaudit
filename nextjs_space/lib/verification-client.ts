/** Envio de documentos de verificação pelo navegador (pasta privada do próprio usuário). */

export const VERIFICATION_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf'

export interface UploadedDoc {
  key: string
  path: string
  contentType: string
  name: string
}

export async function uploadVerificationDoc(file: File, key: string): Promise<UploadedDoc> {
  const contentType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg')
  const r = await fetch('/api/verification/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, contentType, size: file.size }),
  })
  const j = (await r.json().catch(() => ({}))) as { uploadUrl?: string; cloud_storage_path?: string; error?: string }
  if (!r.ok || !j.uploadUrl || !j.cloud_storage_path) throw new Error(j?.error ?? 'Falha ao preparar o envio do documento.')
  const put = await fetch(j.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file })
  if (!put.ok) throw new Error('Falha ao enviar o documento. Tente novamente.')
  return { key, path: j.cloud_storage_path, contentType, name: file.name }
}

export async function submitVerificationRequest(body: {
  kind: 'IDENTITY' | 'CREDENTIAL'
  requestedRole?: string
  uf?: string
  fields: Record<string, string>
  documents: UploadedDoc[]
}) {
  const r = await fetch('/api/verification/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = (await r.json().catch(() => ({}))) as { error?: string; id?: string }
  if (!r.ok) throw new Error(j?.error ?? 'Não foi possível enviar a solicitação.')
  return j
}
