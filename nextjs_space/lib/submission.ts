/**
 * Regras de submissão de evidências (BU, Zerésima, Teste de Integridade...).
 * Mantido fora das rotas para facilitar a reimplementação em FastAPI.
 */
import type { Collector, EvidenceSourceType, EvidenceType, ProvenanceLevel } from '@prisma/client'
import { prisma } from './db'
import { sha256Hex } from './hash'
import { buildQrPayload, padZone, parseQrPayload, type BUData } from './qr'
import { crossValidateSection, type CrossValidationOutcome } from './cross-validation'
import { computeObjectSha256 } from './s3'

export class SubmissionError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export interface SubmitInput {
  sectionId: string
  type: EvidenceType
  method: 'QR' | 'PHOTO'
  collectorId?: string | null
  cloudStoragePath?: string | null
  clientSha256?: string | null
  fileSizeBytes?: number | null
  mimeType?: string | null
  qrRawPayload?: string | null
  buData?: Partial<BUData> | null
  capturedAt?: string | Date | null
  latitude?: number | null
  longitude?: number | null
  locationAccuracy?: number | null
  deviceId?: string | null
  notes?: string | null
  skipCrossValidation?: boolean
}

export interface SubmitResult {
  evidenceId: string
  sha256: string
  validationStatus: string
  provenanceLevel: ProvenanceLevel
  qrSignatureValid: boolean | null
  bulletinId: string | null
  incidentId: string | null
  crossValidation: CrossValidationOutcome | null
  message: string
}

function provenanceOf(c: Collector | null): ProvenanceLevel {
  if (!c) return 'ANONYMOUS'
  if (c.credentialStatus === 'ACTIVE' || c.verificationLevel === 'CREDENTIAL_VERIFIED') return 'CREDENTIALED'
  if (c.verificationLevel === 'IDENTITY_VERIFIED') return 'VERIFIED'
  return 'AUTHENTICATED'
}

function sourceTypeOf(type: EvidenceType, method: 'QR' | 'PHOTO', c: Collector | null): EvidenceSourceType {
  if (c?.role === 'AUDITOR' && type !== 'BU' && type !== 'ZERESIMA') return 'AUDITOR_REPORT'
  if (method === 'QR') return 'CITIZEN_QR'
  if (c?.role === 'PARTY_INSPECTOR') return 'FISCAL_PHOTO'
  return 'CITIZEN_PHOTO'
}

function normalizeVotes(v: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, val] of Object.entries((v ?? {}) as Record<string, unknown>)) {
    const n = Number(val)
    if (/^\d+$/.test(k) && Number.isFinite(n) && n >= 0) out[k] = Math.floor(n)
  }
  return out
}

