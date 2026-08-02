import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import { getT } from '@/lib/lang-server'
import { MessagePage } from '@/components/message-page'
import { SignOutButton } from '@/components/sign-out-button'

export const metadata: Metadata = { title: 'Waiting for approval' }

export default async function PendingPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  if (viewer.profile.is_active) redirect('/dashboard')

  const { t } = await getT()

  return (
    <MessagePage icon="clock" title={t('auth.pendingTitle')} body={t('auth.pendingBody')}>
      <div className="mb-5 rounded-xl bg-ink/5 px-4 py-3 text-[12.5px] font-semibold text-ink/60">
        {t('auth.signedInAs')} <span className="ob-ltr">{viewer.profile.email}</span>
      </div>
      <SignOutButton className="w-full" />
    </MessagePage>
  )
}
