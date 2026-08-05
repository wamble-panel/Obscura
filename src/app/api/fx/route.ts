import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { fetchLiveRates } from '@/lib/fx-fetch'
import { normalizeFx } from '@/lib/currency'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Pulls today's exchange rates and stores them.
 *
 * Vercel Cron calls this once a day (see vercel.json). Rates only move a
 * fraction of a percent between mornings, and an invoice freezes whatever was
 * current when it was written, so daily is plenty — and it means no page ever
 * waits on a third-party API to render.
 *
 * Writing to app_settings needs the service role, because the settings table is
 * only writable by a signed-in user with permission. Without that key the
 * request reports what it found without saving, which is still useful for
 * checking the sources are reachable.
 *
 * Protect it by setting CRON_SECRET, the same as /api/keepalive.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const header = request.headers.get('authorization')
    const query = request.nextUrl.searchParams.get('secret')
    if (header !== `Bearer ${secret}` && query !== secret) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const key = serviceKey || anonKey

  if (!url || !key) {
    return NextResponse.json(
      { ok: false, error: 'Supabase environment variables are not set' },
      { status: 500 },
    )
  }

  const supabase = createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Keep whatever is already stored, so a source that only knows the dollar
  // does not wipe the euro.
  const { data: row } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'fx')
    .maybeSingle()

  const previous = normalizeFx(row?.value)
  const result = await fetchLiveRates(previous)

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, tried: result.tried, rates: previous.rates },
      { status: 502 },
    )
  }

  if (!serviceKey) {
    return NextResponse.json({
      ok: true,
      saved: false,
      reason: 'SUPABASE_SERVICE_ROLE_KEY is not set, so the rates were not stored',
      ...result.fx,
    })
  }

  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'fx', value: result.fx, updated_at: new Date().toISOString() })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, saved: true, ...result.fx })
}

export const POST = GET
