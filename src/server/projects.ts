'use server'

import { revalidatePath } from 'next/cache'
import { assertPermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PERMISSIONS } from '@/lib/permissions'
import type { ActionResult } from '@/lib/types'

export type ProjectInput = {
  id?: string
  clientId?: string | null
  clientName: string
  title: string
  value: number
  totalVideos: number
  deadline?: string | null
  notes?: string | null
  status?: string
  assigneeMemberId?: string | null
}

function touched() {
  for (const p of ['/projects', '/team', '/dashboard']) revalidatePath(p)
}

export async function saveProject(input: ProjectInput): Promise<ActionResult> {
  try {
    await assertPermission(input.id ? PERMISSIONS.projectsEdit : PERMISSIONS.projectsCreate)
    if (!input.clientName.trim()) return { ok: false, error: 'Which client is this for?' }
    if (!input.title.trim()) return { ok: false, error: 'Give the project a title.' }
    if (input.totalVideos < 1) return { ok: false, error: 'A project needs at least one video.' }

    const supabase = await createClient()

    // Store the name alongside the id so the project still reads correctly if
    // the member is later removed from the team.
    let assigneeName: string | null = null
    if (input.assigneeMemberId) {
      const { data: member } = await supabase
        .from('team_members')
        .select('name')
        .eq('id', input.assigneeMemberId)
        .maybeSingle()
      assigneeName = member?.name ?? null
    }

    const row = {
      client_id: input.clientId || null,
      client_name: input.clientName.trim(),
      assignee_member_id: input.assigneeMemberId || null,
      assignee_name: assigneeName,
      title: input.title.trim(),
      value: Math.max(0, input.value),
      total_videos: Math.round(input.totalVideos),
      deadline: input.deadline || null,
      notes: input.notes?.trim() || null,
      ...(input.status ? { status: input.status } : {}),
    }

    const { error } = input.id
      ? await supabase.from('projects').update(row).eq('id', input.id)
      : await supabase.from('projects').insert(row)

    if (error) return { ok: false, error: error.message }
    touched()
    return { ok: true, message: 'Project saved' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function logDelivery(input: {
  projectId: string
  memberId: string
  count: number
  note?: string
}): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.projectsDeliver)
    if (input.count < 1) return { ok: false, error: 'How many videos?' }

    const supabase = await createClient()

    const [{ data: project }, { data: member }] = await Promise.all([
      supabase
        .from('v_project_progress')
        .select('id, total_videos, delivered, title')
        .eq('id', input.projectId)
        .single(),
      supabase.from('team_members').select('id, name').eq('id', input.memberId).single(),
    ])

    if (!project) return { ok: false, error: 'That project no longer exists.' }
    if (!member) return { ok: false, error: 'Pick who delivered the work.' }

    const remaining = Math.max(0, project.total_videos - (project.delivered ?? 0))
    if (remaining === 0) return { ok: false, error: 'This project is already fully delivered.' }

    const count = Math.min(input.count, remaining)

    const { error } = await supabase.from('project_deliveries').insert({
      project_id: input.projectId,
      member_id: input.memberId,
      member_name: member.name,
      count,
      note: input.note?.trim() || null,
    })
    if (error) return { ok: false, error: error.message }

    // Close the project out automatically once everything has landed.
    if ((project.delivered ?? 0) + count >= project.total_videos) {
      await supabase.from('projects').update({ status: 'complete' }).eq('id', input.projectId)
    }

    touched()
    return {
      ok: true,
      message: count < input.count ? `Logged ${count} — that finishes the project` : 'Delivery logged',
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function deleteProject(id: string): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.projectsDelete)
    const supabase = await createClient()
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) return { ok: false, error: error.message }
    touched()
    return { ok: true, message: 'Project removed' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
