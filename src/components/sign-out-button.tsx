'use client'

import clsx from 'clsx'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from '@/app/login/actions'
import { useT } from './lang-provider'
import { Icon } from './icons'

export function SignOutButton({
  className,
  variant = 'ghost',
}: {
  className?: string
  variant?: 'ghost' | 'plain'
}) {
  const t = useT()
  const router = useRouter()
  const [pending, start] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const result = await signOut()
            router.replace(result.redirectTo ?? '/login')
            router.refresh()
          } catch {
            router.replace('/login')
          }
        })
      }
      className={clsx(
        variant === 'ghost'
          ? 'ob-btn ob-btn-ghost'
          : 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-ink/65 hover:bg-ink/5',
        className,
      )}
    >
      <Icon name="logout" size={16} />
      {pending ? '…' : t('auth.signOut')}
    </button>
  )
}
