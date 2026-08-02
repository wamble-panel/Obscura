'use server'

import { revalidatePath } from 'next/cache'
import { assertPermission, logEvent } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PERMISSIONS } from '@/lib/permissions'
import type { ActionResult, PricingSettings, StudioSettings } from '@/lib/types'

export async function saveSettings(input: {
  studio: StudioSettings
  pricing: PricingSettings
}): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.settingsEdit)

    if (input.studio.open_hour >= input.studio.close_hour) {
      return { ok: false, error: 'Closing time has to be after opening time.' }
    }
    if (input.studio.usd_rate <= 0) return { ok: false, error: 'The USD rate must be positive.' }

    const supabase = await createClient()
    const now = new Date().toISOString()

    const { error } = await supabase.from('app_settings').upsert([
      { key: 'studio', value: input.studio, updated_at: now },
      { key: 'pricing', value: input.pricing, updated_at: now },
    ])

    if (error) return { ok: false, error: error.message }

    revalidatePath('/', 'layout')
    return { ok: true, message: 'Settings saved' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Manual keep-alive from the settings page, so anyone can verify it works. */
export async function pingDatabase(): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.settingsView)
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('ping_keepalive', { p_source: 'manual' })
    if (error) return { ok: false, error: error.message }

    await logEvent({
      action: 'system.keepalive',
      entity: 'keepalive',
      summary: 'Pinged the database by hand',
    })

    revalidatePath('/settings')
    return { ok: true, message: `Database answered at ${new Date(data as string).toLocaleTimeString()}` }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
