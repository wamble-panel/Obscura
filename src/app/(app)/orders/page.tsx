import type { Metadata } from 'next'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PERMISSIONS } from '@/lib/permissions'
import { OrdersView } from './orders-view'
import type { Client, Gear, StudioSession } from '@/lib/types'

export const metadata: Metadata = { title: 'Orders' }
export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  await requirePermission(PERMISSIONS.ordersView)

  const supabase = await createClient()
  const [sessionsRes, gearRes, clientsRes] = await Promise.all([
    supabase
      .from('sessions')
      .select('*, session_addons(*)')
      .order('date', { ascending: false })
      .limit(500),
    supabase.from('gear').select('*').eq('is_archived', false).order('rate', { ascending: false }),
    supabase.from('clients').select('*').eq('is_archived', false).order('name'),
  ])

  return (
    <OrdersView
      sessions={(sessionsRes.data ?? []) as StudioSession[]}
      gear={(gearRes.data ?? []) as Gear[]}
      clients={(clientsRes.data ?? []) as Client[]}
    />
  )
}
