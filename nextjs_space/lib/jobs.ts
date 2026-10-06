/** Fila de jobs simples sobre a tabela JobQueue (processada sob demanda pelo painel admin). */
import type { JobType, Prisma } from '@prisma/client'
import { prisma } from './db'
import { crossValidateSection, crossValidateAll } from './cross-validation'
import { ingestCandidates, ingestOfficialBUs, ingestSections } from './tse-ingestor'
import { importTseCalendar } from './tse-calendar'

export async function enqueueJob(type: JobType, payload: Prisma.InputJsonValue) {
  return prisma.jobQueue.create({ data: { type, payload } })
}

export async function processPendingJobs(limit = 20) {
  const jobs = await prisma.jobQueue.findMany({
    where: { status: { in: ['PENDING', 'FAILED'] }, nextAttemptAt: { lte: new Date() } },
    orderBy: { id: 'asc' },
    take: limit,
  })
  let completed = 0
  let failed = 0
  for (const job of jobs) {
    await prisma.jobQueue.update({ where: { id: job.id }, data: { status: 'PROCESSING', attempts: { increment: 1 } } })
    try {
      const p = (job.payload ?? {}) as Record<string, string>
      const election = await prisma.election.findFirst({ where: { year: 2026, round: 1 } })
      const electionId = p?.electionId ?? election?.id ?? ''
      switch (job.type) {
        case 'CROSS_VALIDATE_SECTION':
          if (p?.sectionId) await crossValidateSection(p.sectionId)
          else await crossValidateAll(electionId)
          break
        case 'INGEST_TSE_DATA':
          if (p?.kind === 'candidates') await ingestCandidates(electionId)
          else if (p?.kind === 'sections') await ingestSections(electionId)
          else if (p?.kind === 'calendar') await importTseCalendar()
          else await ingestOfficialBUs(electionId)
          break
        default:
          break
      }
      await prisma.jobQueue.update({ where: { id: job.id }, data: { status: 'COMPLETED', completedAt: new Date(), errorMessage: null } })
      completed++
    } catch (e) {
      const attempts = job.attempts + 1
      const dead = attempts >= job.maxAttempts
      await prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: dead ? 'DEAD_LETTER' : 'FAILED',
          errorMessage: e instanceof Error ? e.message : String(e),
          nextAttemptAt: new Date(Date.now() + 60_000 * 2 ** attempts),
        },
      })
      failed++
    }
  }
  return { picked: jobs.length, completed, failed }
}
