'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useApp } from '@/components/app-context'
import { useLang, useT } from '@/components/lang-provider'
import {
  Badge,
  Card,
  ConfirmButton,
  Drawer,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SearchInput,
  Segmented,
  StatCard,
  SubmitButton,
  Toolbar,
  useToast,
} from '@/components/ui'
import { Icon } from '@/components/icons'
import { PERMISSIONS } from '@/lib/permissions'
import { addDays, egp, formatDate, todayKey } from '@/lib/format'
import {
  deleteInvoice,
  recordPayment,
  saveInvoice,
  setInvoiceStatus,
  unbilledWork,
  type InvoiceItemInput,
} from '@/server/invoices'
import type { Client, InvoiceBalance, InvoiceItem, InvoiceStatus, Payment } from '@/lib/types'

type Filter = 'open' | 'paid' | 'all'

const METHODS = ['cash', 'instapay', 'bank', 'wallet', 'card']

const STATUS_TONE: Record<InvoiceStatus, 'neutral' | 'ink' | 'good' | 'warn'> = {
  draft: 'neutral',
  sent: 'ink',
  partial: 'warn',
  paid: 'good',
  void: 'neutral',
}

type Draft = {
  id?: string
  clientId: string
  clientName: string
  clientCompany: string
  clientPhone: string
  clientEmail: string
  clientAddress: string
  issueDate: string
  dueDate: string
  discount: number
  taxRate: number
  notes: string
  terms: string
  items: (InvoiceItemInput & { key: string })[]
}

const emptyDraft = (): Draft => ({
  clientId: '',
  clientName: '',
  clientCompany: '',
  clientPhone: '',
  clientEmail: '',
  clientAddress: '',
  issueDate: todayKey(),
  dueDate: addDays(todayKey(), 14),
  discount: 0,
  taxRate: 0,
  notes: '',
  terms: '',
  items: [{ key: 'i0', description: '', qty: 1, unitPrice: 0 }],
})

