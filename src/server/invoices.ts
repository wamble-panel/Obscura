'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'node:crypto'
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
   * The second currency the client sees, and the figure to print in it.
   * Amounts stay in EGP; this only changes what is shown beside them, and the
   * figure is whatever was typed — nothing is worked out from a rate.
   */
  currency?: CurrencyCode
  currencyAmount?: number | null
  discount: number
  taxRate: number
  notes?: string | null
  terms?: string | null
  items: InvoiceItemInput[]
}

/**
 * Writes a row, dropping any column the database does not have yet.
 *
 * Deploys and migrations do not land at the same moment, and the person who
 * can push a deploy is not always the person who can run SQL. Rather than
 * failing an invoice outright because `section` has not been added yet,
 * PostgREST tells us exactly which column it did not recognise, so the write
 * is retried without it. The invoice saves; it just saves without the parts
 * the schema cannot hold yet, and picks them up once the schema catches up.
 */
const MISSING_COLUMN = /Could not find the '([^']+)' column/i

function withoutColumn<T extends Record<string, unknown>>(row: T, column: string): T {
  const next = { ...row }
  delete next[column]
  return next
}

async function writeTolerantly<T extends Record<string, unknown>, R>(
  row: T,
  attempt: (row: T) => PromiseLike<{ data: R | null; error: { message: string } | null }>,
): Promise<{ data: R | null; error: { message: string } | null; dropped: string[] }> {
  let current = row
  const dropped: string[] = []

  // One retry per optional column, and a hard stop so a persistent error can
  // never spin here.
  for (let i = 0; i < 6; i++) {
    const result = await attempt(current)
    if (!result.error) return { ...result, dropped }

    const missing = MISSING_COLUMN.exec(result.error.message)?.[1]
    if (!missing || !(missing in current)) return { ...result, dropped }

    dropped.push(missing)
    current = withoutColumn(current, missing)
  }

  return { data: null, error: { message: 'Too many unknown columns' }, dropped }
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
      currency_amount:
        toCurrencyCode(input.currency) === 'EGP' || !input.currencyAmount
          ? null
          : Math.max(0, input.currencyAmount),
      discount: Math.max(0, input.discount || 0),
      tax_rate: Math.max(0, input.taxRate || 0),
      notes: input.notes?.trim() || null,
      terms: input.terms?.trim() || null,
    }

    let invoiceId = input.id
    const dropped = new Set<string>()

    if (input.id) {
      const result = await writeTolerantly(header, (row) =>
        supabase.from('invoices').update(row).eq('id', input.id!),
      )
      if (result.error) return { ok: false, error: result.error.message }
      result.dropped.forEach((c) => dropped.add(c))
      await supabase.from('invoice_items').delete().eq('invoice_id', input.id)
    } else {
      const result = await writeTolerantly(header, (row) =>
        supabase.from('invoices').insert(row).select('id').single(),
      )
      if (result.error) return { ok: false, error: result.error.message }
      result.dropped.forEach((c) => dropped.add(c))
      invoiceId = (result.data as unknown as { id: string } | null)?.id
    }

    // A single template row decides which columns exist; the rest follow it,
    // so a long invoice is not twenty round trips of trial and error.
    const template = {
      invoice_id: invoiceId,
      description: '',
      section: null as string | null,
      detail: null as string | null,
      qty: 1,
      unit_price: 0,
      ref_type: null as string | null,
      ref_id: null as string | null,
      sort: 0,
    }
    const lineFor = (item: (typeof items)[number], index: number) => ({
      ...template,
      description: item.description.trim(),
      section: item.section?.trim() || null,
      detail: item.detail?.trim() || null,
      qty: item.qty,
      unit_price: item.unitPrice,
      ref_type: item.refType || null,
      ref_id: item.refId || null,
      sort: index,
    })

    const probe = await writeTolerantly(lineFor(items[0], 0), (row) =>
      supabase.from('invoice_items').insert(row),
    )
    if (probe.error) return { ok: false, error: probe.error.message }
    probe.dropped.forEach((c) => dropped.add(c))

    if (items.length > 1) {
      const rest = items.slice(1).map((item, i) => {
        let row = lineFor(item, i + 1) as Record<string, unknown>
        for (const column of probe.dropped) row = withoutColumn(row, column)
        return row
      })
      const { error: itemsError } = await supabase.from('invoice_items').insert(rest)
      if (itemsError) return { ok: false, error: itemsError.message }
    }

    touched(invoiceId)
    if (dropped.size) {
      return {
        ok: true,
        id: invoiceId,
        message: `Invoice saved. ${[...dropped].join(', ')} needs the latest schema.sql before it can be stored.`,
      }
    }
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

    const { data: rpcToken, error } = await supabase.rpc('enable_invoice_share', {
      p_invoice: invoiceId,
      p_expires_at: options?.expiresAt ?? null,
      p_regenerate: options?.regenerate ?? false,
    })

    let token = rpcToken as string | null

    /*
     * Older databases build the token with gen_random_bytes(), which lives in
     * pgcrypto — installed by Supabase into the `extensions` schema, and so
     * invisible to a function pinned to `search_path = public`. Sharing then
     * fails with "function gen_random_bytes(integer) does not exist". The fix
     * is in schema.sql, but nobody should be unable to send a client their
     * invoice because a migration has not been run yet, so the token is minted
     * here instead. Row-level security still decides whether this is allowed.
     */
    if (error) {
      if (!/gen_random_bytes|does not exist/i.test(error.message)) {
        return { ok: false, error: error.message }
      }

      const { data: existing } = await supabase
        .from('invoices')
        .select('share_token')
        .eq('id', invoiceId)
        .maybeSingle()

      token =
        options?.regenerate || !existing?.share_token
          ? randomUUID().replace(/-/g, '')
          : (existing.share_token as string)

      const patch: Record<string, unknown> = {
        share_token: token,
        share_enabled: true,
        share_expires_at: options?.expiresAt ?? null,
      }
      if (options?.regenerate) patch.share_views = 0

      const written = await writeTolerantly(patch, (row) =>
        supabase.from('invoices').update(row).eq('id', invoiceId),
      )
      if (written.error) return { ok: false, error: written.error.message }
    }

    if (!token) return { ok: false, error: 'Could not create a link for this invoice.' }

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
    return { ok: true, message: 'Link ready', url: `${origin}/i/${token}` }
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
