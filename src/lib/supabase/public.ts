import { createClient as createSupabaseClient } from '@supabase/supabase-js'

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
}

export async function fetchSharedInvoice(token: string): Promise<SharedInvoice | null> {
  const supabase = createPublicClient()
  const { data, error } = await supabase.rpc('invoice_by_share_token', { p_token: token })
  if (error || !data) return null
  return data as SharedInvoice
}
