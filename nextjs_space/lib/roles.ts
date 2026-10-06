/**
 * Papéis, hierarquia administrativa e formulários de cadastro por papel.
 * Arquivo sem dependências de servidor: usado no cliente (formulários) e na API (validação).
 */
import { UF_INFO } from './constants'

export const UF_LIST = Object.keys(UF_INFO).sort()

export type RoleKey =
  | 'CITIZEN'
  | 'PARTY_INSPECTOR'
  | 'PARTY_REP'
  | 'OAB_LAWYER'
  | 'PUBLIC_PROSECUTOR'
  | 'PUBLIC_DEFENDER'
  | 'AUDITOR'
  | 'ENTITY_REP'
  | 'INTEGRITY_OBSERVER'
  | 'PRESS'
  | 'MODERATOR'
  | 'ADMIN'
  | 'SUPER_ADMIN'

/** 3 = administrador geral, 2 = administrador, 1 = moderador, 0 = demais. */
export const ROLE_RANK: Record<string, number> = { SUPER_ADMIN: 3, ADMIN: 2, MODERATOR: 1 }
export const rankOf = (role?: string | null): number => ROLE_RANK[role ?? ''] ?? 0
export const isStaffRole = (role?: string | null) => rankOf(role) >= 1

/** Papéis que podem ser escolhidos no cadastro público ("Quero atuar como…"). */
export const PUBLIC_ROLES: RoleKey[] = [
  'CITIZEN',
  'PARTY_INSPECTOR',
  'PARTY_REP',
  'OAB_LAWYER',
  'PUBLIC_PROSECUTOR',
  'PUBLIC_DEFENDER',
  'INTEGRITY_OBSERVER',
  'PRESS',
  'AUDITOR',
]

/** Papéis institucionais (exigem credencial). */
export const CREDENTIAL_ROLES: RoleKey[] = PUBLIC_ROLES.filter((r) => r !== 'CITIZEN')

export interface RoleField {
  key: string
  label: string
  type?: 'text' | 'select' | 'uf'
  options?: string[]
  required?: boolean
  placeholder?: string
}

export interface RoleForm {
  fields: RoleField[]
  /** Campo usado como "organização" no perfil. */
  orgKey?: string
  documentLabel: string
  documentHint: string
  /** Como o administrador confere (exibido na fila de análise). */
  howToVerify: string
  officialSource?: { label: string; url: string }
  /** Domínios de e-mail compatíveis com o órgão (apenas indício). */
  emailDomainPattern?: RegExp
}

const FULL_NAME: RoleField = { key: 'fullName', label: 'Nome completo', required: true, placeholder: 'Usado só na verificação, nunca é público' }

export const ROLE_FORMS: Partial<Record<RoleKey, RoleForm>> = {
  PARTY_INSPECTOR: {
    fields: [
      FULL_NAME,
      { key: 'party', label: 'Partido ou federação', required: true, placeholder: 'Sigla ou nome' },
      { key: 'area', label: 'Município/zona de atuação', required: true, placeholder: 'Ex.: São Paulo — zona 001' },
    ],
    orgKey: 'party',
    documentLabel: 'Credencial do partido (foto ou PDF)',
    documentHint: 'Credencial de fiscal emitida pelo partido ou federação.',
    howToVerify: 'Confira a credencial emitida pelo partido/federação. Em caso de dúvida, confirme com o representante do partido cadastrado no sistema.',
    officialSource: { label: 'Partidos registrados no TSE', url: 'https://www.tse.jus.br/partidos/partidos-registrados-no-tse' },
  },
  PARTY_REP: {
    fields: [
      FULL_NAME,
      { key: 'party', label: 'Partido ou federação', required: true },
      { key: 'position', label: 'Cargo', required: true, placeholder: 'Ex.: delegado(a)' },
      { key: 'scope', label: 'Abrangência', type: 'select', options: ['Municipal', 'Estadual', 'Nacional'], required: true },
    ],
    orgKey: 'party',
    documentLabel: 'Documento de designação',
    documentHint: 'Ato ou carta do partido que designa você como delegado/representante.',
    howToVerify: 'Confira o documento de designação assinado pelo órgão partidário e a abrangência informada.',
    officialSource: { label: 'Partidos registrados no TSE', url: 'https://www.tse.jus.br/partidos/partidos-registrados-no-tse' },
  },
  OAB_LAWYER: {
    fields: [
      FULL_NAME,
      { key: 'oabNumber', label: 'Número de inscrição na OAB', required: true },
      { key: 'oabSection', label: 'Seccional (UF)', type: 'uf', required: true },
      { key: 'commission', label: 'Comissão (se houver)' },
    ],
    orgKey: 'oabSection',
    documentLabel: 'Carteira da OAB',
    documentHint: 'Foto da carteira (frente) ou certidão de inscrição.',
    howToVerify: 'Pesquise o nome, o número e a seccional no Cadastro Nacional dos Advogados e confira com a carteira enviada.',
    officialSource: { label: 'Cadastro Nacional dos Advogados (CNA)', url: 'https://cna.oab.org.br/' },
    emailDomainPattern: /(^|\.)oab[a-z]*\.org\.br$/i,
  },
  PUBLIC_PROSECUTOR: {
    fields: [
      FULL_NAME,
      { key: 'agency', label: 'Órgão', required: true, placeholder: 'Ex.: MPSP, MPF' },
      { key: 'position', label: 'Cargo', required: true },
      { key: 'registration', label: 'Matrícula', required: true },
    ],
    orgKey: 'agency',
    documentLabel: 'Identidade funcional',
    documentHint: 'Carteira funcional do Ministério Público.',
    howToVerify: 'Confira nome e cargo no portal de transparência do órgão informado. E-mail institucional (@mp….mp.br) é um indício forte.',
    officialSource: { label: 'Portal da Transparência do CNMP', url: 'https://www.cnmp.mp.br/portal/transparencia' },
    emailDomainPattern: /(^|\.)mp[a-z]*\.mp\.br$|(^|\.)mpf\.mp\.br$|\.mp\.br$/i,
  },
  PUBLIC_DEFENDER: {
    fields: [
      FULL_NAME,
      { key: 'agency', label: 'Órgão', required: true, placeholder: 'Ex.: DPE-SP, DPU' },
      { key: 'position', label: 'Cargo', required: true },
      { key: 'registration', label: 'Matrícula', required: true },
    ],
    orgKey: 'agency',
    documentLabel: 'Identidade funcional',
    documentHint: 'Carteira funcional da Defensoria Pública.',
    howToVerify: 'Confira nome e cargo no portal de transparência da Defensoria informada. E-mail institucional (.def.br) é um indício forte.',
    emailDomainPattern: /\.def\.br$|defensoria/i,
  },
  INTEGRITY_OBSERVER: {
    fields: [
      FULL_NAME,
      { key: 'entity', label: 'Entidade', required: true },
      { key: 'observerType', label: 'Tipo', type: 'select', options: ['Nacional', 'Internacional'], required: true },
    ],
    orgKey: 'entity',
    documentLabel: 'Comprovante de credenciamento',
    documentHint: 'Credenciamento na Justiça Eleitoral ou carta da entidade.',
    howToVerify: 'Confira o credenciamento na Justiça Eleitoral e a existência da entidade de origem.',
  },
  PRESS: {
    fields: [
      FULL_NAME,
      { key: 'outlet', label: 'Veículo', required: true },
      { key: 'position', label: 'Função', required: true },
    ],
    orgKey: 'outlet',
    documentLabel: 'Carta do veículo ou registro profissional',
    documentHint: 'Documento que comprove o vínculo com o veículo.',
    howToVerify: 'Confira o vínculo pelo e-mail do veículo e pela carta ou registro profissional.',
  },
  AUDITOR: {
    fields: [
      FULL_NAME,
      { key: 'institution', label: 'Instituição', required: true },
      { key: 'field', label: 'Área de atuação', required: true },
    ],
    orgKey: 'institution',
    documentLabel: 'Comprovante de vínculo',
    documentHint: 'Declaração da instituição (universidade, instituto, entidade fiscalizadora).',
    howToVerify: 'Confira a vinculação com a entidade fiscalizadora informada.',
  },
}

