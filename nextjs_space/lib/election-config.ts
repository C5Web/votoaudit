/**
 * Seleção e parâmetros da eleição corrente — SEM hardcode de ano ou turno.
 *
 * Objetivo: a aplicação funciona para qualquer eleição (2026, 2028, ...) sem
 * alteração de código. A "eleição ativa" é resolvida dinamicamente e os
 * parâmetros de auditoria (horários de encerramento, limiares de abstenção,
 * fuso) vêm dos campos configuráveis do modelo Election.
 *
 * Regra de resolução (nesta ordem):
 *   1. A eleição marcada como ACTIVE pelo painel administrativo.
 *   2. A eleição mais recente que já possui seções cadastradas (o catálogo
 *      geográfico está sempre no turno onde a ingestão ocorreu).
 *   3. A eleição mais recente cadastrada (fallback).
 *
 * Assim, para habilitar a próxima eleição basta cadastrá-la e ingerir os dados;
 * opcionalmente o admin a marca como ACTIVE. Nenhuma data fica fixa no código.
 */
import type { Election } from '@prisma/client'
import { prisma } from './db'

export async function getActiveElection(): Promise<Election | null> {
  const active = await prisma.election.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: [{ year: 'desc' }, { round: 'asc' }],
  })
  if (active) return active

  const withSections = await prisma.election.findFirst({
    where: { sections: { some: {} } },
    orderBy: [{ year: 'desc' }, { round: 'asc' }],
  })
  if (withSections) return withSections

  return prisma.election.findFirst({ orderBy: [{ year: 'desc' }, { round: 'asc' }] })
}

/** Todas as eleições (turnos) de um ano, em ordem de turno. */
export async function getElectionCycle(year: number): Promise<Election[]> {
  return prisma.election.findMany({ where: { year }, orderBy: { round: 'asc' } })
}

/** Eleição específica por ano e turno (chave única year_round). */
export async function getElectionByRound(year: number, round: number): Promise<Election | null> {
  return prisma.election.findUnique({ where: { year_round: { year, round } } })
}

/** Converte "HH:mm" em minutos desde a meia-noite. Default 17:00 (1020). */
export function timeToMinutes(hhmm?: string | null, fallback = '17:00'): number {
  const s = (hhmm && /^\d{1,2}:\d{2}$/.test(hhmm) ? hhmm : fallback).split(':')
  return Number(s[0]) * 60 + Number(s[1])
}

/**
 * Parâmetros de auditoria efetivos de uma eleição, com defaults seguros.
 * `officialCloseMin` = horário oficial de encerramento; `extendedCloseMin` =
 * prorrogação oficialmente autorizada (se houver), sempre >= oficial.
 */
export function auditParams(e: Pick<Election, 'officialCloseTime' | 'extendedCloseTime' | 'timezone' | 'abstentionLowPct' | 'abstentionHighPct'>) {
  const officialCloseMin = timeToMinutes(e.officialCloseTime, '17:00')
  const extendedCloseMin = e.extendedCloseTime ? Math.max(officialCloseMin, timeToMinutes(e.extendedCloseTime, e.officialCloseTime)) : null
  return {
    officialCloseTime: e.officialCloseTime || '17:00',
    extendedCloseTime: e.extendedCloseTime || null,
    officialCloseMin,
    extendedCloseMin,
    timezone: e.timezone || 'America/Sao_Paulo',
    abstentionLowPct: e.abstentionLowPct ?? 15,
    abstentionHighPct: e.abstentionHighPct ?? 35,
  }
}
