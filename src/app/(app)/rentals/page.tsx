import type { Metadata } from 'next'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PERMISSIONS } from '@/lib/permissions'
import { RentalsView } from './rentals-view'
import type { Client, Gear, Rental } from '@/lib/types'

export const metadata: Metadata = { title: 'Rentals' }
export const dynamic = 'force-dynamic'

export default async function RentalsPage() {
  await requirePermission(PERMISSIONS.rentalsView)

  const supabase = await createClient()
  const [rentalsRes, gearRes, clientsRes] = await Promise.all([
    supabase.from('rentals').select('*').order('due_date', { ascending: false }).limit(400),
    supabase.from('gear').select('*').eq('is_archived', false).order('name'),
    supabase.from('clients').select('*').eq('is_archived', false).order('name'),
  ])

  return (
    <RentalsView
      rentals={(rentalsRes.data ?? []) as Rental[]}
      gear={(gearRes.data ?? []) as Gear[]}
      clients={(clientsRes.data ?? []) as Client[]}
    />
  )
}
