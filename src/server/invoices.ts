'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { assertPermission, logEvent } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PERMISSIONS } from '@/lib/permissions'
import { addDays, todayKey } from '@/lib/format'
import { toCurrencyCode, type CurrencyCode } from '@/lib/currency'
import type { ActionResult, InvoiceStatus } from '@/lib/types'

export type InvoiceItemInput = {
  description: string
  /** Heading the line prints under. Null leaves it ungrouped. */
  section?: string | null
  /** Small print under the description. */
  detail?: string | null
  qty: number
  unitPrice: number
  refType?: string | null
  refId?: string | null
}

export type InvoiceInput = {
  id?: string
  clientId?: string | null
  clientName: string
  clientCompany?: string | null
  clientPhone?: string | null
  clientEmail?: string | null
  clientAddress?: string | null
  issueDate: string
  dueDate?: string | null
  /**
   * The second currency the client sees. Amounts stay in EGP; this only
   * changes what is shown next to them. The database stamps the day's rate.
   */
  currency?: CurrencyCode
  discount: number
  taxRate: number
  notes?: string | null
  terms?: string | null
  items: InvoiceItemInput[]
}

function touched(id?: string) {
  revalidatePath('/invoices')
  revalidatePath('/finance')
  revalidatePath('/dashboard')
  if (id) revalidatePath(`/invoices/${id}`)
}

