import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Keeps the Supabase project awake.
 *
 * A free Supabase project is paused after ~7 days without activity, which would
 * take the studio offline. Vercel Cron calls this once a day (see vercel.json);
 * a GitHub Action does the same as a backup in case the deployment changes.
 *
 * It also flags rentals that are past their due date, so the overdue badges are
 * correct the moment someone opens the app in the morning.
 *
 * Protect it by setting CRON_SECRET. Vercel sends it automatically as
 * `Authorization: Bearer <CRON_SECRET>` for scheduled invocations.
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

  const startedAt = Date.now()

  const { data: pingedAt, error } = await supabase.rpc('ping_keepalive', {
    p_source: request.nextUrl.searchParams.get('source') ?? 'cron',
  })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // Housekeeping that only the service role is allowed to do.
  let overdue: number | null = null
  if (serviceKey) {
    const { data } = await supabase.rpc('mark_overdue_rentals')
    overdue = typeof data === 'number' ? data : null
  }

  return NextResponse.json({
    ok: true,
    pingedAt,
    overdueMarked: overdue,
    tookMs: Date.now() - startedAt,
  })
}

/** Same behaviour for POST, so the GitHub Action can use either verb. */
export const POST = GET
