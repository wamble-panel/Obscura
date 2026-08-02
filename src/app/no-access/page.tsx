import type { Metadata } from 'next'
import Link from 'next/link'
import { getViewer, logEvent } from '@/lib/auth'
import { getT } from '@/lib/lang-server'
import { landingPath } from '@/lib/permissions'
import { MessagePage } from '@/components/message-page'
import { SignOutButton } from '@/components/sign-out-button'

export const metadata: Metadata = { title: 'No access' }

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ needed?: string }>
}) {
  const { needed } = await searchParams
  const viewer = await getViewer()
  const { t } = await getT()

  if (viewer && needed) {
    await logEvent({
      action: 'access.denied',
      entity: 'app',
      summary: `Tried to open a page needing "${needed}"`,
      severity: 'warning',
      meta: { permission: needed },
    })
  }

  const home = viewer ? landingPath(viewer.permissions, viewer.profile.role_key) : '/login'

  return (
    <MessagePage icon="shield" tone="warn" title={t('auth.noAccessTitle')} body={t('auth.noAccessBody')}>
      {needed && (
        <div className="mb-5 rounded-xl bg-ink/5 px-4 py-3 font-mono text-[12px] font-semibold text-ink/60">
          {needed}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {home !== '/no-access' && (
          <Link href={home} className="ob-btn ob-btn-primary w-full">
            {t('common.back')}
          </Link>
        )}
        <SignOutButton className="w-full" />
      </div>
    </MessagePage>
  )
}
