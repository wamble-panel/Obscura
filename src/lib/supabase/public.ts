import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { BankSettings } from '@/lib/types'

/**
 * A cookie-free anon client for pages a client opens without signing in —
 * currently just the shared invoice link.
 *
 * It deliberately carries no session, so the only thing it can reach is what
 * has been explicitly granted to `anon`: the invoice_by_share_token function.
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

export type SharedInvoice = {
  expired?: boolean
  invoice?: {
    number: string
    client_name: string
    client_company: string | null
    client_address: string | null
    issue_date: string
    due_date: string | null
    subtotal: number
    discount: number
    tax_rate: number
    tax_amount: number
    total: number
    status: string
    currency: string
    currency_amount: number | null
    show_bank: boolean | null
    notes: string | null
    terms: string | null
  }
  items?: {
    description: string
    section: string | null
    detail: string | null
    qty: number
    unit_price: number
    amount: number
  }[]
  payments?: { amount: number; method: string; paid_at: string }[]
  paid_amount?: number
  studio?: { name: string; branch: string; usd_rate: number }
  bank?: Partial<BankSettings>
}

export async function fetchSharedInvoice(token: string): Promise<SharedInvoice | null> {
  const supabase = createPublicClient()
  const { data, error } = await supabase.rpc('invoice_by_share_token', { p_token: token })
  if (error || !data) return null

  const shared = data as SharedInvoice
  if (!shared.bank) shared.bank = (await fetchPublicBank()) ?? undefined
  return shared
}

/**
 * The studio's payment details, for a client who has no account.
 *
 * Normally these come back inside invoice_by_share_token. On a database where
 * that function predates them, they are read here instead — app_settings is
 * readable only by signed-in staff, so this needs the service role. It is a
 * deliberately narrow read of one row that is printed on the invoice anyway,
 * and it returns nothing at all if the studio has switched the block off.
 */
async function fetchPublicBank(): Promise<Partial<BankSettings> | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null

  try {
    const admin = createSupabaseClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'bank')
      .maybeSingle()

    const bank = data?.value as Partial<BankSettings> | undefined
    if (!bank || bank.show_on_invoice === false) return null
    return bank
  } catch {
    return null
  }
}
