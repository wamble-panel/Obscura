import type { Metadata } from 'next'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PERMISSIONS } from '@/lib/permissions'
import { GearView } from './gear-view'
import type { Gear, Rental } from '@/lib/types'

export const metadata: Metadata = { title: 'Gear' }
export const dynamic = 'force-dynamic'

export default async function GearPage() {
  await requirePermission(PERMISSIONS.gearView)

  const supabase = await createClient()
  const [gearRes, rentalsRes] = await Promise.all([
    supabase.from('gear').select('*').eq('is_archived', false).order('category').order('name'),
    supabase.from('rentals').select('*').in('status', ['active', 'overdue']),
  ])

  return (
    <GearView
      gear={(gearRes.data ?? []) as Gear[]}
      openRentals={(rentalsRes.data ?? []) as Rental[]}
    />
  )
}
