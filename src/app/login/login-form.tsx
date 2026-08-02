'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useT, useLang } from '@/components/lang-provider'
import { Field, SubmitButton } from '@/components/ui'
import { Icon } from '@/components/icons'
import { signIn, requestPasswordReset } from './actions'
import type { ActionResult } from '@/lib/types'

type Mode = 'signin' | 'reset'

export function LoginForm({ next }: { next: string }) {
  const t = useT()
  const router = useRouter()
  const { lang, toggleLang } = useLang()
  const [mode, setMode] = useState<Mode>('signin')

  /*
   * Nothing may submit before React has taken over the form. Until then a tap
   * would be a native POST — a full page load — which iOS bounces out of the
   * Home Screen app and into Safari.
   */
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  const [signInState, signInAction, signingIn] = useActionState<ActionResult | null, FormData>(
    signIn,
    null,
  )
  const [resetState, resetAction, resetting] = useActionState<ActionResult | null, FormData>(
    requestPasswordReset,
    null,
  )

  const state = mode === 'signin' ? signInState : resetState
  const pending = signingIn || resetting

  // Navigate in-app once the sign in comes back, rather than following a
  // server redirect.
  useEffect(() => {
    if (signInState?.ok && signInState.redirectTo) {
      router.replace(signInState.redirectTo)
    }
  }, [signInState, router])

  const titles: Record<Mode, { title: string; sub: string }> = {
    signin: { title: t('auth.signInTitle'), sub: t('auth.signInSub') },
    reset: { title: t('auth.resetTitle'), sub: t('auth.resetSub') },
  }

  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-7 flex items-center justify-between">
        <Image
          src="/brand/lockup.png"
          alt="Obscura"
          width={148}
          height={50}
          priority
          className="h-9 w-auto"
        />
        <button
          type="button"
          onClick={toggleLang}
          className="flex h-9 items-center gap-1.5 rounded-full border border-ink/12 bg-paper/70 px-3.5 text-[12.5px] font-bold"
        >
          <Icon name="globe" size={14} />
          {lang === 'en' ? 'العربية' : 'English'}
        </button>
      </div>

      <div className="ob-card p-6 sm:p-7">
        <h1 className="text-[22px] font-extrabold tracking-[-0.5px]">{titles[mode].title}</h1>
        <p className="mt-1 mb-6 text-[13px] font-medium text-ink/55">{titles[mode].sub}</p>

        {state?.error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-clay/10 px-4 py-3 text-[12.5px] font-semibold text-clay">
            <Icon name="alert" size={15} className="mt-px flex-shrink-0" />
            {state.error}
          </div>
        )}
        {state?.ok && state.message && !state.redirectTo && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-moss/10 px-4 py-3 text-[12.5px] font-semibold text-moss">
            <Icon name="check" size={15} className="mt-px flex-shrink-0" />
            {state.message}
          </div>
        )}

        {mode === 'signin' ? (
          <form action={signInAction} className="flex flex-col gap-4">
            <input type="hidden" name="next" value={next} />
            <Field label={t('auth.email')}>
              <input
                className="ob-input"
                name="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                dir="ltr"
              />
            </Field>
            <Field label={t('auth.password')}>
              <input
                className="ob-input"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                dir="ltr"
              />
            </Field>
            <SubmitButton
              pending={pending || Boolean(signInState?.ok)}
              disabled={!ready}
              className="mt-1 h-12 w-full text-[14px]"
            >
              {t('auth.signIn')}
            </SubmitButton>
          </form>
        ) : (
          <form action={resetAction} className="flex flex-col gap-4">
            <Field label={t('auth.email')}>
              <input
                className="ob-input"
                name="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                required
                dir="ltr"
              />
            </Field>
            <SubmitButton pending={pending} disabled={!ready} className="mt-1 h-12 w-full text-[14px]">
              {t('auth.sendReset')}
            </SubmitButton>
          </form>
        )}

        <div className="mt-5 border-t border-ink/8 pt-4 text-[12.5px] font-semibold">
          {mode === 'signin' ? (
            <button
              type="button"
              onClick={() => setMode('reset')}
              className="text-ink/55 hover:text-ink"
            >
              {t('auth.forgot')}
            </button>
          ) : (
            <button type="button" onClick={() => setMode('signin')} className="text-ink">
              ← {t('auth.signIn')}
            </button>
          )}
        </div>
      </div>

      {/* Accounts are issued by an admin — there is no way to make one here. */}
      <p className="mt-5 text-center text-[11.5px] font-medium leading-relaxed text-ink/40">
        {t('auth.adminOnly')}
        <br />
        {t('auth.recorded')}
      </p>
    </div>
  )
}
