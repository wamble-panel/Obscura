import type { Metadata } from 'next'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PERMISSIONS } from '@/lib/permissions'
import { ClientsView } from './clients-view'
import type { Client } from '@/lib/types'

export const metadata: Metadata = { title: 'Clients' }
export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  await requirePermission(PERMISSIONS.clientsView)

  const supabase = await createClient()
  const [clientsRes, sessionsRes] = await Promise.all([
    supabase.from('clients').select('*').eq('is_archived', false).order('name'),
    supabase.from('sessions').select('client_id, total_amount, status'),
  ])

  // Roll the booking history up per client so the list can show real numbers.
  const stats: Record<string, { sessions: number; spend: number }> = {}
  for (const s of sessionsRes.data ?? []) {
    if (!s.client_id || s.status === 'cancelled') continue
    const entry = stats[s.client_id] ?? { sessions: 0, spend: 0 }
    entry.sessions += 1
    entry.spend += Number(s.total_amount)
    stats[s.client_id] = entry
  }

  return <ClientsView clients={(clientsRes.data ?? []) as Client[]} stats={stats} />
}
