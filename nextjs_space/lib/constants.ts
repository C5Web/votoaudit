// Constantes de domínio do VotoAudit (compartilhadas por backend e frontend).
// Candidatos SEMPRE fictícios — nunca usar nomes reais de candidatos ou partidos.

export interface DemoCandidate {
  number: string
  name: string
}

export const DEMO_OFFICE = 'Cargo demonstrativo'

export const DEMO_CANDIDATES: DemoCandidate[] = [
  { number: '91', name: 'Candidato A' },
  { number: '92', name: 'Candidato B' },
  { number: '93', name: 'Candidato C' },
  { number: '94', name: 'Candidato D' },
  { number: '95', name: 'Candidato E' },
]

export function candidateName(num: string): string {
  return DEMO_CANDIDATES.find((c: DemoCandidate) => c.number === num)?.name ?? `Nº ${num}`
}

export const UF_INFO: Record<string, { name: string; lat: number; lng: number }> = {
  AC: { name: 'Acre', lat: -9.0238, lng: -70.812 },
  AL: { name: 'Alagoas', lat: -9.5713, lng: -36.782 },
  AP: { name: 'Amapá', lat: 1.4102, lng: -51.77 },
  AM: { name: 'Amazonas', lat: -3.4168, lng: -65.8561 },
  BA: { name: 'Bahia', lat: -12.5797, lng: -41.7007 },
  CE: { name: 'Ceará', lat: -5.4984, lng: -39.3206 },
  DF: { name: 'Distrito Federal', lat: -15.7998, lng: -47.8645 },
  ES: { name: 'Espírito Santo', lat: -19.1834, lng: -40.3089 },
  GO: { name: 'Goiás', lat: -15.827, lng: -49.8362 },
  MA: { name: 'Maranhão', lat: -4.9609, lng: -45.2744 },
  MT: { name: 'Mato Grosso', lat: -12.6819, lng: -56.9211 },
  MS: { name: 'Mato Grosso do Sul', lat: -20.7722, lng: -54.7852 },
  MG: { name: 'Minas Gerais', lat: -18.5122, lng: -44.555 },
  PA: { name: 'Pará', lat: -3.9, lng: -52.4 },
  PB: { name: 'Paraíba', lat: -7.24, lng: -36.782 },
  PR: { name: 'Paraná', lat: -25.2521, lng: -52.0215 },
  PE: { name: 'Pernambuco', lat: -8.8137, lng: -36.9541 },
  PI: { name: 'Piauí', lat: -7.7183, lng: -42.7289 },
  RJ: { name: 'Rio de Janeiro', lat: -22.35, lng: -42.8 },
  RN: { name: 'Rio Grande do Norte', lat: -5.4026, lng: -36.9541 },
  RS: { name: 'Rio Grande do Sul', lat: -30.0346, lng: -53.2 },
  RO: { name: 'Rondônia', lat: -11.5057, lng: -63.5806 },
  RR: { name: 'Roraima', lat: 2.7376, lng: -62.0751 },
  SC: { name: 'Santa Catarina', lat: -27.2423, lng: -50.2189 },
  SP: { name: 'São Paulo', lat: -22.2, lng: -48.6 },
  SE: { name: 'Sergipe', lat: -10.5741, lng: -37.3857 },
  TO: { name: 'Tocantins', lat: -10.1753, lng: -48.2982 },
}

export const SECTION_STATUS_LABEL: Record<string, string> = {
  VERIFIED: 'Verificado',
  DIVERGENCE: 'Divergência',
  PARTIAL: 'Parcial',
  PENDING: 'Não verificado',
  NO_EVIDENCE: 'Sem evidência',
}

export const SEVERITY_LABEL: Record<string, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
}

export const INCIDENT_STATUS_LABEL: Record<string, string> = {
  DETECTED: 'Detectado',
  AUTOMATED_CHECK: 'Checagem automática',
  NEEDS_REVIEW: 'Aguardando revisão',
  CORROBORATING: 'Em corroboração',
  RESOLVED: 'Resolvido',
  CONFIRMED: 'Confirmado',
  INCONCLUSIVE: 'Inconclusivo',
}

export const INCIDENT_CATEGORY_LABEL: Record<string, string> = {
  BU_DIVERGENCE: 'Divergência de BU',
  ZERESIMA_INCONSISTENCY: 'Inconsistência na Zerésima',
  AVPART_MISMATCH: 'Divergência AVPART',
  QR_INVALID: 'QR Code inválido',
  DUPLICATE_SUBMISSION: 'Envio duplicado',
  SUSPICIOUS_METADATA: 'Metadados atípicos',
  OTHER: 'Outro',
}

export const EVENT_TYPE_LABEL: Record<string, string> = {
  INTEGRITY_TEST: 'Teste de Integridade',
  BIOMETRIC_INTEGRITY_TEST: 'Teste de Integridade com Biometria',
  BALLOT_BOX_PREPARATION: 'Preparação de urnas',
  TRANSMISSION_AUDIT: 'Auditoria de transmissão',
  TOTALIZATION_AUDIT: 'Auditoria de totalização',
  SOURCE_INSPECTION: 'Inspeção de código-fonte',
  OTHER: 'Outro',
}

