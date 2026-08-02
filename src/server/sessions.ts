'use server'

import { revalidatePath } from 'next/cache'
import { assertPermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { priceSession } from '@/lib/format'
import { PERMISSIONS } from '@/lib/permissions'
import type { ActionResult, SessionPackage, SessionStatus } from '@/lib/types'

export type SessionInput = {
  id?: string
  clientId?: string | null
  clientName: string
  phone?: string | null
  shootType: string
  date: string
  startHour: number
  package: SessionPackage
  hours: number
  addonGearIds: string[]
  notes?: string | null
  depositPaid?: boolean
  status?: SessionStatus
}

function touched() {
  for (const path of ['/calendar', '/orders', '/dashboard', '/finance', '/clients']) {
    revalidatePath(path)
  }
}

/** Turns a Postgres error into something a human can act on. */
function friendly(message: string): string {
  if (message.includes('already booked')) {
    return message.replace(/^.*?(The studio is already booked[^.]*\.)/, '$1')
  }
  if (message.includes('row-level security')) {
    return 'You do not have permission to do that.'
  }
  return message
}

export async function saveSession(input: SessionInput): Promise<ActionResult> {
  try {
    await assertPermission(input.id ? PERMISSIONS.ordersEdit : PERMISSIONS.ordersCreate)

    const supabase = await createClient()
    const { pricing } = await getSettings()

    if (!input.clientName?.trim()) return { ok: false, error: 'Enter a client name.' }
    if (!input.date) return { ok: false, error: 'Pick a date.' }

    // Add-on prices come from the gear table, never from the browser.
    let addonTotal = 0
    let addons: { gear_id: string; name: string; price: number }[] = []
    if (input.addonGearIds.length) {
      const { data: gear } = await supabase
        .from('gear')
        .select('id, name, rate')
        .in('id', input.addonGearIds)
      addons = (gear ?? []).map((g) => ({ gear_id: g.id, name: g.name, price: Number(g.rate) }))
      addonTotal = addons.reduce((sum, a) => sum + a.price, 0)
    }

    const priced = priceSession(input.package, input.hours, addonTotal, pricing)

    const row = {
      client_id: input.clientId || null,
      client_name: input.clientName.trim(),
      phone: input.phone?.trim() || null,
      shoot_type: input.shootType,
      date: input.date,
      start_hour: input.startHour,
      package: input.package,
      hours: priced.hours,
      base_amount: priced.base,
      addons_amount: priced.addons,
      total_amount: priced.total,
      deposit_amount: priced.deposit,
      deposit_paid: input.depositPaid ?? false,
      status: input.status ?? 'pending',
      notes: input.notes?.trim() || null,
    }

    let sessionId = input.id

    if (input.id) {
      const { error } = await supabase.from('sessions').update(row).eq('id', input.id)
      if (error) return { ok: false, error: friendly(error.message) }
      await supabase.from('session_addons').delete().eq('session_id', input.id)
    } else {
      const { data, error } = await supabase.from('sessions').insert(row).select('id').single()
      if (error) return { ok: false, error: friendly(error.message) }
      sessionId = data.id
    }

    if (sessionId && addons.length) {
      await supabase
        .from('session_addons')
        .insert(addons.map((a) => ({ ...a, session_id: sessionId })))
    }

    touched()
    return { ok: true, message: 'Session saved' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function setSessionStatus(id: string, status: SessionStatus): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.ordersEdit)
    const supabase = await createClient()
    const { error } = await supabase.from('sessions').update({ status }).eq('id', id)
    if (error) return { ok: false, error: friendly(error.message) }
    touched()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function setDepositPaid(id: string, paid: boolean): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.ordersEdit)
    const supabase = await createClient()

    const { data: session } = await supabase
      .from('sessions')
      .select('id, code, client_name, deposit_amount, status')
      .eq('id', id)
      .single()

    const patch: Record<string, unknown> = { deposit_paid: paid }
    // Paying the deposit is what confirms a booking.
    if (paid && session?.status === 'pending') patch.status = 'confirmed'

    const { error } = await supabase.from('sessions').update(patch).eq('id', id)
    if (error) return { ok: false, error: friendly(error.message) }

    // Record the deposit in the ledger so the money page stays honest.
    if (paid && session && Number(session.deposit_amount) > 0) {
      await supabase.from('ledger_entries').insert({
        type: 'in',
        category: 'Session',
        label: `${session.client_name} — deposit (${session.code})`,
        amount: session.deposit_amount,
        date: new Date().toISOString().slice(0, 10),
        ref_type: 'session',
        ref_id: id,
      })
    }

    touched()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function deleteSession(id: string): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.ordersDelete)
    const supabase = await createClient()
    const { error } = await supabase.from('sessions').delete().eq('id', id)
    if (error) return { ok: false, error: friendly(error.message) }
    touched()
    return { ok: true, message: 'Session removed' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
