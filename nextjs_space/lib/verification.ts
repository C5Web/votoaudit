/**
 * Verificação de identidade e de credenciais institucionais.
 * LGPD: documentos ficam em pasta privada por coletor e são apagados 30 dias após a decisão;
 * permanecem apenas o resultado, o motivo e quem decidiu.
 */
import type { Prisma } from '@prisma/client'
import { prisma } from './db'
import { appendAudit, type AuditActor } from './audit-log'
import { deleteFile, getShortLivedFileUrl, verificationPrefix } from './s3'
import { CREDENTIAL_ROLES, IDENTITY_FORM, ROLE_FORMS, emailDomainHint, organizationFrom, rankOf, validateRoleFields, type RoleKey } from './roles'
import { ROLE_LABEL } from './constants'
import { emailLayout, sendUserEmail, appBaseUrl } from './notify'

export const VERIFICATION_DOC_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
export const VERIFICATION_MAX_BYTES = 15 * 1024 * 1024
export const DOCUMENT_RETENTION_DAYS = 30

export interface StoredDoc {
  key: string
  path: string
  contentType: string
  name?: string
}

function httpError(message: string, status = 400) {
  return Object.assign(new Error(message), { status })
}

function parseDocs(raw: unknown, collectorId: string): StoredDoc[] {
  const prefix = verificationPrefix(collectorId)
  const list = Array.isArray(raw) ? raw : []
  return list.slice(0, 4).map((d) => {
    const o = (d ?? {}) as Record<string, unknown>
    const path = String(o.path ?? '')
    const contentType = String(o.contentType ?? '')
    if (!path.startsWith(prefix)) throw httpError('Documento inválido: envie o arquivo novamente.')
    if (!VERIFICATION_DOC_TYPES.includes(contentType)) throw httpError('Formato de documento não aceito.')
    return { key: String(o.key ?? 'document').slice(0, 30), path, contentType, name: String(o.name ?? '').slice(0, 120) || undefined }
  })
}

export async function createVerificationRequest(
  collector: { id: string; role: string },
  body: { kind?: string; requestedRole?: string; fields?: Record<string, unknown>; documents?: unknown; uf?: string }
) {
  const kind = body?.kind === 'IDENTITY' ? 'IDENTITY' : body?.kind === 'CREDENTIAL' ? 'CREDENTIAL' : null
  if (!kind) throw httpError('Tipo de solicitação inválido.')
  const docs = parseDocs(body?.documents, collector.id)
  const pending = await prisma.verificationRequest.findFirst({ where: { collectorId: collector.id, kind, status: 'PENDING' } })
  if (pending) throw httpError('Você já tem uma solicitação deste tipo em análise.', 409)

  if (kind === 'IDENTITY') {
    const fullName = String(body?.fields?.fullName ?? '').trim().slice(0, 120)
    if (!fullName) throw httpError('Informe o nome completo como aparece no documento.')
    for (const d of IDENTITY_FORM.documents) {
      if (!docs.some((x) => x.key === d.key)) throw httpError(`Envie: ${d.label}.`)
    }
    const req = await prisma.verificationRequest.create({
      data: { collectorId: collector.id, kind, fullName, documents: docs as unknown as Prisma.InputJsonValue },
    })
    await appendAudit({ id: collector.id, role: collector.role }, 'verification.request', { type: 'VerificationRequest', id: req.id }, { kind })
    return req
  }

  const role = String(body?.requestedRole ?? '')
  if (!CREDENTIAL_ROLES.includes(role as RoleKey)) throw httpError('Papel inválido para credenciamento.')
  if (rankOf(collector.role) >= 1) throw httpError('Contas da equipe não solicitam credenciais por aqui.')
  const { error, values } = validateRoleFields(role, body?.fields ?? {})
  if (error) throw httpError(error)
  if (!docs.length) throw httpError(`Envie: ${ROLE_FORMS[role as RoleKey]?.documentLabel ?? 'documento de comprovação'}.`)
  const uf = String(body?.uf ?? '').toUpperCase().slice(0, 2) || null
  const req = await prisma.$transaction(async (tx) => {
    const r = await tx.verificationRequest.create({
      data: {
        collectorId: collector.id,
        kind,
        requestedRole: role as RoleKey,
        uf,
        fullName: values.fullName ?? null,
        organization: organizationFrom(role, values),
        details: values,
        documents: docs as unknown as Prisma.InputJsonValue,
      },
    })
    await tx.collector.update({ where: { id: collector.id }, data: { credentialStatus: 'PENDING' } })
    return r
  })
  await appendAudit({ id: collector.id, role: collector.role }, 'verification.request', { type: 'VerificationRequest', id: req.id }, { kind, requestedRole: role })
  return req
}

/** Pedidos do próprio usuário (sem caminhos de arquivo). */
export async function listMyRequests(collectorId: string) {
  const rows = await prisma.verificationRequest.findMany({ where: { collectorId }, orderBy: { createdAt: 'desc' }, take: 20 })
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    requestedRole: r.requestedRole,
    organization: r.organization,
    status: r.status,
    decisionReason: r.decisionReason,
    reviewedAt: r.reviewedAt,
    createdAt: r.createdAt,
    documentsPurged: !!r.documentsPurgedAt,
  }))
}

