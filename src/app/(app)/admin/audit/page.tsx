import type { Metadata } from 'next'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PERMISSIONS } from '@/lib/permissions'
import { AuditView } from './audit-view'
import type { AuditEntry, PresenceRow } from '@/lib/types'

export const metadata: Metadata = { title: 'Audit log' }
export const dynamic = 'force-dynamic'

export default async function AuditPage() {
  await requirePermission(PERMISSIONS.auditView)

  const supabase = await createClient()
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const [entriesRes, presenceRes, todayRes] = await Promise.all([
    supabase.from('audit_log').select('*').order('id', { ascending: false }).limit(60),
    supabase.rpc('presence_board'),
    supabase
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfDay.toISOString()),
  ])

  return (
    <AuditView
      entries={(entriesRes.data ?? []) as AuditEntry[]}
      presence={(presenceRes.data ?? []) as PresenceRow[]}
      totalToday={todayRes.count ?? 0}
    />
  )
}
