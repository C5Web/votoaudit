import { NextResponse } from 'next/server'
import { jsonSafe } from './queries'

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(jsonSafe(data), { status })
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function handle<T>(fn: () => Promise<T>) {
  try {
    return ok(await fn())
  } catch (e) {
    const status = (e as { status?: number })?.status ?? 500
    console.error('API error', e)
    return fail(e instanceof Error && status < 500 ? e.message : 'Erro interno ao processar a requisição.', status)
  }
}
