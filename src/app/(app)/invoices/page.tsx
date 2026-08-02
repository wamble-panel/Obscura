import type { Metadata } from 'next'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PERMISSIONS } from '@/lib/permissions'
import { InvoicesView } from './invoices-view'
import type { Client, InvoiceBalance, Payment } from '@/lib/types'

export const metadata: Metadata = { title: 'Invoices' }
export const dynamic = 'force-dynamic'

export default async function InvoicesPage() {
  await requirePermission(PERMISSIONS.invoicesView)

  const supabase = await createClient()
  const [invoicesRes, clientsRes, paymentsRes] = await Promise.all([
    supabase.from('v_invoice_balance').select('*').order('issue_date', { ascending: false }).limit(300),
    supabase.from('clients').select('*').eq('is_archived', false).order('name'),
    supabase.from('payments').select('*').order('paid_at', { ascending: false }).limit(500),
  ])

  return (
    <InvoicesView
      invoices={(invoicesRes.data ?? []) as InvoiceBalance[]}
      clients={(clientsRes.data ?? []) as Client[]}
      payments={(paymentsRes.data ?? []) as Payment[]}
    />
  )
}