export async function cancelMyRequest(collectorId: string, id: string) {
  const r = await prisma.verificationRequest.findUnique({ where: { id } })
  if (!r || r.collectorId !== collectorId) throw httpError('Solicitação não encontrada.', 404)
  if (r.status !== 'PENDING') throw httpError('Só é possível cancelar solicitações em análise.')
  const docs = (r.documents as unknown as StoredDoc[] | null) ?? []
  await Promise.all(docs.map((d) => deleteFile(d.path).catch(() => null)))
  await prisma.verificationRequest.update({ where: { id }, data: { status: 'CANCELLED', documents: [], documentsPurgedAt: new Date() } })
  if (r.kind === 'CREDENTIAL') {
    const c = await prisma.collector.findUnique({ where: { id: collectorId }, select: { credentialStatus: true } })
    if (c?.credentialStatus === 'PENDING') await prisma.collector.update({ where: { id: collectorId }, data: { credentialStatus: 'NONE' } })
  }
  return { ok: true }
}

/** Fila de análise. Moderador vê apenas identidade; administradores veem tudo. */
export async function listQueue(actorRole: string, status: 'PENDING' | 'DECIDED' = 'PENDING') {
  const rank = rankOf(actorRole)
  const where: Prisma.VerificationRequestWhereInput = {
    ...(status === 'PENDING' ? { status: 'PENDING' } : { status: { in: ['APPROVED', 'REJECTED'] } }),
    ...(rank < 2 ? { kind: 'IDENTITY' } : {}),
  }
  const rows = await prisma.verificationRequest.findMany({
    where,
    orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
    take: 50,
    include: {
      collector: { select: { id: true, displayName: true, role: true, verificationLevel: true, uf: true, user: { select: { email: true, emailVerified: true } } } },
      reviewedBy: { select: { displayName: true } },
    },
  })
  return rows.map((r) => {
    const email = r.collector.user?.email ?? ''
    const form = r.kind === 'CREDENTIAL' && r.requestedRole ? ROLE_FORMS[r.requestedRole as RoleKey] : null
    const docs = (r.documents as unknown as StoredDoc[] | null) ?? []
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      requestedRole: r.requestedRole,
      requestedRoleLabel: r.requestedRole ? ROLE_LABEL[r.requestedRole] ?? r.requestedRole : null,
      fullName: r.fullName,
      organization: r.organization,
      uf: r.uf,
      details: (r.details as Record<string, string> | null) ?? {},
      fieldLabels: Object.fromEntries((form?.fields ?? []).map((f) => [f.key, f.label])),
      documents: docs.map((d) => ({ key: d.key, contentType: d.contentType, name: d.name ?? null })),
      documentsPurged: !!r.documentsPurgedAt,
      howToVerify: r.kind === 'IDENTITY' ? IDENTITY_FORM.howToVerify : form?.howToVerify ?? '',
      officialSource: form?.officialSource ?? null,
      emailHint: r.kind === 'CREDENTIAL' && r.requestedRole ? emailDomainHint(r.requestedRole, email) : null,
      decisionReason: r.decisionReason,
      reviewedAt: r.reviewedAt,
      reviewedBy: r.reviewedBy?.displayName ?? null,
      createdAt: r.createdAt,
      collector: {
        id: r.collector.id,
        displayName: r.collector.displayName,
        role: r.collector.role,
        verificationLevel: r.collector.verificationLevel,
        uf: r.collector.uf,
        email,
        emailVerified: !!r.collector.user?.emailVerified,
      },
    }
  })
}

/** Gera URL de 5 minutos para um documento, com registro de auditoria da visualização. */
export async function documentUrl(actor: AuditActor & { role: string }, requestId: string, index: number) {
  const r = await prisma.verificationRequest.findUnique({ where: { id: requestId } })
  if (!r) throw httpError('Solicitação não encontrada.', 404)
  if (r.kind === 'CREDENTIAL' && rankOf(actor.role) < 2) throw httpError('Somente administradores analisam credenciais.', 403)
  if (r.collectorId === actor.id) throw httpError('Você não pode analisar a sua própria solicitação.', 403)
  const doc = ((r.documents as unknown as StoredDoc[] | null) ?? [])[index]
  if (!doc) throw httpError('Documento indisponível (pode ter sido apagado após 30 dias).', 404)
  const url = await getShortLivedFileUrl(doc.path, doc.contentType)
  await appendAudit(actor, 'verification.document_view', { type: 'VerificationRequest', id: r.id }, { document: doc.key })
  return { url, contentType: doc.contentType, expiresInSeconds: 300 }
}

const LEVEL_ORDER = ['ANONYMOUS', 'EMAIL_VERIFIED', 'IDENTITY_VERIFIED', 'CREDENTIAL_VERIFIED']

