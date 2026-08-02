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

  if (!profile?.is_active) redirect('/pending')
  redirect(next.startsWith('/') ? next : '/dashboard')
}

export async function signUp(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const fullName = String(formData.get('fullName') ?? '').trim()

  if (!email || !password) return { ok: false, error: 'Enter your email and password.' }
  if (password.length < 8) {
    return { ok: false, error: 'Use at least 8 characters for your password.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName || email.split('@')[0] } },
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/', 'layout')
  return {
    ok: true,
    message:
      'Account created. If this was the first account you are now the admin — sign in below. Otherwise an admin needs to approve you.',
  }
}

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

export async function signOut(): Promise<void> {
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
  redirect('/login')
}