export async function saveInvoice(input: InvoiceInput): Promise<ActionResult & { id?: string }> {
  try {
    await assertPermission(input.id ? PERMISSIONS.invoicesEdit : PERMISSIONS.invoicesCreate)

    if (!input.clientName.trim()) return { ok: false, error: 'Who is this invoice for?' }
    const items = input.items.filter((i) => i.description.trim() && i.qty > 0)
    if (!items.length) return { ok: false, error: 'Add at least one line to the invoice.' }

    const supabase = await createClient()

    const header = {
      client_id: input.clientId || null,
      client_name: input.clientName.trim(),
      client_company: input.clientCompany?.trim() || null,
      client_phone: input.clientPhone?.trim() || null,
      client_email: input.clientEmail?.trim() || null,
      client_address: input.clientAddress?.trim() || null,
      issue_date: input.issueDate || todayKey(),
      due_date: input.dueDate || addDays(input.issueDate || todayKey(), 14),
      currency: toCurrencyCode(input.currency),
      discount: Math.max(0, input.discount || 0),
      tax_rate: Math.max(0, input.taxRate || 0),
      notes: input.notes?.trim() || null,
      terms: input.terms?.trim() || null,
    }

    let invoiceId = input.id

    if (input.id) {
      const { error } = await supabase.from('invoices').update(header).eq('id', input.id)
      if (error) return { ok: false, error: error.message }
      await supabase.from('invoice_items').delete().eq('invoice_id', input.id)
    } else {
      const { data, error } = await supabase.from('invoices').insert(header).select('id').single()
      if (error) return { ok: false, error: error.message }
      invoiceId = data.id
    }

    const { error: itemsError } = await supabase.from('invoice_items').insert(
      items.map((item, index) => ({
        invoice_id: invoiceId,
        description: item.description.trim(),
        section: item.section?.trim() || null,
        detail: item.detail?.trim() || null,
        qty: item.qty,
        unit_price: item.unitPrice,
        ref_type: item.refType || null,
        ref_id: item.refId || null,
        sort: index,
      })),
    )
    if (itemsError) return { ok: false, error: itemsError.message }

    touched(invoiceId)
    return { ok: true, message: 'Invoice saved', id: invoiceId }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function setInvoiceStatus(id: string, status: InvoiceStatus): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.invoicesEdit)
    const supabase = await createClient()
    const { error } = await supabase.from('invoices').update({ status }).eq('id', id)
    if (error) return { ok: false, error: error.message }
    touched(id)
    return { ok: true, message: 'Invoice updated' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function deleteInvoice(id: string): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.invoicesDelete)
    const supabase = await createClient()

    const { data: paid } = await supabase
      .from('payments')
      .select('id')
      .eq('invoice_id', id)
      .limit(1)

    if (paid?.length) {
      // Money has changed hands — void it so the record survives.
      const { error } = await supabase.from('invoices').update({ status: 'void' }).eq('id', id)
      if (error) return { ok: false, error: error.message }
      touched(id)
      return { ok: true, message: 'Voided (it already has payments against it)' }
    }

    const { error } = await supabase.from('invoices').delete().eq('id', id)
    if (error) return { ok: false, error: error.message }
    touched()
    return { ok: true, message: 'Invoice deleted' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function recordPayment(input: {
  invoiceId: string
  amount: number
  method: string
  paidAt: string
  reference?: string
  postToLedger?: boolean
}): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.invoicesPay)
    if (!input.amount || input.amount <= 0) return { ok: false, error: 'Enter an amount.' }

    const supabase = await createClient()
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, client_id, client_name')
      .eq('id', input.invoiceId)
      .single()
    if (!invoice) return { ok: false, error: 'That invoice no longer exists.' }

    const { error } = await supabase.from('payments').insert({
      invoice_id: input.invoiceId,
      client_id: invoice.client_id,
      client_name: invoice.client_name,
      amount: input.amount,
      method: input.method || 'cash',
      paid_at: input.paidAt || todayKey(),
      reference: input.reference?.trim() || null,
      post_to_ledger: Boolean(input.postToLedger),
    })
    if (error) return { ok: false, error: error.message }

    touched(input.invoiceId)
    return { ok: true, message: 'Payment recorded' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function deletePayment(id: string, invoiceId: string): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.invoicesDelete)
    const supabase = await createClient()
    const { error } = await supabase.from('payments').delete().eq('id', id)
    if (error) return { ok: false, error: error.message }
    touched(invoiceId)
    return { ok: true, message: 'Payment removed' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Turns on (or rotates) the client-facing link for an invoice and returns the
 * full URL to hand over. Regenerating kills the previous link immediately.
 */
export async function shareInvoice(
  invoiceId: string,
  options?: { regenerate?: boolean; expiresAt?: string | null },
): Promise<ActionResult & { url?: string }> {
  try {
    await assertPermission(PERMISSIONS.invoicesEdit)
    const supabase = await createClient()

    const { data: token, error } = await supabase.rpc('enable_invoice_share', {
      p_invoice: invoiceId,
      p_expires_at: options?.expiresAt ?? null,
      p_regenerate: options?.regenerate ?? false,
    })
    if (error) return { ok: false, error: error.message }

    const h = await headers()
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host') ?? 'localhost:3000'}`

    await logEvent({
      action: 'invoice.shared',
      entity: 'invoices',
      entityId: invoiceId,
      summary: options?.regenerate
        ? 'Generated a new client link (the old one stopped working)'
        : 'Created a client link for this invoice',
    })

    touched(invoiceId)
    return { ok: true, message: 'Link ready', url: `${origin}/i/${token as string}` }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function unshareInvoice(invoiceId: string): Promise<ActionResult> {
  try {
    await assertPermission(PERMISSIONS.invoicesEdit)
    const supabase = await createClient()
    const { error } = await supabase.rpc('disable_invoice_share', { p_invoice: invoiceId })
    if (error) return { ok: false, error: error.message }

    await logEvent({
      action: 'invoice.unshared',
      entity: 'invoices',
      entityId: invoiceId,
      summary: 'Withdrew the client link',
    })

    touched(invoiceId)
    return { ok: true, message: 'Link withdrawn' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Sessions and rentals for a client that have not been put on an invoice yet,
 * so a bill can be assembled in one tap instead of retyped.
 */
export async function unbilledWork(clientId: string | null, clientName: string) {
  try {
    await assertPermission(PERMISSIONS.invoicesCreate)
    const supabase = await createClient()

    const [sessionsRes, rentalsRes, billedRes] = await Promise.all([
      clientId
        ? supabase
            .from('sessions')
            .select('id, code, client_name, date, total_amount, package')
            .eq('client_id', clientId)
            .neq('status', 'cancelled')
            .order('date', { ascending: false })
            .limit(50)
        : supabase
            .from('sessions')
            .select('id, code, client_name, date, total_amount, package')
            .ilike('client_name', clientName)
            .neq('status', 'cancelled')
            .order('date', { ascending: false })
            .limit(50),
      clientId
        ? supabase
            .from('rentals')
            .select('id, code, gear_name, start_date, fee')
            .eq('client_id', clientId)
            .neq('status', 'cancelled')
            .order('start_date', { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] as { id: string; code: string; gear_name: string; start_date: string; fee: number }[] }),
      supabase.from('invoice_items').select('ref_id').not('ref_id', 'is', null),
    ])

    const billed = new Set((billedRes.data ?? []).map((r) => r.ref_id as string))

    return {
      sessions: (sessionsRes.data ?? []).filter((s) => !billed.has(s.id)),
      rentals: (rentalsRes.data ?? []).filter((r) => !billed.has(r.id)),
    }
  } catch {
    return { sessions: [], rentals: [] }
  }
}
