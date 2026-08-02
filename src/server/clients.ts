'use server'

import { revalidatePath } from 'next/cache'
import { assertPermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PERMISSIONS } from '@/lib/permissions'
import type { ActionResult } from '@/lib/types'

export type ClientInput = {
  id?: string
  name: string
  company?: string | null
  phone?: string | null
  email?: string | null
  notes?: string | null
}

export async function saveClient(input: ClientInput): Promise<ActionResult> {
  try {
    await assertPermission(input.id ? PERMISSIONS.clientsEdit : PERMISSIONS.clientsCreate)
    if (!input.name.trim()) return { ok: false, error: 'Enter the client name.' }

    const supabase = await createClient()
    const row = {
      name: input.name.trim(),
      company: input.company?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      notes: input.notes?.trim() || null,
    }

    const { error } = input.id
      ? await supabase.from('clients').update(row).eq('id', input.id)
      : await supabase.from('clients').insert(row)

    if (error) return { ok: false, error: error.message }
    revalidatePath('/clients')
    revalidatePath('/calendar')
    return { ok: true, message: 'Client saved' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function deleteClient(id: string): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.clientsDelete)
    const supabase = await createClient()

    const { count } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', id)

    if (count && count > 0) {
      // Their booking history matters more than a tidy list.
      const { error } = await supabase.from('clients').update({ is_archived: true }).eq('id', id)
      if (error) return { ok: false, error: error.message }
      revalidatePath('/clients')
      return { ok: true, message: 'Archived (they have booking history)' }
    }

    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/clients')
    return { ok: true, message: 'Client removed' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
