'use server'

import { revalidatePath } from 'next/cache'
import { assertPermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PERMISSIONS } from '@/lib/permissions'
import type { ActionResult } from '@/lib/types'

export type RentalInput = {
  id?: string
  gearId: string
  clientId?: string | null
  renterName: string
  renterPhone?: string | null
  qty: number
  startDate: string
  dueDate: string
  fee: number
  deposit: number
  conditionOut?: string | null
  notes?: string | null
  recordIncome?: boolean
}

function touched() {
  for (const p of ['/rentals', '/gear', '/finance', '/dashboard']) revalidatePath(p)
}

export async function saveRental(input: RentalInput): Promise<ActionResult> {
  try {
    await assertPermission(input.id ? PERMISSIONS.rentalsEdit : PERMISSIONS.rentalsCreate)

    if (!input.gearId) return { ok: false, error: 'Pick a piece of equipment.' }
    if (!input.renterName.trim()) return { ok: false, error: 'Who is renting it?' }
    if (!input.dueDate) return { ok: false, error: 'Set a return date.' }
    if (input.dueDate < input.startDate) {
      return { ok: false, error: 'The return date cannot be before the pickup date.' }
    }

    const supabase = await createClient()

    const { data: gear } = await supabase
      .from('gear')
      .select('id, name, status')
      .eq('id', input.gearId)
      .single()
    if (!gear) return { ok: false, error: 'That equipment no longer exists.' }

    if (!input.id) {
      if (gear.status === 'maint') {
        return { ok: false, error: 'That item is in for repair.' }
      }
      const { data: clash } = await supabase
        .from('rentals')
        .select('code')
        .eq('gear_id', input.gearId)
        .in('status', ['active', 'overdue'])
        .limit(1)
      if (clash?.length) {
        return { ok: false, error: `Already out on rental ${clash[0].code}.` }
      }
    }

    const row = {
      gear_id: input.gearId,
      gear_name: gear.name,
      client_id: input.clientId || null,
      renter_name: input.renterName.trim(),
      renter_phone: input.renterPhone?.trim() || null,
      qty: Math.max(1, Math.round(input.qty)),
      start_date: input.startDate,
      due_date: input.dueDate,
      fee: Math.max(0, input.fee),
      deposit: Math.max(0, input.deposit),
      condition_out: input.conditionOut?.trim() || null,
      notes: input.notes?.trim() || null,
    }

    let rentalId = input.id
    if (input.id) {
      const { error } = await supabase.from('rentals').update(row).eq('id', input.id)
      if (error) return { ok: false, error: error.message }
    } else {
      const { data, error } = await supabase.from('rentals').insert(row).select('id, code').single()
      if (error) return { ok: false, error: error.message }
      rentalId = data.id

      if (input.recordIncome !== false && row.fee > 0) {
        await supabase.from('ledger_entries').insert({
          type: 'in',
          category: 'Rental',
          label: `${gear.name} — ${row.renter_name}`,
          amount: row.fee,
          date: row.start_date,
          ref_type: 'rental',
          ref_id: rentalId,
        })
      }
    }

    touched()
    return { ok: true, message: 'Rental saved' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function returnRental(id: string, condition?: string): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.rentalsEdit)
    const supabase = await createClient()

    const { error } = await supabase
      .from('rentals')
      .update({
        status: 'returned',
        returned_at: new Date().toISOString(),
        condition_in: condition?.trim() || null,
      })
      .eq('id', id)

    if (error) return { ok: false, error: error.message }
    touched()
    return { ok: true, message: 'Marked returned' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function deleteRental(id: string): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.rentalsDelete)
    const supabase = await createClient()
    const { error } = await supabase.from('rentals').delete().eq('id', id)
    if (error) return { ok: false, error: error.message }
    touched()
    return { ok: true, message: 'Rental removed' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