export const IDENTITY_FORM = {
  documents: [
    { key: 'document', label: 'Documento com foto', hint: 'RG, CNH ou passaporte (frente).' },
    { key: 'selfie', label: 'Selfie segurando o documento', hint: 'Rosto e documento visíveis na mesma foto.' },
  ],
  howToVerify: 'Compare o rosto da selfie com a foto do documento e confira se o nome do documento corresponde ao nome informado.',
}

/** Valida e normaliza os campos do papel. Retorna erro em pt-BR ou os valores limpos. */
export function validateRoleFields(role: string, raw: Record<string, unknown>): { error?: string; values: Record<string, string> } {
  const form = ROLE_FORMS[role as RoleKey]
  const values: Record<string, string> = {}
  if (!form) return { error: 'Papel inválido para solicitação.', values }
  for (const f of form.fields) {
    const v = String(raw?.[f.key] ?? '').trim().slice(0, 120)
    if (f.required && !v) return { error: `Preencha o campo “${f.label}”.`, values }
    if (f.type === 'uf' && v && !UF_LIST.includes(v)) return { error: `UF inválida em “${f.label}”.`, values }
    if (f.type === 'select' && v && !(f.options ?? []).includes(v)) return { error: `Opção inválida em “${f.label}”.`, values }
    if (v) values[f.key] = v
  }
  return { values }
}

export function organizationFrom(role: string, values: Record<string, string>): string | null {
  const form = ROLE_FORMS[role as RoleKey]
  if (!form?.orgKey) return null
  const v = values?.[form.orgKey]
  if (!v) return null
  return role === 'OAB_LAWYER' ? `OAB/${v}` : v
}

const GENERIC_DOMAINS = /^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|uol|bol|terra|ig|protonmail|proton)\./i

/** Indício (nunca aprova sozinho) sobre o domínio do e-mail. */
export function emailDomainHint(role: string, email: string): { tone: 'match' | 'generic' | 'neutral'; text: string } {
  const domain = (email.split('@')[1] ?? '').toLowerCase()
  const pattern = ROLE_FORMS[role as RoleKey]?.emailDomainPattern
  if (pattern && pattern.test(domain)) return { tone: 'match', text: `Domínio @${domain} compatível com o órgão informado.` }
  if (GENERIC_DOMAINS.test(domain)) return { tone: 'generic', text: `E-mail pessoal (@${domain}): confira com mais cuidado.` }
  return { tone: 'neutral', text: `Domínio @${domain}.` }
}

/** Papéis que um ator pode atribuir/convidar. O administrador geral nunca é atribuído pelo sistema. */
export function assignableRoles(actorRole: string): RoleKey[] {
  const r = rankOf(actorRole)
  if (r < 2) return []
  const base: RoleKey[] = [...PUBLIC_ROLES, 'ENTITY_REP', 'MODERATOR']
  return r >= 3 ? [...base, 'ADMIN'] : base
}

/** Um ator só age sobre quem está abaixo dele na hierarquia. */
export const canActOn = (actorRole: string, targetRole: string) => rankOf(actorRole) >= 2 && rankOf(targetRole) < rankOf(actorRole)
