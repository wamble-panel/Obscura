import type { Metadata } from 'next'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { hasServiceRole } from '@/lib/supabase/admin'
import { PERMISSIONS, can } from '@/lib/permissions'
import { TeamView } from './team-view'
import type { MemberOutput, PayrollRow, Profile } from '@/lib/types'

export const metadata: Metadata = { title: 'Team' }
export const dynamic = 'force-dynamic'

export default async function TeamPage() {
  const viewer = await requirePermission(PERMISSIONS.teamView)

  const supabase = await createClient()
  const [membersRes, payrollRes, profilesRes] = await Promise.all([
    supabase.from('v_member_output').select('*').eq('is_active', true).order('name'),
    supabase.from('payroll').select('*').order('period', { ascending: false }).limit(200),
    supabase.from('profiles').select('*').order('full_name'),
  ])

  return (
    <TeamView
      members={(membersRes.data ?? []) as MemberOutput[]}
      payroll={(payrollRes.data ?? []) as PayrollRow[]}
      profiles={(profilesRes.data ?? []) as Profile[]}
      canManageUsers={can(viewer.permissions, PERMISSIONS.usersManage, viewer.profile.role_key)}
      serviceRoleAvailable={hasServiceRole()}
    />
  )
}
