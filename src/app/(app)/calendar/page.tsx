import type { Metadata } from 'next'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PERMISSIONS } from '@/lib/permissions'
import { pad } from '@/lib/format'
import { CalendarView } from './calendar-view'
import type { Client, Gear, StudioSession } from '@/lib/types'

export const metadata: Metadata = { title: 'Calendar' }
export const dynamic = 'force-dynamic'

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>
}) {
  await requirePermission(PERMISSIONS.ordersView)
  const { y, m } = await searchParams

  const now = new Date()
  const year = Number(y) || now.getFullYear()
  const month = y || m ? Math.min(11, Math.max(0, Number(m ?? now.getMonth()))) : now.getMonth()

  const from = `${year}-${pad(month + 1)}-01`
  const to = `${month === 11 ? year + 1 : year}-${pad(month === 11 ? 1 : month + 2)}-01`

  const supabase = await createClient()
  const [sessionsRes, gearRes, clientsRes] = await Promise.all([
    supabase
      .from('sessions')
      .select('*, session_addons(*)')
      .gte('date', from)
      .lt('date', to)
      .order('date')
      .order('start_hour'),
    supabase.from('gear').select('*').eq('is_archived', false).order('rate', { ascending: false }),
    supabase.from('clients').select('*').eq('is_archived', false).order('name'),
  ])

  return (
    <CalendarView
      sessions={(sessionsRes.data ?? []) as StudioSession[]}
      gear={(gearRes.data ?? []) as Gear[]}
      clients={(clientsRes.data ?? []) as Client[]}
      year={year}
      month={month}
    />
  )
}
