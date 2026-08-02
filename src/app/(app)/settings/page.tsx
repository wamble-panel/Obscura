import type { Metadata } from 'next'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { PERMISSIONS } from '@/lib/permissions'
import { SettingsView } from './settings-view'

export const metadata: Metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  await requirePermission(PERMISSIONS.settingsView)

  const { studio, pricing } = await getSettings()
  const supabase = await createClient()
  const { data: keepalive } = await supabase
    .from('keepalive')
    .select('pinged_at, hits, source')
    .eq('id', 1)
    .maybeSingle()

  return <SettingsView studio={studio} pricing={pricing} keepalive={keepalive ?? null} />
}
