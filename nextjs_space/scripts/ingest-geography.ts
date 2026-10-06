// Carga do catálogo geográfico oficial do TSE (UF / município / zona / seção).
//
// Fonte: Portal de Dados Abertos do TSE, conjunto "Eleitorado por local de
// votação - 2026" (um CSV por UF + um nacional). Os dados de demonstração
// (votos/BUs) são preservados: a carga usa skipDuplicates e não apaga nada.
//
// Uso (a partir de nextjs_space):
//   yarn tsx --require dotenv/config scripts/ingest-geography.ts --uf AC
//   yarn tsx --require dotenv/config scripts/ingest-geography.ts --uf AC,AP,DF
//   yarn tsx --require dotenv/config scripts/ingest-geography.ts --file /caminho/arquivo.csv
//   yarn tsx --require dotenv/config scripts/ingest-geography.ts --all        (arquivo BRASIL)
//   flags extras: --dir <pasta>  --round <1|2>  --update  --batch <n>
//
// Pasta padrão dos CSVs: defina a env TSE_GEO_DIR ou passe --dir <pasta>

import { existsSync } from 'fs';
import path from 'path';
import { prisma } from '@/lib/db';
import { ingestSectionsFromCsv } from '@/lib/geography';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const dir = arg('dir') ?? process.env.TSE_GEO_DIR ?? path.join(process.cwd(), 'tse_geo');
  const round = parseInt(arg('round') ?? '1', 10);
  const batchSize = parseInt(arg('batch') ?? '2000', 10);
  const update = flag('update');

  const election = await prisma.election.findFirst({ where: { round, year: 2026 } });
  if (!election) {
    console.error(`Eleição round=${round} year=2026 não encontrada.`);
    process.exit(1);
  }

  // Monta a lista de arquivos a processar.
  const files: string[] = [];
  const fileArg = arg('file');
  if (fileArg) {
    files.push(fileArg);
  } else if (flag('all')) {
    files.push(path.join(dir, 'eleitorado_local_votacao_2026_BRASIL.csv'));
  } else {
    const ufArg = arg('uf');
    if (!ufArg) {
      console.error('Informe --uf <UF[,UF...]>, --file <caminho> ou --all.');
      process.exit(1);
    }
    for (const uf of ufArg.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)) {
      files.push(path.join(dir, `eleitorado_local_votacao_2026_${uf}.csv`));
    }
  }

  const totals = { read: 0, inserted: 0, updated: 0, skipped: 0 };
  for (const file of files) {
    if (!existsSync(file)) {
      console.error(`Arquivo não encontrado, pulando: ${file}`);
      continue;
    }
    const started = Date.now();
    console.log(`\n→ Processando ${path.basename(file)} (eleição round=${round}) ...`);
    const res = await ingestSectionsFromCsv(file, {
      electionId: election.id,
      batchSize,
      update,
      onProgress: (p) => {
        if (p.read % 20000 === 0) {
          process.stdout.write(`   lidas=${p.read} inseridas=${p.inserted} puladas=${p.skipped}\r`);
        }
      },
    });
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `   OK ${path.basename(file)}: lidas=${res.read} inseridas=${res.inserted} ` +
        `atualizadas=${res.updated} puladas=${res.skipped} (${secs}s)`,
    );
    totals.read += res.read;
    totals.inserted += res.inserted;
    totals.updated += res.updated;
    totals.skipped += res.skipped;
  }

  const grand = await prisma.electionSection.count();
  console.log(
    `\n== Concluído == lidas=${totals.read} inseridas=${totals.inserted} ` +
      `atualizadas=${totals.updated} puladas=${totals.skipped}`,
  );
  console.log(`Total de seções no banco agora: ${grand}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