export async function submitEvidence(input: SubmitInput): Promise<SubmitResult> {
  const section = await prisma.electionSection.findUnique({ where: { id: input?.sectionId ?? '' } })
  if (!section) throw new SubmissionError('Seção eleitoral não encontrada.', 404)
  const collector = input?.collectorId ? await prisma.collector.findUnique({ where: { id: input.collectorId } }) : null
  const provenanceLevel = provenanceOf(collector)
  const isAuthenticated = !!collector

  // ---- Dados do BU/Zerésima (QR ou transcrição manual) ----
  let parsed: BUData | null = null
  let qrSignatureValid: boolean | null = null
  let qrRaw: string | null = input?.qrRawPayload?.trim() || null
  if (input.type === 'BU' || input.type === 'ZERESIMA') {
    if (qrRaw) {
      const p = parseQrPayload(qrRaw)
      if (!p) throw new SubmissionError('Conteúdo do QR Code não pôde ser decodificado.')
      parsed = p
      qrSignatureValid = p.signatureValid
    } else if (input?.buData) {
      parsed = {
        uf: (input.buData.uf ?? section.uf).toUpperCase(),
        zone: padZone(input.buData.zone ?? section.zone),
        section: padZone(input.buData.section ?? section.section),
        ballotBoxId: input.buData.ballotBoxId ?? null,
        eligibleVoters: input.buData.eligibleVoters ?? null,
        turnout: input.buData.turnout ?? null,
        blankVotes: Number(input.buData.blankVotes ?? 0) || 0,
        nullVotes: Number(input.buData.nullVotes ?? 0) || 0,
        candidateVotes: normalizeVotes(input.buData.candidateVotes),
      }
      qrRaw = buildQrPayload(parsed)
      qrSignatureValid = input.method === 'QR' ? true : null
    } else {
      throw new SubmissionError('Informe os dados do QR Code ou a transcrição do boletim.')
    }
    if (parsed.uf !== section.uf || padZone(parsed.zone) !== padZone(section.zone) || padZone(parsed.section) !== padZone(section.section)) {
      throw new SubmissionError(
        `O QR Code indica ${parsed.uf} / zona ${parsed.zone} / seção ${parsed.section}, diferente da seção selecionada.`
      )
    }
  }

  // ---- Hash do arquivo (verificado no servidor quando há upload) ----
  let sha256Original: string | null = null
  let fileSize: number | null = input?.fileSizeBytes ?? null
  if (input?.cloudStoragePath) {
    const server = await computeObjectSha256(input.cloudStoragePath)
    if (server) {
      if (input.clientSha256 && input.clientSha256 !== server.sha256) {
        throw new SubmissionError('O SHA-256 calculado no servidor não confere com o do dispositivo. Reenvie o arquivo.')
      }
      sha256Original = server.sha256
      fileSize = server.size
    } else {
      sha256Original = input.clientSha256 ?? null
    }
  }
  sha256Original = sha256Original ?? input?.clientSha256 ?? (qrRaw ? sha256Hex(qrRaw) : null)
  if (!sha256Original) throw new SubmissionError('Nenhum arquivo ou conteúdo foi enviado.')

  // ---- Duplicidade: mesma fonte + mesmo conteúdo na mesma seção ----
  const deviceIdHash = input?.deviceId ? sha256Hex(input.deviceId) : null
  const dup = await prisma.evidence.findFirst({
    where: {
      sectionId: section.id,
      sha256Original,
      type: input.type,
      ...(collector ? { collectorId: collector.id } : { collectorId: null, deviceIdHash }),
    },
  })
  if (dup) throw new SubmissionError('Esta evidência já foi enviada por esta fonte para esta seção.', 409)

  const invalidQr = qrSignatureValid === false
  const evidence = await prisma.evidence.create({
    data: {
      electionId: section.electionId,
      sectionId: section.id,
      type: input.type,
      sourceType: sourceTypeOf(input.type, input.method, collector),
      collectorId: collector?.id ?? null,
      deviceIdHash,
      latitude: input?.latitude ?? null,
      longitude: input?.longitude ?? null,
      locationAccuracy: input?.locationAccuracy ?? null,
      originalFileKey: input?.cloudStoragePath ?? null,
      sha256Original,
      fileSizeBytes: fileSize != null ? BigInt(fileSize) : null,
      mimeType: input?.mimeType ?? null,
      qrRawPayload: qrRaw,
      qrParsedData: parsed ? (parsed as object) : undefined,
      qrSignatureValid,
      capturedAt: input?.capturedAt ? new Date(input.capturedAt) : new Date(),
      validationStatus: invalidQr ? 'NEEDS_REVIEW' : 'RECEIVED',
      provenanceLevel,
      notes: input?.notes ?? null,
    },
  })
  if (collector) {
    await prisma.collector.update({ where: { id: collector.id }, data: { submittedCount: { increment: 1 } } })
  }

  let bulletinId: string | null = null
  let incidentId: string | null = null
  let crossValidation: CrossValidationOutcome | null = null
  let message = 'Evidência recebida e preservada com SHA-256.'

  if (invalidQr) {
    // QR com assinatura inválida não entra na cross-validation.
    if (isAuthenticated) {
      const inc = await prisma.incident.create({
        data: {
          electionId: section.electionId,
          sectionId: section.id,
          severity: 'LOW',
          category: 'QR_INVALID',
          evidenceIds: [evidence.id],
          automatedFindings: { summary: 'O hash de integridade do QR Code não confere com o conteúdo lido.' },
          status: 'NEEDS_REVIEW',
          humanReview: [],
        },
      })
      incidentId = inc.id
    }
    message = 'QR Code com verificação de integridade inválida. A evidência foi preservada e enviada para revisão.'
  } else if (input.type === 'BU' && parsed) {
    const bu = await prisma.ballotBoxBulletin.create({
      data: {
        electionId: section.electionId,
        sectionId: section.id,
        evidenceId: evidence.id,
        collectorId: collector?.id ?? null,
        ballotBoxId: parsed.ballotBoxId ?? null,
        generatedAt: evidence.capturedAt,
        eligibleVoters: parsed.eligibleVoters ?? null,
        turnout: parsed.turnout ?? null,
        blankVotes: parsed.blankVotes ?? 0,
        nullVotes: parsed.nullVotes ?? 0,
        candidateVotes: parsed.candidateVotes ?? {},
        qrPayload: qrRaw,
        sha256: qrRaw ? sha256Hex(qrRaw) : sha256Original,
        source: collector?.role === 'PARTY_INSPECTOR' ? 'FISCAL' : 'CITIZEN',
      },
    })
    bulletinId = bu.id
    if (!input.skipCrossValidation) {
      const job = await prisma.jobQueue.create({
        data: { type: 'CROSS_VALIDATE_SECTION', payload: { sectionId: section.id, trigger: 'bu_submit' }, status: 'PROCESSING', attempts: 1 },
      })
      crossValidation = await crossValidateSection(section.id)
      await prisma.jobQueue.update({ where: { id: job.id }, data: { status: 'COMPLETED', completedAt: new Date() } })
      incidentId = crossValidation?.incidentId ?? null
      message =
        crossValidation.result === 'CORROBORATED'
          ? 'BU recebido e concordante com o BU oficial publicado.'
          : crossValidation.result === 'DIVERGENCE_FOUND'
            ? 'BU recebido. Foi identificada divergência — a seção foi encaminhada para revisão.'
            : 'BU recebido. Aguardando BU oficial ou outras fontes para cruzamento.'
    }
  } else if (input.type === 'ZERESIMA' && parsed) {
    const z = await registerZeresima({
      electionId: section.electionId,
      sectionId: section.id,
      evidenceId: evidence.id,
      collectorId: collector?.id ?? null,
      data: parsed,
      issuedAt: evidence.capturedAt,
    })
    incidentId = z.incidentId
    message = z.isConsistent
      ? 'Zerésima recebida: todos os contadores zerados (consistente).'
      : 'Zerésima recebida com contadores diferentes de zero. Inconsistência registrada para revisão.'
  } else {
    await prisma.evidence.update({ where: { id: evidence.id }, data: { validationStatus: 'VALIDATED', processedAt: new Date() } })
  }

  const final = await prisma.evidence.findUnique({ where: { id: evidence.id }, select: { validationStatus: true } })
  return {
    evidenceId: evidence.id,
    sha256: sha256Original,
    validationStatus: final?.validationStatus ?? 'RECEIVED',
    provenanceLevel,
    qrSignatureValid,
    bulletinId,
    incidentId,
    crossValidation,
    message,
  }
}

