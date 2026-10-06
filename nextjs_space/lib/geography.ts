// Lógica de negócio para ingestão do catálogo geográfico oficial do TSE
// (UF / município / zona / seção) a partir dos arquivos "Eleitorado por local de
// votação" do Portal de Dados Abertos (CSV, separador ';', codificação latin1).
//
// Mantida em /lib (sem dependência de Next) para ser reaproveitada tanto pelo
// script de carga quanto por um backend futuro (ex.: FastAPI na VPS).

import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { prisma } from '@/lib/db';

// Índices das colunas no arquivo eleitorado_local_votacao_<ANO>_<UF>.csv
export const GEO_COLUMNS = {
  uf: 6, // SG_UF
  municipality: 8, // NM_MUNICIPIO
  zone: 9, // NR_ZONA
  section: 10, // NR_SECAO
  pollingPlace: 15, // NM_LOCAL_VOTACAO
  address: 18, // DS_ENDERECO
  neighborhood: 19, // NM_BAIRRO
  eligibleVoters: 34, // QT_ELEITOR_SECAO
} as const;

export interface GeographyRow {
  uf: string;
  municipality: string;
  zone: string; // zero-padded (4) para casar com a convenção do app
  section: string; // zero-padded (4)
  pollingPlace: string | null;
  address: string | null;
  eligibleVoters: number | null;
}

// Divide uma linha CSV com separador ';' respeitando aspas duplas.
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ';' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function cleanText(v: string | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  if (!t || t === '#NULO#' || t === '#NE#' || t === '-1' || t === '-3') return null;
  // Normaliza capitalização de nomes em caixa alta vinda do TSE.
  return t;
}

function toInt(v: string | undefined): number | null {
  if (v == null) return null;
  const n = parseInt(v.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function mapGeographyRow(fields: string[]): GeographyRow | null {
  const uf = cleanText(fields[GEO_COLUMNS.uf]);
  const zoneRaw = cleanText(fields[GEO_COLUMNS.zone]);
  const sectionRaw = cleanText(fields[GEO_COLUMNS.section]);
  const municipality = cleanText(fields[GEO_COLUMNS.municipality]);
  if (!uf || !zoneRaw || !sectionRaw || !municipality) return null;
  if (uf.length !== 2) return null; // ignora linhas de exterior/ZZ se indesejadas? mantém se 2 letras
  return {
    uf,
    municipality,
    zone: zoneRaw.padStart(4, '0'),
    section: sectionRaw.padStart(4, '0'),
    pollingPlace: cleanText(fields[GEO_COLUMNS.pollingPlace]),
    address: cleanText(fields[GEO_COLUMNS.address]),
    eligibleVoters: toInt(fields[GEO_COLUMNS.eligibleVoters]),
  };
}

export interface IngestOptions {
  electionId: string;
  batchSize?: number; // linhas por INSERT (padrão 2000, abaixo do timeout de 5s)
  update?: boolean; // se true, atualiza seções já existentes (eleitores/local/endereço)
  onProgress?: (info: { read: number; inserted: number; updated: number; skipped: number }) => void;
}

export interface IngestResult {
  read: number;
  inserted: number;
  updated: number;
  skipped: number;
}

// Lê um CSV do TSE e faz upsert de ElectionSection em lotes, de forma idempotente.
// Seções já existentes (incl. dados de demonstração) são preservadas por padrão
// (skipDuplicates). Passe update=true para atualizar os campos cadastrais.
export async function ingestSectionsFromCsv(
  filePath: string,
  opts: IngestOptions,
): Promise<IngestResult> {
  const batchSize = opts.batchSize ?? 2000;
  const result: IngestResult = { read: 0, inserted: 0, updated: 0, skipped: 0 };
  const seen = new Set<string>();
  let buffer: GeographyRow[] = [];
  let isHeader = true;

  const flush = async () => {
    if (buffer.length === 0) return;
    const rows = buffer;
    buffer = [];
    const created = await prisma.electionSection.createMany({
      data: rows.map((r) => ({
        electionId: opts.electionId,
        uf: r.uf,
        municipality: r.municipality,
        zone: r.zone,
        section: r.section,
        pollingPlace: r.pollingPlace,
        address: r.address,
        eligibleVoters: r.eligibleVoters,
      })),
      skipDuplicates: true,
    });
    result.inserted += created.count;
    result.skipped += rows.length - created.count;
    if (opts.update) {
      // Atualiza apenas as que já existiam (as puladas), por chave única.
      for (const r of rows) {
        try {
          await prisma.electionSection.updateMany({
            where: { electionId: opts.electionId, uf: r.uf, zone: r.zone, section: r.section },
            data: {
              municipality: r.municipality,
              pollingPlace: r.pollingPlace,
              address: r.address,
              eligibleVoters: r.eligibleVoters,
            },
          });
        } catch {
          /* ignora falha pontual de atualização */
        }
      }
    }
    opts.onProgress?.(result);
  };

  const stream = createReadStream(filePath, { encoding: 'latin1' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (isHeader) {
      isHeader = false;
      continue;
    }
    if (!line.trim()) continue;
    result.read++;
    const row = mapGeographyRow(splitCsvLine(line));
    if (!row) {
      result.skipped++;
      continue;
    }
    const key = `${row.uf}|${row.zone}|${row.section}`;
    if (seen.has(key)) {
      result.skipped++;
      continue;
    }
    seen.add(key);
    buffer.push(row);
    if (buffer.length >= batchSize) {
      await flush();
    }
  }
  await flush();
  return result;
}
