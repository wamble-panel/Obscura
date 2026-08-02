'use server'

import { revalidatePath } from 'next/cache'
import { assertPermission, logEvent } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin'
import { PERMISSIONS } from '@/lib/permissions'
import type { ActionResult } from '@/lib/types'

function touched() {
  revalidatePath('/admin/users')
  revalidatePath('/admin/audit')
}

/** Never let the studio end up with nobody who can administer it. */
async function wouldOrphanAdmins(userId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('role_key', 'admin')
    .eq('is_active', true)
  const admins = data ?? []
  return admins.length <= 1 && admins.some((a) => a.id === userId)
}

export async function inviteUser(input: {
  email: string
  fullName: string
  roleKey: string
  password: string
  title?: string
}): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.usersManage)

    if (!hasServiceRole()) {
      return {
        ok: false,
        error:
          'Add SUPABASE_SERVICE_ROLE_KEY to your environment variables to create accounts from here. Until then, people can sign up on the login page and you approve them.',
      }
    }

    const email = input.email.trim().toLowerCase()
    if (!email) return { ok: false, error: 'Enter an email address.' }
    if (input.password.length < 8) {
      return { ok: false, error: 'Use at least 8 characters for the password.' }
    }

    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName.trim() || email.split('@')[0],
        role_key: input.roleKey,
        is_active: true,
      },
    })

    if (error) return { ok: false, error: error.message }

    // The signup trigger creates the profile; make sure the role sticks even if
    // the metadata path was ignored.
    await admin
      .from('profiles')
      .update({
        role_key: input.roleKey,
        is_active: true,
        full_name: input.fullName.trim() || email.split('@')[0],
        title: input.title?.trim() || null,
      })
      .eq('id', data.user.id)

    await logEvent({
      action: 'users.invite',
      entity: 'profiles',
      entityId: data.user.id,
      summary: `Created an account for ${email} as ${input.roleKey}`,
      severity: 'critical',
    })

    touched()
    return { ok: true, message: 'Account created' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function setUserRole(userId: string, roleKey: string): Promise<ActionResult> {
  try {
    const viewer = await assertPermission(PERMISSIONS.usersManage)
    if (viewer.profile.id === userId) {
      return { ok: false, error: 'You cannot change your own role.' }
    }
    if (roleKey !== 'admin' && (await wouldOrphanAdmins(userId))) {
      return { ok: false, error: 'This is the only active admin — promote someone else first.' }
    }

    const supabase = await createClient()
    const { error } = await supabase.from('profiles').update({ role_key: roleKey }).eq('id', userId)
    if (error) return { ok: false, error: error.message }

    await logEvent({
      action: 'users.role',
      entity: 'profiles',
      entityId: userId,
      summary: `Changed role to ${roleKey}`,
      severity: 'critical',
    })

    touched()
    return { ok: true, message: 'Role updated' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function setUserActive(userId: string, isActive: boolean): Promise<ActionResult> {
  try {
    const viewer = await assertPermission(PERMISSIONS.usersManage)
    if (viewer.profile.id === userId) {
      return { ok: false, error: 'You cannot deactivate your own account.' }
    }
    if (!isActive && (await wouldOrphanAdmins(userId))) {
      return { ok: false, error: 'This is the only active admin.' }
    }

    const supabase = await createClient()
    const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', userId)
    if (error) return { ok: false, error: error.message }

    if (!isActive) {
      await supabase.from('user_presence').delete().eq('user_id', userId)
    }

    await logEvent({
      action: isActive ? 'users.activate' : 'users.deactivate',
      entity: 'profiles',
      entityId: userId,
      summary: isActive ? 'Activated the account' : 'Deactivated the account',
      severity: 'critical',
    })

    touched()
    return { ok: true, message: isActive ? 'Account activated' : 'Account deactivated' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Grants or revokes one permission for one person, on top of whatever their
 * role gives them. Passing `null` clears the override.
 */
export async function setUserPermission(
  userId: string,
  permissionKey: string,
  granted: boolean | null,
): Promise<ActionResult> {
  try {
    const viewer = await assertPermission(PERMISSIONS.usersManage)
    if (viewer.profile.id === userId) {
      return { ok: false, error: 'You cannot change your own access.' }
    }

    const supabase = await createClient()

    if (granted === null) {
      const { error } = await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', userId)
        .eq('permission_key', permissionKey)
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await supabase
        .from('user_permissions')
        .upsert({ user_id: userId, permission_key: permissionKey, granted })
      if (error) return { ok: false, error: error.message }
    }

    touched()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function clearUserOverrides(userId: string): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.usersManage)
    const supabase = await createClient()
    const { error } = await supabase.from('user_permissions').delete().eq('user_id', userId)
    if (error) return { ok: false, error: error.message }
    touched()
    return { ok: true, message: 'Back to the role defaults' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Changes what a whole role can do. Affects everyone holding it. */
export async function setRolePermission(
  roleKey: string,
  permissionKey: string,
  enabled: boolean,
): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.usersManage)
    if (roleKey === 'admin') {
      return { ok: false, error: 'Admins always hold every permission.' }
    }

    const supabase = await createClient()
    const { error } = enabled
      ? await supabase
          .from('role_permissions')
          .upsert({ role_key: roleKey, permission_key: permissionKey })
      : await supabase
          .from('role_permissions')
          .delete()
          .eq('role_key', roleKey)
          .eq('permission_key', permissionKey)

    if (error) return { ok: false, error: error.message }

    await logEvent({
      action: 'roles.update',
      entity: 'role_permissions',
      entityId: roleKey,
      summary: `${enabled ? 'Granted' : 'Revoked'} ${permissionKey} for the ${roleKey} role`,
      severity: 'critical',
    })

    touched()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function deleteUser(userId: string): Promise<ActionResult> {
  try {
    const viewer = await assertPermission(PERMISSIONS.usersManage)
    if (viewer.profile.id === userId) {
      return { ok: false, error: 'You cannot delete your own account.' }
    }
    if (await wouldOrphanAdmins(userId)) {
      return { ok: false, error: 'This is the only active admin.' }
    }
    if (!hasServiceRole()) {
      return {
        ok: false,
        error: 'Deleting accounts needs SUPABASE_SERVICE_ROLE_KEY. Deactivate them instead.',
      }
    }

    const { data: target } = await createAdminClient()
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single()

    const { error } = await createAdminClient().auth.admin.deleteUser(userId)
    if (error) return { ok: false, error: error.message }

    await logEvent({
      action: 'users.delete',
      entity: 'profiles',
      entityId: userId,
      summary: `Deleted the account ${target?.email ?? userId}`,
      severity: 'critical',
    })

    touched()
    return { ok: true, message: 'Account deleted' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
