import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from './supabase/server'
import { can, type Permission } from './permissions'
import type { Profile, Viewer } from './types'

/**
 * Who is looking at this page, and what are they allowed to do.
 * Cached per request so a page with ten components makes one round trip.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: profile }, { data: permissions }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.rpc('my_permissions'),
  ])

  if (!profile) return null

  return {
    profile: profile as Profile,
    permissions: (permissions as string[] | null) ?? [],
    isAdmin: (profile as Profile).role_key === 'admin',
  }
})

/** Use at the top of any page that needs a signed-in, approved account. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  if (!viewer.profile.is_active) redirect('/pending')
  return viewer
}

/** Use at the top of a page that needs one specific permission. */
export async function requirePermission(permission: Permission | string): Promise<Viewer> {
  const viewer = await requireViewer()
  if (!can(viewer.permissions, permission, viewer.profile.role_key)) {
    redirect('/no-access?needed=' + encodeURIComponent(permission))
  }
  return viewer
}

/** Throws inside a Server Action when the caller lacks a permission. */
export async function assertPermission(permission: Permission | string): Promise<Viewer> {
  const viewer = await getViewer()
  if (!viewer || !viewer.profile.is_active) {
    throw new Error('You need to sign in again.')
  }
  if (!can(viewer.permissions, permission, viewer.profile.role_key)) {
    throw new Error('You do not have permission to do that.')
  }
  return viewer
}

/* ---------------------------------------------------------------------------
 * Audit helpers
 * ------------------------------------------------------------------------- */

export async function getRequestContext() {
  const h = await headers()
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    null
  return {
    ip,
    userAgent: h.get('user-agent'),
  }
}

/**
 * Writes an application-level event to the audit trail — logins, exports,
 * denied access, and anything else a database trigger can't see.
 */
export async function logEvent(params: {
  action: string
  entity?: string
  entityId?: string | null
  summary?: string
  severity?: 'info' | 'warning' | 'critical'
  path?: string | null
  meta?: Record<string, unknown> | null
}) {
  try {
    const supabase = await createClient()
    const { ip, userAgent } = await getRequestContext()
    await supabase.rpc('log_event', {
      p_action: params.action,
      p_entity: params.entity ?? 'app',
      p_entity_id: params.entityId ?? null,
      p_summary: params.summary ?? null,
      p_severity: params.severity ?? 'info',
      p_path: params.path ?? null,
      p_ip: ip,
      p_user_agent: userAgent,
      p_meta: params.meta ?? null,
    })
  } catch {
    // Auditing must never break the action the user was trying to perform.
  }
}