/** Registra uma Zerésima. total > 0 com fonte autenticada → Incident CRITICAL. */
export async function registerZeresima(args: {
  electionId: string
  sectionId: string
  evidenceId: string | null
  collectorId: string | null
  data: BUData
  issuedAt: Date
}) {
  const votes = args?.data?.candidateVotes ?? {}
  const totalVotes =
    Object.values(votes).reduce((a: number, b: number) => a + Number(b ?? 0), 0) +
    Number(args?.data?.blankVotes ?? 0) +
    Number(args?.data?.nullVotes ?? 0)
  const isConsistent = totalVotes === 0
  await prisma.zeresima.create({
    data: {
      electionId: args.electionId,
      sectionId: args.sectionId,
      evidenceId: args.evidenceId,
      ballotBoxId: args?.data?.ballotBoxId ?? null,
      issuedAt: args.issuedAt,
      candidateVotes: votes,
      totalVotes,
      isConsistent,
      collectorId: args.collectorId,
    },
  })
  if (args.evidenceId) {
    await prisma.evidence.update({
      where: { id: args.evidenceId },
      data: { validationStatus: isConsistent ? 'VALIDATED' : 'NEEDS_REVIEW', processedAt: new Date() },
    })
  }
  let incidentId: string | null = null
  // Evidências anônimas nunca geram incidentes sozinhas.
  if (!isConsistent && args.collectorId) {
    const inc = await prisma.incident.create({
      data: {
        electionId: args.electionId,
        sectionId: args.sectionId,
        severity: 'CRITICAL',
        category: 'ZERESIMA_INCONSISTENCY',
        evidenceIds: args.evidenceId ? [args.evidenceId] : [],
        automatedFindings: {
          summary: `A Zerésima registrou ${totalVotes} voto(s) antes do início da votação — era esperado total zero.`,
          totalVotes,
          candidateVotes: votes,
          blankVotes: args?.data?.blankVotes ?? 0,
          nullVotes: args?.data?.nullVotes ?? 0,
        },
        status: 'NEEDS_REVIEW',
        humanReview: [],
      },
    })
    incidentId = inc.id
  }
  return { isConsistent, totalVotes, incidentId }
}
