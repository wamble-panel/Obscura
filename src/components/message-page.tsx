import Image from 'next/image'
import type { ReactNode } from 'react'
import { Icon, type IconName } from './icons'

/** Full-screen message used for pending approval, no access and offline. */
export function MessagePage({
  icon = 'shield',
  title,
  body,
  children,
  tone = 'neutral',
}: {
  icon?: IconName
  title: string
  body?: string
  children?: ReactNode
  tone?: 'neutral' | 'warn'
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-[420px] text-center">
        <Image
          src="/brand/lockup.png"
          alt="Obscura"
          width={132}
          height={45}
          className="mx-auto mb-8 h-8 w-auto"
        />
        <div className="ob-card px-6 py-9">
          <div
            className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${
              tone === 'warn' ? 'bg-clay/12 text-clay' : 'bg-ink/8 text-ink/60'
            }`}
          >
            <Icon name={icon} size={24} />
          </div>
          <h1 className="text-[20px] font-extrabold tracking-[-0.4px]">{title}</h1>
          {body && (
            <p className="mx-auto mt-2 max-w-[300px] text-[13px] font-medium leading-relaxed text-ink/55">
              {body}
            </p>
          )}
          {children && <div className="mt-6">{children}</div>}
        </div>
      </div>
    </main>
  )
}
