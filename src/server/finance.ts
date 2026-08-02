'use server'

import { revalidatePath } from 'next/cache'
import { assertPermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PERMISSIONS } from '@/lib/permissions'
import type { ActionResult, LedgerType } from '@/lib/types'

export type LedgerInput = {
  id?: string
  type: LedgerType
  category: string
  label: string
  amount: number
  date: string
  method?: string
  notes?: string | null
}

export async function saveLedgerEntry(input: LedgerInput): Promise<ActionResult> {
  try {
    await assertPermission(input.id ? PERMISSIONS.financeEdit : PERMISSIONS.financeCreate)
    if (!input.amount || input.amount <= 0) return { ok: false, error: 'Enter an amount.' }
    if (!input.date) return { ok: false, error: 'Pick a date.' }

    const supabase = await createClient()
    const row = {
      type: input.type,
      category: input.category,
      label: input.label.trim() || input.category,
      amount: input.amount,
      date: input.date,
      method: input.method || 'cash',
      notes: input.notes?.trim() || null,
    }

    const { error } = input.id
      ? await supabase.from('ledger_entries').update(row).eq('id', input.id)
      : await supabase.from('ledger_entries').insert(row)

    if (error) return { ok: false, error: error.message }
    revalidatePath('/finance')
    revalidatePath('/dashboard')
    return { ok: true, message: 'Entry saved' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function deleteLedgerEntry(id: string): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.financeDelete)
    const supabase = await createClient()
    const { error } = await supabase.from('ledger_entries').delete().eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/finance')
    revalidatePath('/dashboard')
    return { ok: true, message: 'Entry removed' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
