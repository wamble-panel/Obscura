import { cache } from 'react'
import { createClient } from './supabase/server'
import { DEFAULT_PRICING } from './format'
import { DEFAULT_FX, normalizeFx, rateFor, type FxRates } from './currency'
import type { BankSettings, PricingSettings, StudioSettings, TermsSettings } from './types'

export const DEFAULT_STUDIO: StudioSettings = {
  name: 'Obscura Studio',
  legal_name: '',
  branch: 'Mokattam Branch',
  currency: 'EGP',
  usd_rate: 48,
  open_hour: 0,
  close_hour: 24,
  timezone: 'Africa/Cairo',
  phone: '01033447399',
  instagram: '@obscura_house_',
  auto_invoice: true,
}

export const DEFAULT_BANK: BankSettings = {
  bank_name: '',
  account_name: '',
  account_number: '',
  iban: '',
  swift: '',
  extra: '',
  show_on_invoice: true,
}

/** Mirrors the seed in schema.sql so the app is never blank if a row is missing. */
export const DEFAULT_TERMS: TermsSettings = {
  heading: 'Terms & Conditions',
  agree_line: 'By booking a session at OBSCURA you agree to these terms.',
  invoice_line: 'Booking is subject to the Obscura Terms & Conditions.',
  badges: ['No smoking', 'No pets', 'No alcohol'],
  sections: [
    {
      title: 'Booking & Time',
      items: [
        'Your booking starts and ends **exactly as scheduled** — hair, makeup, styling and prep all count within your time.',
        '**Setup and teardown** must fit inside your booking duration.',
        'The studio must be **vacated by the agreed end time**.',
        'Extra time is subject to **availability** and charged separately.',
      ],
    },
    {
      title: 'Studio Care',
      items: [
        'Nothing may be hung, taped or stuck on the **cyclorama walls** without approval from studio management.',
        'Damage to the cyclorama or studio property (marks, dents, tears) is **charged at repair cost**.',
        'A minimum **EGP 100 cleaning fee** applies if the studio is left excessively dirty.',
      ],
    },
    {
      title: 'Payment & Cancellation',
      items: [
        'A **reservation fee** is required to confirm every booking.',
        'The reservation fee is **non-refundable** for cancellations made **48 hours or less** before the session.',
        'Rescheduling is subject to studio availability.',
      ],
    },
    {
      title: 'House Rules',
      items: [
        '**No smoking, no pets, no alcohol or drugs** anywhere on the premises.',
        'Music must stay at **reasonable levels**.',
        'The person who books is **responsible for their team and guests**.',
      ],
    },
  ],
}

export type AppSettings = {
  studio: StudioSettings
  pricing: PricingSettings
  terms: TermsSettings
  bank: BankSettings
  fx: FxRates
}

/** Studio configuration, cached for the life of the request. */
export const getSettings = cache(async (): Promise<AppSettings> => {
  try {
    const supabase = await createClient()
    const { data } = await supabase.from('app_settings').select('key, value')

    const map = new Map((data ?? []).map((row) => [row.key as string, row.value]))
    const fx = normalizeFx(map.get('fx'))
    const studio = { ...DEFAULT_STUDIO, ...((map.get('studio') as Partial<StudioSettings>) ?? {}) }

    // Everywhere that already shows a dollar figure reads `studio.usd_rate`.
    // Pointing it at the live table makes all of them current at once, and
    // leaves one place — the rates panel — where the number is set.
    studio.usd_rate = rateFor('USD', fx)

    return {
      studio,
      pricing: { ...DEFAULT_PRICING, ...((map.get('pricing') as Partial<PricingSettings>) ?? {}) },
      terms: { ...DEFAULT_TERMS, ...((map.get('terms') as Partial<TermsSettings>) ?? {}) },
      bank: { ...DEFAULT_BANK, ...((map.get('bank') as Partial<BankSettings>) ?? {}) },
      fx,
    }
  } catch {
    // Settings are never worth failing a page over.
    return {
      studio: DEFAULT_STUDIO,
      pricing: DEFAULT_PRICING,
      terms: DEFAULT_TERMS,
      bank: DEFAULT_BANK,
      fx: DEFAULT_FX,
    }
  }
})
