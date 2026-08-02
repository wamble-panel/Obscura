import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/auth'
import { landingPath } from '@/lib/permissions'

export default async function Home() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')
  if (!viewer.profile.is_active) redirect('/pending')
  redirect(landingPath(viewer.permissions, viewer.profile.role_key))
}
