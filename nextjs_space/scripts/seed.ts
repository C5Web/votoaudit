import { runDemoSeed } from '../lib/demo-seed'
import { prisma } from '../lib/db'

runDemoSeed()
  .then((r) => {
    console.log('Seed concluído:', r.log.join(' | '))
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
