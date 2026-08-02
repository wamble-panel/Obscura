import { cache } from 'react'
import { createClient } from './supabase/server'
import { DEFAULT_PRICING } from './format'
import type { PricingSettings, StudioSettings } from './types'

export const DEFAULT_STUDIO: StudioSettings = {
  name: 'Obscura Studio',
  branch: 'Mokattam Branch',
  currency: 'EGP',
  usd_rate: 48,
  open_hour: 9,
  close_hour: 23,
  timezone: 'Africa/Cairo',
}

export type AppSettings = {
  studio: StudioSettings
  pricing: PricingSettings
}

/** Studio configuration, cached for the life of the request. */
export const getSettings = cache(async (): Promise<AppSettings> => {
  try {
    const supabase = await createClient()
    const { data } = await supabase.from('app_settings').select('key, value')

    const map = new Map((data ?? []).map((row) => [row.key as string, row.value]))
    return {
      studio: { ...DEFAULT_STUDIO, ...((map.get('studio') as Partial<StudioSettings>) ?? {}) },
      pricing: { ...DEFAULT_PRICING, ...((map.get('pricing') as Partial<PricingSettings>) ?? {}) },
    }
  } catch {
    // Settings are never worth failing a page over.
    return { studio: DEFAULT_STUDIO, pricing: DEFAULT_PRICING }
  }
})
