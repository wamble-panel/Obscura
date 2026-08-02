import { requireViewer } from '@/lib/auth'
import { getSettings } from '@/lib/settings'
import { AppProvider } from '@/components/app-context'
import { AppShell } from '@/components/shell/shell'
import { PresenceHeartbeat } from '@/components/presence-heartbeat'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer()
  const settings = await getSettings()

  return (
    <AppProvider viewer={viewer} settings={settings}>
      <PresenceHeartbeat />
      <AppShell>{children}</AppShell>
    </AppProvider>
  )
}
