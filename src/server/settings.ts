'use server'

import { revalidatePath } from 'next/cache'
import { assertPermission, logEvent } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PERMISSIONS } from '@/lib/permissions'
import { fetchLiveRates } from '@/lib/fx-fetch'
import {
  CURRENCY_CODES,
  normalizeFx,
  rateFor,
  type CurrencyCode,
  type FxRates,
} from '@/lib/currency'
import type { ActionResult, PricingSettings, StudioSettings, TermsSettings } from '@/lib/types'

export async function saveSettings(input: {
  studio: StudioSettings
  pricing: PricingSettings
  terms?: TermsSettings
}): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.settingsEdit)

    if (input.studio.open_hour >= input.studio.close_hour) {
      return { ok: false, error: 'Closing time has to be after opening time.' }
    }

    const supabase = await createClient()
    const now = new Date().toISOString()

    const rows: { key: string; value: unknown; updated_at: string }[] = [
      { key: 'studio', value: input.studio, updated_at: now },
      { key: 'pricing', value: input.pricing, updated_at: now },
    ]

    if (input.terms) {
      // Drop empty sections and blank bullets so the public page never shows a
      // stray empty card after an edit.
      const terms: TermsSettings = {
        ...input.terms,
        badges: input.terms.badges.map((b) => b.trim()).filter(Boolean),
        sections: input.terms.sections
          .map((s) => ({
            title: s.title.trim(),
            items: s.items.map((i) => i.trim()).filter(Boolean),
          }))
          .filter((s) => s.title && s.items.length),
      }
      rows.push({ key: 'terms', value: terms, updated_at: now })
    }

    const { error } = await supabase.from('app_settings').upsert(rows)

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

/** Reads whatever is stored today, without the defaults getting in the way. */
async function currentFx(): Promise<FxRates> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'fx')
    .maybeSingle()
  return normalizeFx(data?.value)
}

async function writeFx(fx: FxRates): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'fx', value: fx, updated_at: new Date().toISOString() })
  if (error) return { ok: false, error: error.message }

  // Every page shows money, so they all need re-rendering.
  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Pulls today's rates on demand.
 *
 * The cron job does this daily; this is the button for when the pound has just
 * moved and an invoice is about to go out. If every source is unreachable the
 * stored rates are left exactly as they were — stale numbers beat none.
 */
export async function refreshRates(): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.settingsEdit)

    const previous = await currentFx()
    const result = await fetchLiveRates(previous)
    if (!result.ok) {
      return { ok: false, error: `Could not reach a rate source. ${result.error}.` }
    }

    const written = await writeFx(result.fx)
    if (!written.ok) return written

    await logEvent({
      action: 'settings.rates',
      entity: 'app_settings',
      summary: `Refreshed rates from ${result.fx.source}`,
    })

    const shown = CURRENCY_CODES.filter((c) => c !== 'EGP')
      .map((c) => `1 ${c} = E£${rateFor(c, result.fx).toFixed(2)}`)
      .join(' · ')

    return { ok: true, message: shown }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Sets a rate by hand, for when the studio has agreed a fixed one. */
export async function setRate(code: CurrencyCode, rate: number): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.settingsEdit)
    if (code === 'EGP') return { ok: false, error: 'The pound is the studio\'s own currency.' }
    if (!Number.isFinite(rate) || rate <= 0) {
      return { ok: false, error: 'A rate has to be a positive number.' }
    }

    const previous = await currentFx()
    const written = await writeFx({
      rates: { ...previous.rates, [code]: rate },
      fetched_at: new Date().toISOString(),
      source: 'manual',
    })
    if (!written.ok) return written

    await logEvent({
      action: 'settings.rates',
      entity: 'app_settings',
      summary: `Set 1 ${code} to E£${rate} by hand`,
    })

    return { ok: true, message: `1 ${code} = E£${rate}` }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
