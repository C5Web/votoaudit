import { createHash } from 'crypto'

export function sha256Hex(input: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex')
}

export function sha512Hex(input: string | Buffer | Uint8Array): string {
  return createHash('sha512').update(input).digest('hex')
}

/** PRNG determinístico (mulberry32) para dados de demonstração reprodutíveis. */
export function seededRandom(seedText: string): () => number {
  let h = 1779033703 ^ (seedText?.length ?? 0)
  for (let i = 0; i < (seedText?.length ?? 0); i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
