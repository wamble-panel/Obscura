'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/types'

function requestMeta(h: Headers) {
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null,
    userAgent: h.get('user-agent'),
  }
}

export async function signIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '/dashboard')

  if (!email || !password) {
    return { ok: false, error: 'Enter your email and password.' }
  }

  const supabase = await createClient()
  const { ip, userAgent } = requestMeta(await headers())

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.user) {
    // Failed attempts are worth recording, but we cannot use the user's own
    // session for it — there isn't one. The trigger-free path is fine here:
    // the audit row is written by the database function as an anonymous event.
    await supabase.rpc('log_event', {
      p_action: 'auth.failed',
      p_entity: 'auth',
      p_entity_id: null,
      p_summary: `Failed sign in for ${email}`,
      p_severity: 'warning',
      p_path: '/login',
      p_ip: ip,
      p_user_agent: userAgent,
      p_meta: { email },
    })
    return { ok: false, error: 'Wrong email or password.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, is_active, full_name')
    .eq('id', data.user.id)
    .single()

  await supabase
    .from('profiles')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', data.user.id)

  await supabase.rpc('log_event', {
    p_action: 'auth.login',
    p_entity: 'auth',
    p_entity_id: data.user.id,
    p_summary: `${profile?.full_name ?? email} signed in`,
    p_severity: 'info',
    p_path: '/login',
    p_ip: ip,
    p_user_agent: userAgent,
    p_meta: null,
  })

  revalidatePath('/', 'layout')

  /*
   * Deliberately NOT redirect() here.
   *
   * A server redirect after a form post is a full-page navigation, and iOS
   * treats that as leaving a Home Screen web app — it reopens the destination
   * in Safari, address bar and all. Handing the destination back and letting
   * the client router move keeps everything inside the installed app.
   */
  return {
    ok: true,
    redirectTo: profile?.is_active ? (next.startsWith('/') ? next : '/dashboard') : '/pending',
  }
}

/*
 * There is deliberately no sign-up action.
 *
 * Accounts are created by an admin — from Users & access, or from a team
 * member's card — and the very first one is created in the Supabase dashboard.
 * Turning public sign-up off in Supabase (Authentication -> Sign In / Providers
 * -> Email -> "Allow new users to sign up") closes the API path as well, which
 * is what actually enforces this; removing the form only hides it.
 */

export async function requestPasswordReset(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email) return { ok: false, error: 'Enter your email address.' }

  const supabase = await createClient()
  const h = await headers()
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (h.get('x-forwarded-proto') ?? 'https') + '://' + (h.get('host') ?? 'localhost:3000')

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/account/password`,
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true, message: 'Check your email for the reset link.' }
}

export async function signOut(): Promise<ActionResult> {
  const supabase = await createClient()
  const { ip, userAgent } = requestMeta(await headers())

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    await supabase.rpc('log_event', {
      p_action: 'auth.logout',
      p_entity: 'auth',
      p_entity_id: user.id,
      p_summary: `${user.email} signed out`,
      p_severity: 'info',
      p_path: null,
      p_ip: ip,
      p_user_agent: userAgent,
      p_meta: null,
    })
    // Drop them off the "online now" board immediately.
    await supabase.from('user_presence').delete().eq('user_id', user.id)
  }

  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  // Same reason as sign in: a server redirect is a full page load, which drops
  // an iOS Home Screen app back into Safari.
  return { ok: true, redirectTo: '/login' }
}
