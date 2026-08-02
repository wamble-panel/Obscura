'use server'

import { revalidatePath } from 'next/cache'
import { assertPermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PERMISSIONS } from '@/lib/permissions'
import { monthPeriod } from '@/lib/format'
import type { ActionResult } from '@/lib/types'

export type MemberInput = {
  id?: string
  name: string
  roleTitle: string
  salary: number
  perVideo: number
  phone?: string | null
  profileId?: string | null
}

function touched() {
  for (const p of ['/team', '/projects', '/finance', '/dashboard']) revalidatePath(p)
}

export async function saveMember(input: MemberInput): Promise<ActionResult> {
  try {
    await assertPermission(input.id ? PERMISSIONS.teamEdit : PERMISSIONS.teamCreate)
    if (!input.name.trim()) return { ok: false, error: 'Enter their name.' }

    const supabase = await createClient()
    const row = {
      name: input.name.trim(),
      role_title: input.roleTitle.trim() || 'Editor',
      salary: Math.max(0, input.salary),
      per_video: Math.max(0, input.perVideo),
      phone: input.phone?.trim() || null,
      profile_id: input.profileId || null,
    }

    const { error } = input.id
      ? await supabase.from('team_members').update(row).eq('id', input.id)
      : await supabase.from('team_members').insert(row)

    if (error) return { ok: false, error: error.message }
    touched()
    return { ok: true, message: 'Team member saved' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function deleteMember(id: string): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.teamDelete)
    const supabase = await createClient()

    const { count } = await supabase
      .from('project_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', id)

    if (count && count > 0) {
      const { error } = await supabase.from('team_members').update({ is_active: false }).eq('id', id)
      if (error) return { ok: false, error: error.message }
      touched()
      return { ok: true, message: 'Marked inactive (their delivery history is kept)' }
    }

    const { error } = await supabase.from('team_members').delete().eq('id', id)
    if (error) return { ok: false, error: error.message }
    touched()
    return { ok: true, message: 'Removed from the team' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Marks a salary paid for the current month and books it as an expense. */
export async function paySalary(memberId: string, period?: string): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.teamPayroll)
    const supabase = await createClient()
    const targetPeriod = period ?? monthPeriod()

    const { data: member } = await supabase
      .from('team_members')
      .select('id, name, salary')
      .eq('id', memberId)
      .single()
    if (!member) return { ok: false, error: 'That team member no longer exists.' }

    const { data: existing } = await supabase
      .from('payroll')
      .select('id, paid_at')
      .eq('member_id', memberId)
      .eq('period', targetPeriod)
      .maybeSingle()

    if (existing?.paid_at) return { ok: false, error: 'Already paid for this month.' }

    const paidAt = new Date().toISOString()

    if (existing) {
      const { error } = await supabase
        .from('payroll')
        .update({ amount: member.salary, paid_at: paidAt })
        .eq('id', existing.id)
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await supabase.from('payroll').insert({
        member_id: memberId,
        member_name: member.name,
        period: targetPeriod,
        amount: member.salary,
        paid_at: paidAt,
      })
      if (error) return { ok: false, error: error.message }
    }

    await supabase.from('ledger_entries').insert({
      type: 'out',
      category: 'Salary',
      label: `${member.name} — ${targetPeriod}`,
      amount: member.salary,
      date: paidAt.slice(0, 10),
      ref_type: 'payroll',
      ref_id: memberId,
    })

    touched()
    return { ok: true, message: 'Salary recorded' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
