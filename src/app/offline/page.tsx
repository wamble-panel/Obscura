import type { Metadata } from 'next'
import { MessagePage } from '@/components/message-page'

export const metadata: Metadata = { title: 'Offline' }

export default function OfflinePage() {
  return (
    <MessagePage
      icon="alert"
      tone="warn"
      title="You are offline"
      body="Obscura needs a connection to show live bookings. Reconnect and this page will load again."
    />
  )
}
