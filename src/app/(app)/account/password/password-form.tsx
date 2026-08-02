'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/components/lang-provider'
import { Field, SubmitButton, useToast } from '@/components/ui'
import { createClient } from '@/lib/supabase/client'

export function PasswordForm() {
  const t = useT()
  const toast = useToast()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    setError(null)
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }

    start(async () => {
      const supabase = createClient()
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) {
        setError(err.message)
        return
      }
      toast(t('toast.saved'))
      setPassword('')
      setConfirm('')
      router.push('/dashboard')
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-xl bg-clay/10 px-4 py-3 text-[12.5px] font-semibold text-clay">
          {error}
        </div>
      )}
      <Field label={t('auth.newPassword')} hint="At least 8 characters">
        <input
          className="ob-input"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          dir="ltr"
        />
      </Field>
      <Field label={t('common.confirm')}>
        <input
          className="ob-input"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          dir="ltr"
        />
      </Field>
      <SubmitButton type="button" onClick={submit} pending={pending} className="h-12 w-full">
        {t('auth.updatePassword')}
      </SubmitButton>
    </div>
  )
}