export function InvoicesView({
  invoices,
  clients,
  payments,
}: {
  invoices: InvoiceBalance[]
  clients: Client[]
  payments: Payment[]
}) {
  const t = useT()
  const { lang } = useLang()
  const toast = useToast()
  const { can } = useApp()
  const [pending, start] = useTransition()

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('open')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailItems, setDetailItems] = useState<InvoiceItem[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)

  const [payAmount, setPayAmount] = useState(0)
  const [payMethod, setPayMethod] = useState('cash')
  const [payDate, setPayDate] = useState(todayKey())
  const [payReference, setPayReference] = useState('')
  const [payToLedger, setPayToLedger] = useState(false)

  const [unbilled, setUnbilled] = useState<{
    sessions: { id: string; code: string; date: string; total_amount: number; package: string }[]
    rentals: { id: string; code: string; gear_name: string; start_date: string; fee: number }[]
  }>({ sessions: [], rentals: [] })

  const today = todayKey()
  const detail = invoices.find((i) => i.id === detailId) ?? null
  const detailPayments = payments.filter((p) => p.invoice_id === detailId)

  // Line items for the open invoice are fetched on demand, not shipped with the list.
  useEffect(() => {
    if (!detailId) {
      setDetailItems([])
      return
    }
    let cancelled = false
    void (async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const { data } = await createClient()
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', detailId)
        .order('sort')
      if (!cancelled) setDetailItems((data ?? []) as unknown as InvoiceItem[])
    })()
    return () => {
      cancelled = true
    }
  }, [detailId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return invoices
      .filter((i) =>
        filter === 'open'
          ? i.status !== 'paid' && i.status !== 'void'
          : filter === 'paid'
            ? i.status === 'paid'
            : true,
      )
      .filter((i) =>
        q
          ? i.client_name.toLowerCase().includes(q) || i.number.toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => (a.issue_date < b.issue_date ? 1 : -1))
  }, [invoices, filter, query])

  const stats = useMemo(() => {
    const live = invoices.filter((i) => i.status !== 'void')
    return {
      invoiced: live.reduce((s, i) => s + Number(i.total), 0),
      collected: live.reduce((s, i) => s + Number(i.paid_amount), 0),
      outstanding: live.reduce((s, i) => s + Number(i.balance), 0),
      overdue: live.filter((i) => Number(i.balance) > 0 && i.due_date && i.due_date < today).length,
    }
  }, [invoices, today])

  /* ------------------------------ editor ------------------------------ */

  const openEditor = (invoice?: InvoiceBalance, items?: InvoiceItem[]) => {
    setError(null)
    if (invoice) {
      setDraft({
        id: invoice.id,
        clientId: invoice.client_id ?? '',
        clientName: invoice.client_name,
        clientCompany: invoice.client_company ?? '',
        clientPhone: invoice.client_phone ?? '',
        clientEmail: invoice.client_email ?? '',
        clientAddress: invoice.client_address ?? '',
        issueDate: invoice.issue_date,
        dueDate: invoice.due_date ?? addDays(invoice.issue_date, 14),
        discount: Number(invoice.discount),
        taxRate: Number(invoice.tax_rate),
        notes: invoice.notes ?? '',
        terms: invoice.terms ?? '',
        items: (items ?? []).map((it, i) => ({
          key: `e${i}`,
          description: it.description,
          qty: Number(it.qty),
          unitPrice: Number(it.unit_price),
          refType: it.ref_type,
          refId: it.ref_id,
        })),
      })
    } else {
      setDraft(emptyDraft())
    }
    setUnbilled({ sessions: [], rentals: [] })
    setEditorOpen(true)
  }

  const pickClient = (client: Client) => {
    setDraft((d) => ({
      ...d,
      clientId: client.id,
      clientName: client.name,
      clientCompany: client.company ?? '',
      clientPhone: client.phone ?? '',
      clientEmail: client.email ?? '',
    }))
    start(async () => {
      const work = await unbilledWork(client.id, client.name)
      setUnbilled(work)
    })
  }

  const addLine = (line?: Partial<InvoiceItemInput>) =>
    setDraft((d) => ({
      ...d,
      items: [
        ...d.items,
        {
          key: `n${Date.now()}${d.items.length}`,
          description: line?.description ?? '',
          qty: line?.qty ?? 1,
          unitPrice: line?.unitPrice ?? 0,
          refType: line?.refType ?? null,
          refId: line?.refId ?? null,
        },
      ],
    }))

  const updateLine = (key: string, patch: Partial<InvoiceItemInput>) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    }))

  const removeLine = (key: string) =>
    setDraft((d) => ({ ...d, items: d.items.filter((i) => i.key !== key) }))

  const draftSubtotal = draft.items.reduce((s, i) => s + i.qty * i.unitPrice, 0)
  const draftTax = Math.round(
    ((Math.max(draftSubtotal - draft.discount, 0) * draft.taxRate) / 100) * 100,
  ) / 100
  const draftTotal = Math.max(draftSubtotal - draft.discount, 0) + draftTax

  const submitInvoice = () => {
    setError(null)
    start(async () => {
      const result = await saveInvoice({
        id: draft.id,
        clientId: draft.clientId || null,
        clientName: draft.clientName,
        clientCompany: draft.clientCompany,
        clientPhone: draft.clientPhone,
        clientEmail: draft.clientEmail,
        clientAddress: draft.clientAddress,
        issueDate: draft.issueDate,
        dueDate: draft.dueDate,
        discount: draft.discount,
        taxRate: draft.taxRate,
        notes: draft.notes,
        terms: draft.terms,
        items: draft.items,
      })
      if (result.ok) {
        toast(result.message ?? t('toast.saved'))
        setEditorOpen(false)
      } else {
        setError(result.error ?? t('toast.error'))
      }
    })
  }

  const submitPayment = () => {
    if (!detail) return
    setError(null)
    start(async () => {
      const result = await recordPayment({
        invoiceId: detail.id,
        amount: payAmount,
        method: payMethod,
        paidAt: payDate,
        reference: payReference,
        postToLedger: payToLedger,
      })
      if (result.ok) {
        toast(result.message ?? t('toast.saved'))
        setPayOpen(false)
      } else {
        setError(result.error ?? t('toast.error'))
      }
    })
  }

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, close = false) =>
    start(async () => {
      const result = await fn()
      toast(
        result.ok ? (result.message ?? t('toast.saved')) : (result.error ?? t('toast.error')),
        result.ok ? 'ok' : 'error',
      )
      if (result.ok && close) setDetailId(null)
    })

  return (
    <>
      <PageHeader
        title={t('inv.title')}
        subtitle={t('inv.sub')}
        actions={
          can(PERMISSIONS.invoicesCreate) && (
            <button type="button" onClick={() => openEditor()} className="ob-btn ob-btn-primary">
              <Icon name="plus" size={15} />
              {t('inv.new')}
            </button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('inv.totalInvoiced')} value={egp(stats.invoiced)} icon="receipt" />
        <StatCard label={t('inv.collected')} value={egp(stats.collected)} tone="good" icon="wallet" />
        <StatCard
          label={t('inv.outstanding')}
          value={egp(stats.outstanding)}
          tone={stats.outstanding > 0 ? 'warn' : 'default'}
          icon="clock"
        />
        <StatCard
          label={t('inv.overdue')}
          value={stats.overdue}
          tone={stats.overdue > 0 ? 'warn' : 'default'}
          icon="alert"
        />
      </div>

      <Card className="p-4 sm:p-5">
        <Toolbar>
          <SearchInput value={query} onChange={setQuery} />
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'open', label: t('inv.outstanding') },
              { value: 'paid', label: t('inv.status.paid') },
              { value: 'all', label: t('common.all') },
            ]}
          />
        </Toolbar>

        {filtered.length === 0 ? (
          <EmptyState
            icon="receipt"
            title={t('inv.empty')}
            action={
              can(PERMISSIONS.invoicesCreate) ? (
                <button type="button" onClick={() => openEditor()} className="ob-btn ob-btn-primary">
                  {t('inv.new')}
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {filtered.map((inv) => {
              const overdue =
                Number(inv.balance) > 0 && inv.due_date && inv.due_date < today
              return (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => setDetailId(inv.id)}
                  className={`flex items-center gap-3 rounded-[14px] border px-4 py-3.5 text-start transition-colors hover:bg-paper ${
                    overdue ? 'border-clay/25 bg-clay/5' : 'border-ink/8 bg-paper/50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-extrabold">{inv.client_name}</div>
                    <div className="ob-ltr truncate font-mono text-[11.5px] font-semibold text-ink/50">
                      {inv.number}
                    </div>
                    <div className="mt-0.5 text-[11.5px] font-semibold text-ink/45">
                      <span className="ob-ltr">{formatDate(inv.issue_date, lang, 'short')}</span>
                      {inv.due_date && (
                        <>
                          {' · '}
                          {t('inv.dueDate')}{' '}
                          <span className={`ob-ltr ${overdue ? 'font-bold text-clay' : ''}`}>
                            {formatDate(inv.due_date, lang, 'short')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                    <span className="ob-ltr text-[13px] font-extrabold">{egp(inv.total)}</span>
                    {Number(inv.balance) > 0 && Number(inv.paid_amount) > 0 && (
                      <span className="ob-ltr text-[11px] font-semibold text-clay">
                        {egp(inv.balance)} {t('inv.balance').toLowerCase()}
                      </span>
                    )}
                    <Badge tone={STATUS_TONE[inv.status]}>{t(`inv.status.${inv.status}`)}</Badge>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </Card>

      {/* ------------------------------ detail ------------------------------ */}
      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetailId(null)}
        title={t('inv.number')}
        footer={
          detail && (
            <>
              <Link
                href={`/print/invoice/${detail.id}`}
                className="ob-btn ob-btn-primary flex-[1.4]"
              >
                <Icon name="download" size={15} />
                {t('inv.print')}
              </Link>
              {can(PERMISSIONS.invoicesEdit) && detail.status !== 'void' && (
                <button
                  type="button"
                  onClick={() => {
                    setDetailId(null)
                    openEditor(detail, detailItems)
                  }}
                  className="ob-btn ob-btn-ghost flex-1"
                >
                  <Icon name="edit" size={15} />
                </button>
              )}
              {can(PERMISSIONS.invoicesDelete) && (
                <ConfirmButton
                  onConfirm={() => run(() => deleteInvoice(detail.id), true)}
                  disabled={pending}
                  className="flex-shrink-0 px-4"
                >
                  <Icon name="trash" size={15} />
                </ConfirmButton>
              )}
            </>
          )
        }
      >
        {detail && (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[20px] font-extrabold tracking-[-0.4px]">
                  {detail.client_name}
                </div>
                <div className="ob-ltr mt-0.5 font-mono text-[12.5px] font-semibold text-ink/55">
                  {detail.number}
                </div>
              </div>
              <Badge tone={STATUS_TONE[detail.status]}>{t(`inv.status.${detail.status}`)}</Badge>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <div className="ob-tile px-3.5 py-3">
                <div className="ob-label">{t('inv.issueDate')}</div>
                <div className="ob-ltr mt-0.5 text-[13.5px] font-extrabold">
                  {formatDate(detail.issue_date, lang, 'short')}
                </div>
              </div>
              <div className="ob-tile px-3.5 py-3">
                <div className="ob-label">{t('inv.dueDate')}</div>
                <div className="ob-ltr mt-0.5 text-[13.5px] font-extrabold">
                  {detail.due_date ? formatDate(detail.due_date, lang, 'short') : '—'}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="ob-label mb-2">{t('inv.items')}</div>
              <div className="flex flex-col gap-1">
                {detailItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-ink/8 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-bold">{item.description}</div>
                      <div className="ob-ltr text-[11px] font-semibold text-ink/45">
                        {item.qty} × {egp(item.unit_price)}
                      </div>
                    </div>
                    <span className="ob-ltr flex-shrink-0 text-[12.5px] font-extrabold">
                      {egp(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-[14px] border border-ink/10 px-4">
              <SummaryRow label={t('inv.subtotal')} value={egp(detail.subtotal)} />
              {Number(detail.discount) > 0 && (
                <SummaryRow label={t('inv.discount')} value={`−${egp(detail.discount)}`} />
              )}
              {Number(detail.tax_rate) > 0 && (
                <SummaryRow
                  label={`${t('inv.tax')} ${detail.tax_rate}%`}
                  value={egp(detail.tax_amount)}
                />
              )}
            </div>

            <div className="mt-3 flex items-center justify-between rounded-[15px] bg-ink px-4 py-4 text-sand">
              <span className="text-[13.5px] font-bold">{t('inv.total')}</span>
              <b className="ob-ltr text-[18px]">{egp(detail.total)}</b>
            </div>

            {Number(detail.paid_amount) > 0 && (
              <div className="mt-2 flex items-center justify-between rounded-[14px] bg-moss/8 px-4 py-3">
                <span className="text-[12.5px] font-bold text-moss">{t('inv.paid')}</span>
                <b className="ob-ltr text-[14px] text-moss">{egp(detail.paid_amount)}</b>
              </div>
            )}
            {Number(detail.balance) > 0 && (
              <div className="mt-2 flex items-center justify-between rounded-[14px] bg-clay/8 px-4 py-3">
                <span className="text-[12.5px] font-bold text-clay">{t('inv.balance')}</span>
                <b className="ob-ltr text-[14px] text-clay">{egp(detail.balance)}</b>
              </div>
            )}

            <div className="mt-4">
              <div className="ob-label mb-2">{t('inv.payments')}</div>
              {detailPayments.length === 0 ? (
                <p className="text-[12px] font-medium text-ink/40">{t('inv.noPayments')}</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {detailPayments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-ink/4 px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="ob-ltr text-[12.5px] font-bold">
                          {formatDate(p.paid_at, lang, 'short')}
                        </div>
                        <div className="text-[11px] font-semibold capitalize text-ink/45">
                          {p.method}
                          {p.reference ? ` · ${p.reference}` : ''}
                        </div>
                      </div>
                      <span className="ob-ltr text-[12.5px] font-extrabold text-moss">
                        {egp(p.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-2">
              {can(PERMISSIONS.invoicesPay) &&
                detail.status !== 'void' &&
                Number(detail.balance) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null)
                      setPayAmount(Number(detail.balance))
                      setPayMethod('cash')
                      setPayDate(todayKey())
                      setPayReference('')
                      setPayToLedger(false)
                      setPayOpen(true)
                    }}
                    className="ob-btn ob-btn-primary h-11 w-full"
                  >
                    <Icon name="wallet" size={15} />
                    {t('inv.recordPayment')}
                  </button>
                )}

              {can(PERMISSIONS.invoicesEdit) && detail.status === 'draft' && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => setInvoiceStatus(detail.id, 'sent'))}
                  className="ob-btn ob-btn-ghost h-11 w-full"
                >
                  {t('inv.markSent')}
                </button>
              )}

              {detail.client_id && (
                <Link
                  href={`/print/statement/${detail.client_id}`}
                  className="ob-btn ob-btn-ghost h-11 w-full"
                >
                  <Icon name="receipt" size={15} />
                  {t('inv.openStatement')}
                </Link>
              )}
            </div>
          </>
        )}
      </Drawer>

      {/* ------------------------------ editor ------------------------------ */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={draft.id ? t('common.edit') : t('inv.new')}
        width={620}
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="ob-btn ob-btn-ghost flex-1"
            >
              {t('common.cancel')}
            </button>
            <SubmitButton
              type="button"
              onClick={submitInvoice}
              pending={pending}
              disabled={!draft.clientName.trim() || draftTotal <= 0}
              className="flex-[1.6]"
            >
              {t('common.save')}
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4 pb-4">
          {error && (
            <div className="rounded-xl bg-clay/10 px-4 py-3 text-[12.5px] font-semibold text-clay">
              {error}
            </div>
          )}

          <Field label={t('common.client')}>
            <input
              className="ob-input"
              value={draft.clientName}
              onChange={(e) =>
                setDraft((d) => ({ ...d, clientName: e.target.value, clientId: '' }))
              }
            />
            {clients.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {clients.slice(0, 6).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pickClient(c)}
                    data-on={draft.clientId === c.id}
                    className="ob-chip h-8 text-[11.5px]"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </Field>

          {(unbilled.sessions.length > 0 || unbilled.rentals.length > 0) && (
            <div className="rounded-[14px] border border-gold/30 bg-gold/6 p-3.5">
              <div className="ob-label mb-1 text-olive">{t('inv.pullFrom')}</div>
              <p className="mb-2.5 text-[11.5px] font-medium text-ink/55">{t('inv.pullHint')}</p>
              <div className="flex flex-wrap gap-1.5">
                {unbilled.sessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      addLine({
                        description: `Studio session ${s.code} · ${formatDate(s.date, lang, 'short')}`,
                        qty: 1,
                        unitPrice: Number(s.total_amount),
                        refType: 'session',
                        refId: s.id,
                      })
                    }
                    className="ob-chip h-8 text-[11.5px]"
                  >
                    <Icon name="plus" size={12} />
                    {s.code} · {egp(s.total_amount)}
                  </button>
                ))}
                {unbilled.rentals.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() =>
                      addLine({
                        description: `${r.gear_name} rental ${r.code}`,
                        qty: 1,
                        unitPrice: Number(r.fee),
                        refType: 'rental',
                        refId: r.id,
                      })
                    }
                    className="ob-chip h-8 text-[11.5px]"
                  >
                    <Icon name="plus" size={12} />
                    {r.gear_name} · {egp(r.fee)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Field label={t('inv.issueDate')} className="flex-1">
              <input
                className="ob-input"
                type="date"
                value={draft.issueDate}
                onChange={(e) => setDraft((d) => ({ ...d, issueDate: e.target.value }))}
              />
            </Field>
            <Field label={t('inv.dueDate')} className="flex-1">
              <input
                className="ob-input"
                type="date"
                value={draft.dueDate}
                onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))}
              />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="ob-label">{t('inv.items')}</span>
              <button
                type="button"
                onClick={() => addLine()}
                className="text-[11.5px] font-bold text-ink/60 hover:text-ink"
              >
                + {t('inv.addItem')}
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {draft.items.map((item) => (
                <div key={item.key} className="rounded-[13px] border border-ink/10 p-2.5">
                  <input
                    className="ob-input mb-2 h-10"
                    value={item.description}
                    placeholder={t('inv.description')}
                    onChange={(e) => updateLine(item.key, { description: e.target.value })}
                  />
                  <div className="flex items-center gap-2">
                    <input
                      className="ob-input h-10 w-20"
                      type="number"
                      inputMode="decimal"
                      value={item.qty}
                      onChange={(e) =>
                        updateLine(item.key, { qty: Number(e.target.value) || 0 })
                      }
                      dir="ltr"
                      aria-label={t('inv.qty')}
                    />
                    <span className="text-ink/30">×</span>
                    <input
                      className="ob-input h-10 flex-1"
                      type="number"
                      inputMode="numeric"
                      value={item.unitPrice}
                      onChange={(e) =>
                        updateLine(item.key, { unitPrice: Number(e.target.value) || 0 })
                      }
                      dir="ltr"
                      aria-label={t('inv.unitPrice')}
                    />
                    <span className="ob-ltr w-20 text-end text-[12.5px] font-extrabold">
                      {egp(item.qty * item.unitPrice)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLine(item.key)}
                      disabled={draft.items.length === 1}
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-ink/12 disabled:opacity-30"
                      aria-label={t('common.remove')}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Field label={t('inv.discount')} className="flex-1">
              <input
                className="ob-input"
                type="number"
                inputMode="numeric"
                value={draft.discount}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, discount: Number(e.target.value) || 0 }))
                }
                dir="ltr"
              />
            </Field>
            <Field label={t('inv.taxRate')} className="flex-1">
              <input
                className="ob-input"
                type="number"
                inputMode="decimal"
                value={draft.taxRate}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, taxRate: Number(e.target.value) || 0 }))
                }
                dir="ltr"
              />
            </Field>
          </div>

          <div className="rounded-[14px] bg-ink/6 px-4 py-3.5">
            <SummaryRow label={t('inv.subtotal')} value={egp(draftSubtotal)} />
            {draft.taxRate > 0 && (
              <SummaryRow label={`${t('inv.tax')} ${draft.taxRate}%`} value={egp(draftTax)} />
            )}
            <div className="mt-1 flex items-center justify-between border-t border-ink/10 pt-2.5">
              <span className="text-[13px] font-extrabold">{t('inv.total')}</span>
              <b className="ob-ltr text-[17px]">{egp(draftTotal)}</b>
            </div>
          </div>

          <Field label={t('common.notes')} hint={t('common.optional')}>
            <textarea
              className="ob-input"
              rows={2}
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            />
          </Field>
          <Field label={t('inv.terms')} hint={t('inv.termsDefault')}>
            <input
              className="ob-input"
              value={draft.terms}
              onChange={(e) => setDraft((d) => ({ ...d, terms: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      {/* ------------------------------ payment ------------------------------ */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={t('inv.recordPayment')}
        subtitle={detail?.number}
        footer={
          <>
            <button
              type="button"
              onClick={() => setPayOpen(false)}
              className="ob-btn ob-btn-ghost flex-1"
            >
              {t('common.cancel')}
            </button>
            <SubmitButton
              type="button"
              onClick={submitPayment}
              pending={pending}
              disabled={payAmount <= 0}
              className="flex-[1.6]"
            >
              {t('common.confirm')}
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4 pb-4">
          {error && (
            <div className="rounded-xl bg-clay/10 px-4 py-3 text-[12.5px] font-semibold text-clay">
              {error}
            </div>
          )}
          <div className="flex gap-3">
            <Field label={t('common.amount')} className="flex-1">
              <input
                className="ob-input"
                type="number"
                inputMode="numeric"
                value={payAmount || ''}
                onChange={(e) => setPayAmount(Number(e.target.value) || 0)}
                dir="ltr"
              />
            </Field>
            <Field label={t('common.date')} className="flex-1">
              <input
                className="ob-input"
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </Field>
          </div>
          <Field label={t('inv.method')}>
            <div className="flex flex-wrap gap-1.5">
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayMethod(m)}
                  data-on={payMethod === m}
                  className="ob-chip capitalize"
                >
                  {m}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('inv.reference')} hint={t('common.optional')}>
            <input
              className="ob-input"
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              dir="ltr"
            />
          </Field>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-ink/5 px-4 py-3">
            <input
              type="checkbox"
              checked={payToLedger}
              onChange={(e) => setPayToLedger(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#063930]"
            />
            <span>
              <span className="block text-[12.5px] font-semibold">{t('inv.postToLedger')}</span>
              <span className="block text-[11px] text-ink/50">{t('inv.postHint')}</span>
            </span>
          </label>
        </div>
      </Modal>
    </>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 text-[12.5px]">
      <span className="font-semibold text-ink/60">{label}</span>
      <span className="ob-ltr font-bold">{value}</span>
    </div>
  )
}
