import type { Metadata } from 'next'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PERMISSIONS } from '@/lib/permissions'
import { ProjectsView } from './projects-view'
import type { Client, ProjectDelivery, ProjectProgress, TeamMember } from '@/lib/types'

export const metadata: Metadata = { title: 'Projects' }
export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  const viewer = await requirePermission(PERMISSIONS.projectsView)

  const supabase = await createClient()
  const [projectsRes, deliveriesRes, membersRes, clientsRes, meRes] = await Promise.all([
    supabase.from('v_project_progress').select('*').order('created_at', { ascending: false }),
    supabase.from('project_deliveries').select('*').order('created_at', { ascending: false }),
    supabase.from('team_members').select('*').eq('is_active', true).order('name'),
    supabase.from('clients').select('*').eq('is_archived', false).order('name'),
    // Which team member is the person looking at this page?
    supabase.from('team_members').select('id').eq('profile_id', viewer.profile.id).maybeSingle(),
  ])

  return (
    <ProjectsView
      projects={(projectsRes.data ?? []) as ProjectProgress[]}
      deliveries={(deliveriesRes.data ?? []) as ProjectDelivery[]}
      members={(membersRes.data ?? []) as TeamMember[]}
      clients={(clientsRes.data ?? []) as Client[]}
      myMemberId={(meRes.data as { id: string } | null)?.id ?? null}
    />
  )
}