export const EVENT_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Agendado',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
}

export const EVIDENCE_TYPE_LABEL: Record<string, string> = {
  BU: 'Boletim de Urna',
  ZERESIMA: 'Zerésima',
  AVPART: 'AVPART',
  INTEGRITY_TEST: 'Teste de Integridade',
  MINUTES: 'Ata',
  INCIDENT_PHOTO: 'Foto de ocorrência',
  VIDEO: 'Vídeo',
  REPORT: 'Relatório',
  HASH_REPORT: 'Relatório de hashes',
}

export const EVIDENCE_STATUS_LABEL: Record<string, string> = {
  RECEIVED: 'Recebida',
  PROCESSING: 'Processando',
  VALIDATED: 'Validada',
  REJECTED: 'Rejeitada',
  NEEDS_REVIEW: 'Em revisão',
}

export const PROVENANCE_LABEL: Record<string, string> = {
  ANONYMOUS: 'Anônima',
  AUTHENTICATED: 'Conta autenticada',
  VERIFIED: 'Identidade verificada',
  CREDENTIALED: 'Credenciado',
}

export const ROLE_LABEL: Record<string, string> = {
  CITIZEN: 'Cidadão',
  PARTY_INSPECTOR: 'Fiscal de partido/federação',
  PARTY_REP: 'Representante de partido',
  OAB_LAWYER: 'OAB',
  PUBLIC_PROSECUTOR: 'Ministério Público',
  PUBLIC_DEFENDER: 'Defensoria Pública',
  AUDITOR: 'Auditor técnico',
  ENTITY_REP: 'Representante de entidade',
  INTEGRITY_OBSERVER: 'Observador',
  PRESS: 'Imprensa',
  MODERATOR: 'Moderador',
  ADMIN: 'Administrador',
  SUPER_ADMIN: 'Administrador geral',
}

/** Rótulo público do tipo de fonte (nunca inclui nome ou e-mail). */
export const ROLE_SOURCE_LABEL: Record<string, string> = {
  CITIZEN: 'cidadão',
  PARTY_INSPECTOR: 'fiscal de partido',
  PARTY_REP: 'representante de partido',
  OAB_LAWYER: 'advogado(a) da OAB',
  PUBLIC_PROSECUTOR: 'membro do Ministério Público',
  PUBLIC_DEFENDER: 'membro da Defensoria Pública',
  AUDITOR: 'auditor técnico',
  ENTITY_REP: 'representante de entidade',
  INTEGRITY_OBSERVER: 'observador',
  PRESS: 'profissional de imprensa',
  MODERATOR: 'equipe VotoAudit',
  ADMIN: 'equipe VotoAudit',
  SUPER_ADMIN: 'equipe VotoAudit',
}

const LEVEL_SUFFIX: Record<string, string> = {
  CREDENTIAL_VERIFIED: 'com credencial verificada',
  IDENTITY_VERIFIED: 'com identidade verificada',
  EMAIL_VERIFIED: 'com e-mail verificado',
}

export function publicSourceLabel(role?: string | null, level?: string | null): string {
  if (!role) return 'fonte anônima'
  const base = ROLE_SOURCE_LABEL[role] ?? 'coletor'
  const suffix = level ? LEVEL_SUFFIX[level] : ''
  return suffix ? `${base} ${suffix}` : `${base} sem verificação`
}

export const VERIFICATION_LABEL: Record<string, string> = {
  ANONYMOUS: 'Sem verificação',
  EMAIL_VERIFIED: 'E-mail verificado',
  IDENTITY_VERIFIED: 'Identidade verificada',
  CREDENTIAL_VERIFIED: 'Credencial verificada',
}

export const VALIDATION_RESULT_LABEL: Record<string, string> = {
  CORROBORATED: 'Corroborado',
  DIVERGENCE_FOUND: 'Divergência encontrada',
  INSUFFICIENT_EVIDENCE: 'Evidência insuficiente',
  PENDING: 'Pendente',
}

export const CONFIDENCE_LABEL: Record<string, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
}

export const JOB_TYPE_LABEL: Record<string, string> = {
  VALIDATE_BU: 'Validar BU',
  CROSS_VALIDATE_SECTION: 'Cross-validation de seção',
  INGEST_TSE_DATA: 'Ingestão TSE',
  PROCESS_QR: 'Processar QR',
  GENERATE_INCIDENT: 'Gerar incidente',
  NOTIFY_COLLECTOR: 'Notificar coletor',
}

/** Mapeia o status da seção para os 3 estados canônicos de evidência. */
export type EvidenceState = 'VERIFIED' | 'DIVERGENCE' | 'UNVERIFIED'
export function sectionState(status?: string | null): EvidenceState {
  if (status === 'VERIFIED') return 'VERIFIED'
  if (status === 'DIVERGENCE') return 'DIVERGENCE'
  return 'UNVERIFIED'
}
