import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { AppProvider } from '@/components/app-context'
import { AppShell } from '@/components/shell/shell'
import { PresenceHeartbeat } from '@/components/presence-heartbeat'
import { InstallPrompt } from '@/components/ios/install-prompt'
import { PullToRefresh } from '@/components/ios/pull-to-refresh'
import { StandaloneGuard } from '@/components/ios/standalone-guard'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Fetched together rather than one after the other — the shell is on the
  // critical path for every single page, so a serial round trip here is a
  // delay the whole app pays.
  const [viewer, settings] = await Promise.all([getViewer(), getSettings()])

  if (!viewer) redirect('/login')
  if (!viewer.profile.is_active) redirect('/pending')

  return (
    <AppProvider viewer={viewer} settings={settings}>
      <PresenceHeartbeat />
      <StandaloneGuard />
      <PullToRefresh />
      <AppShell>{children}</AppShell>
      <InstallPrompt />
    </AppProvider>
  )
}
