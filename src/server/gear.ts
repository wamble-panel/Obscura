'use server'

import { revalidatePath } from 'next/cache'
import { assertPermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PERMISSIONS } from '@/lib/permissions'
import type { ActionResult, GearStatus } from '@/lib/types'

export type GearInput = {
  id?: string
  name: string
  category: string
  note?: string | null
  qty: number
  rate: number
  serial?: string | null
}

function touched() {
  for (const p of ['/gear', '/rentals', '/calendar', '/dashboard']) revalidatePath(p)
}

export async function saveGear(input: GearInput): Promise<ActionResult> {
  try {
    await assertPermission(input.id ? PERMISSIONS.gearEdit : PERMISSIONS.gearCreate)
    if (!input.name.trim()) return { ok: false, error: 'Give the equipment a name.' }

    const supabase = await createClient()
    const row = {
      name: input.name.trim(),
      category: input.category,
      note: input.note?.trim() || null,
      qty: Math.max(0, Math.round(input.qty)),
      rate: Math.max(0, input.rate),
      serial: input.serial?.trim() || null,
    }

    const { error } = input.id
      ? await supabase.from('gear').update(row).eq('id', input.id)
      : await supabase.from('gear').insert(row)

    if (error) return { ok: false, error: error.message }
    touched()
    return { ok: true, message: 'Equipment saved' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function setGearStatus(id: string, status: GearStatus): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.gearEdit)
    const supabase = await createClient()

    if (status !== 'out') {
      const { data: openRentals } = await supabase
        .from('rentals')
        .select('id')
        .eq('gear_id', id)
        .in('status', ['active', 'overdue'])
        .limit(1)
      if (openRentals?.length) {
        return { ok: false, error: 'This item is still out on rent — mark it returned first.' }
      }
    }

    const { error } = await supabase.from('gear').update({ status }).eq('id', id)
    if (error) return { ok: false, error: error.message }
    touched()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function deleteGear(id: string): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.gearDelete)
    const supabase = await createClient()

    const { data: rentals } = await supabase.from('rentals').select('id').eq('gear_id', id).limit(1)
    if (rentals?.length) {
      // Keep the rental history intact — archive instead of destroying it.
      const { error } = await supabase.from('gear').update({ is_archived: true }).eq('id', id)
      if (error) return { ok: false, error: error.message }
      touched()
      return { ok: true, message: 'Archived (it has rental history)' }
    }

    const { error } = await supabase.from('gear').delete().eq('id', id)
    if (error) return { ok: false, error: error.message }
    touched()
    return { ok: true, message: 'Equipment removed' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