export async function decideRequest(actor: AuditActor & { id: string; role: string }, id: string, decision: string, reasonRaw?: string) {
  const reason = String(reasonRaw ?? '').trim().slice(0, 500)
  if (decision !== 'APPROVE' && decision !== 'REJECT') throw httpError('Decisão inválida.')
  if (decision === 'REJECT' && reason.length < 5) throw httpError('Informe o motivo da recusa (obrigatório).')
  const r = await prisma.verificationRequest.findUnique({
    where: { id },
    include: { collector: { include: { user: { select: { email: true } } } } },
  })
  if (!r) throw httpError('Solicitação não encontrada.', 404)
  if (r.status !== 'PENDING') throw httpError('Esta solicitação já foi decidida.', 409)
  if (r.collectorId === actor.id) throw httpError('Você não pode decidir a sua própria solicitação.', 403)
  if (r.kind === 'CREDENTIAL' && rankOf(actor.role) < 2) throw httpError('Somente administradores aprovam credenciais institucionais.', 403)
  if (rankOf(r.collector.role) >= rankOf(actor.role) && rankOf(r.collector.role) > 0) throw httpError('Você não pode agir sobre alguém do mesmo nível ou superior.', 403)

  const approved = decision === 'APPROVE'
  const target = r.collector
  await prisma.$transaction(async (tx) => {
    await tx.verificationRequest.update({
      where: { id },
      data: { status: approved ? 'APPROVED' : 'REJECTED', decisionReason: reason || null, reviewedById: actor.id, reviewedAt: new Date() },
    })
    if (r.kind === 'CREDENTIAL') {
      if (approved && r.requestedRole) {
        await tx.collector.update({
          where: { id: target.id },
          data: {
            // Equipe nunca é rebaixada por aprovação de credencial.
            ...(rankOf(target.role) === 0 ? { role: r.requestedRole } : {}),
            verificationLevel: 'CREDENTIAL_VERIFIED',
            credentialStatus: 'ACTIVE',
            organization: r.organization ?? target.organization,
          },
        })
      } else if (!approved && target.credentialStatus === 'PENDING') {
        await tx.collector.update({ where: { id: target.id }, data: { credentialStatus: 'NONE' } })
      }
    } else if (approved && LEVEL_ORDER.indexOf(target.verificationLevel) < LEVEL_ORDER.indexOf('IDENTITY_VERIFIED')) {
      await tx.collector.update({ where: { id: target.id }, data: { verificationLevel: 'IDENTITY_VERIFIED' } })
    }
  })
  await appendAudit(actor, approved ? 'verification.approve' : 'verification.reject', { type: 'VerificationRequest', id }, {
    kind: r.kind,
    requestedRole: r.requestedRole,
    collectorId: target.id,
    reason: reason || null,
  })

  const what = r.kind === 'IDENTITY' ? 'verificação de identidade' : `credencial de ${ROLE_LABEL[r.requestedRole ?? ''] ?? 'papel institucional'}`
  const email = target.user?.email
  if (email) {
    const paragraphs = approved
      ? [`Olá, ${target.displayName}.`, `Sua solicitação de ${what} foi aprovada.`, ...(reason ? [`Observação da análise: ${reason}`] : []), `Por proteção de dados, os documentos enviados serão apagados em até ${DOCUMENT_RETENTION_DAYS} dias. Fica registrado apenas o resultado.`]
      : [`Olá, ${target.displayName}.`, `Sua solicitação de ${what} não foi aprovada.`, `Motivo: ${reason}`, 'Você pode corrigir o que foi apontado e enviar uma nova solicitação pela página Meu perfil. Enquanto isso, continua podendo coletar evidências como cidadão.']
    await sendUserEmail(process.env.NOTIF_ID_RESULTADO_DA_VERIFICAO, email, approved ? 'VotoAudit — solicitação aprovada' : 'VotoAudit — solicitação não aprovada',
      emailLayout(approved ? 'Solicitação aprovada' : 'Solicitação não aprovada', paragraphs, { label: 'Abrir meu perfil', url: `${appBaseUrl()}/meu-perfil` }))
  }
  return { ok: true, status: approved ? 'APPROVED' : 'REJECTED' }
}

/** Apaga do armazenamento os documentos de pedidos decididos há mais de 30 dias. */
export async function purgeExpiredVerificationDocs(actor: AuditActor) {
  const cutoff = new Date(Date.now() - DOCUMENT_RETENTION_DAYS * 86400000)
  const rows = await prisma.verificationRequest.findMany({
    where: { documentsPurgedAt: null, status: { in: ['APPROVED', 'REJECTED', 'CANCELLED'] }, reviewedAt: { lt: cutoff } },
    select: { id: true, documents: true },
    take: 200,
  })
  let files = 0
  for (const r of rows) {
    const docs = (r.documents as unknown as StoredDoc[] | null) ?? []
    for (const d of docs) {
      await deleteFile(d.path).then(() => files++).catch((e) => console.error('Falha ao apagar documento', e))
    }
    await prisma.verificationRequest.update({ where: { id: r.id }, data: { documents: [], documentsPurgedAt: new Date() } })
  }
  if (rows.length) await appendAudit(actor, 'verification.purge_documents', null, { requests: rows.length, files })
  return { requests: rows.length, files }
}
