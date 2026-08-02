import type { Metadata } from 'next'
import { requireViewer } from '@/lib/auth'
import { getT } from '@/lib/lang-server'
import { Card, PageHeader } from '@/components/ui'
import { PasswordForm } from './password-form'

export const metadata: Metadata = { title: 'Password' }

export default async function PasswordPage() {
  const viewer = await requireViewer()
  const { t } = await getT()

  return (
    <div className="mx-auto max-w-[440px]">
      <PageHeader title={t('auth.updatePassword')} subtitle={viewer.profile.email} />
      <Card>
        <PasswordForm />
      </Card>
    </div>
  )
}
