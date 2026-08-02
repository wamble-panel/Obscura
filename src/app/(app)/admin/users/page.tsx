import type { Metadata } from 'next'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { hasServiceRole } from '@/lib/supabase/admin'
import { PERMISSIONS } from '@/lib/permissions'
import { UsersView } from './users-view'
import type { PermissionRow, PresenceRow, Profile, Role } from '@/lib/types'

export const metadata: Metadata = { title: 'Users & access' }
export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  await requirePermission(PERMISSIONS.usersView)

  const supabase = await createClient()
  const [profilesRes, rolesRes, permsRes, rolePermsRes, userPermsRes, presenceRes] =
    await Promise.all([
      supabase.from('profiles').select('*').order('created_at'),
      supabase.from('roles').select('*').order('rank'),
      supabase.from('permissions').select('*').order('sort'),
      supabase.from('role_permissions').select('*'),
      supabase.from('user_permissions').select('*'),
      supabase.rpc('presence_board'),
    ])

  return (
    <UsersView
      profiles={(profilesRes.data ?? []) as Profile[]}
      roles={(rolesRes.data ?? []) as Role[]}
      permissions={(permsRes.data ?? []) as PermissionRow[]}
      rolePermissions={rolePermsRes.data ?? []}
      userPermissions={userPermsRes.data ?? []}
      presence={(presenceRes.data ?? []) as PresenceRow[]}
      serviceRoleAvailable={hasServiceRole()}
    />
  )
}
