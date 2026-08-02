'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/components/app-context'
import { useLang, useT } from '@/components/lang-provider'
import {
  Card,
  ConfirmButton,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  StatCard,
  SubmitButton,
  useToast,
} from '@/components/ui'
import { Icon } from '@/components/icons'
import { PERMISSIONS } from '@/lib/permissions'
import { MONTHS } from '@/lib/i18n'
import { egp, formatDateShort, toCsv, todayKey, usd } from '@/lib/format'
import { deleteLedgerEntry, saveLedgerEntry } from '@/server/finance'
import {
  categoriesFor,
  categoryLabel,
  categoryTint,
  groupedCategories,
} from '@/lib/categories'
import type { FinanceSummary, LedgerEntry, LedgerType, StudioSession } from '@/lib/types'

const METHODS = ['cash', 'instapay', 'bank', 'wallet']

export function FinanceView({
  entries,
  sessions,
  summary,
  year,
  month,
}: {
  entries: LedgerEntry[]
  sessions: StudioSession[]
  summary: FinanceSummary
  year: number
  month: number
}) {
  const t = useT()
  const { lang } = useLang()
  const router = useRouter()
  const toast = useToast()
  const { can, settings } = useApp()
  const [pending, start] = useTransition()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<LedgerEntry | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [type, setType] = useState<LedgerType>('out')
  const [category, setCategory] = useState('Salary')
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState(0)
  const [date, setDate] = useState(todayKey())
  const [method, setMethod] = useState('cash')

  const rate = settings.studio.usd_rate

  // The ledger plus every session in the month, so nothing is invisible.
  const rows = useMemo(() => {
    const sessionRows = sessions
      .filter((s) => s.status !== 'cancelled')
      .map((s) => ({
        id: `session-${s.id}`,
        kind: 'session' as const,
        type: 'in' as LedgerType,
        category: 'Session',
        label: s.client_name,
        amount: Number(s.total_amount),
        date: s.date,
      }))

    const ledgerRows = entries.map((e) => ({
      id: e.id,
      kind: 'ledger' as const,
      type: e.type,
      category: e.category,
      label: e.label,
      amount: Number(e.amount),
      date: e.date,
    }))

    return [...sessionRows, ...ledgerRows].sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [entries, sessions])

  const openForm = (entry?: LedgerEntry) => {
    setError(null)
    setEditing(entry ?? null)
    setType(entry?.type ?? 'out')
    setCategory(entry?.category ?? 'Salary')
    setLabel(entry?.label ?? '')
    setAmount(Number(entry?.amount ?? 0))
    setDate(entry?.date ?? todayKey())
    setMethod(entry?.method ?? 'cash')
    setFormOpen(true)
  }

  const submit = () => {
    setError(null)
    start(async () => {
      const result = await saveLedgerEntry({
        id: editing?.id,
        type,
        category,
        label,
        amount,
        date,
        method,
      })
      if (result.ok) {
        toast(result.message ?? t('toast.saved'))
        setFormOpen(false)
      } else {
        setError(result.error ?? t('toast.error'))
      }
    })
  }

  const goMonth = (delta: number) => {
    let m = month + delta
    let y = year
    if (m < 0) {
      m = 11
      y -= 1
    }
    if (m > 11) {
      m = 0
      y += 1
    }
    router.push(`/finance?y=${y}&m=${m}`)
  }

  const income = Number(summary.income) + Number(summary.session_revenue)
  const expenses = Number(summary.expenses)
  const net = income - expenses

  /** Expenses grouped by category, biggest first. */
  const spendByCategory = useMemo(() => {
    const totals = new Map<string, number>()
    for (const e of entries) {
      if (e.type !== 'out') continue
      totals.set(e.category, (totals.get(e.category) ?? 0) + Number(e.amount))
    }
    const list = [...totals.entries()]
      .map(([key, amount]) => ({ key, amount }))
      .sort((a, b) => b.amount - a.amount)
    const max = Math.max(1, ...list.map((l) => l.amount))
    return { list, max, total: list.reduce((s, l) => s + l.amount, 0) }
  }, [entries])

  const exportCsv = () => {
    const csv = toCsv(
      rows.map((r) => ({
        date: r.date,
        type: r.type,
        category: r.category,
        label: r.label,
        amount: r.amount,
      })),
    )
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `obscura-finance-${year}-${month + 1}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHeader
        title={t('finance.title')}
        subtitle={t('finance.sub')}
        actions={
          <>
            <div className="flex items-center gap-1 rounded-full border border-ink/12 bg-paper/60 px-1 py-1">
              <button
                type="button"
                onClick={() => goMonth(-1)}
                className="flex h-8 w-8 items-center justify-center rounded-full"
                aria-label="previous month"
              >
                <Icon name="chevronLeft" size={15} className="rtl:rotate-180" />
              </button>
              <span className="px-2 text-[12.5px] font-bold">
                {MONTHS[lang][month]} <span className="ob-ltr">{year}</span>
              </span>
              <button
                type="button"
                onClick={() => goMonth(1)}
                className="flex h-8 w-8 items-center justify-center rounded-full"
                aria-label="next month"
              >
                <Icon name="chevronRight" size={15} className="rtl:rotate-180" />
              </button>
            </div>
            <button type="button" onClick={exportCsv} className="ob-btn ob-btn-ghost">
              <Icon name="download" size={15} />
              <span className="hidden sm:inline">{t('common.export')}</span>
            </button>
            {can(PERMISSIONS.financeCreate) && (
              <button type="button" onClick={() => openForm()} className="ob-btn ob-btn-primary">
                <Icon name="plus" size={15} />
                {t('finance.new')}
              </button>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('finance.net')}
          value={egp(net)}
          sub={usd(net, rate)}
          tone="dark"
          icon="wallet"
        />
        <StatCard label={t('finance.income')} value={egp(income)} tone="good" icon="arrowUp" />
        <StatCard label={t('finance.expenses')} value={egp(expenses)} tone="warn" icon="arrowDown" />
        <StatCard
          label={t('finance.payroll')}
          value={egp(summary.payroll_expense)}
          sub={`${summary.sessions_count} ${t('clients.sessions').toLowerCase()}`}
          icon="team"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <Card className="p-4 sm:p-5">
          <div className="mb-3 text-[14px] font-extrabold">{t('finance.ledger')}</div>

          {rows.length === 0 ? (
            <EmptyState icon="wallet" title={t('finance.empty')} />
          ) : (
            <div className="flex flex-col gap-1">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="group flex items-center gap-3 rounded-[13px] px-2.5 py-2.5 transition-colors hover:bg-ink/4"
                >
                  {/* Tinted by category group, so a month of entries can be
                      scanned without reading every label. */}
                  <span
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: `${categoryTint(r.category)}1A`,
                      color: categoryTint(r.category),
                    }}
                  >
                    <Icon name={r.type === 'in' ? 'arrowDown' : 'arrowUp'} size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold">{r.label}</div>
                    <div className="truncate text-[11.5px] font-semibold text-ink/45">
                      {categoryLabel(r.category, lang)} ·{' '}
                      <span className="ob-ltr">{formatDateShort(r.date, lang)}</span>
                    </div>
                  </div>
                  <span
                    className={`ob-ltr flex-shrink-0 text-[13px] font-extrabold ${
                      r.type === 'in' ? 'text-ink' : 'text-clay'
                    }`}
                  >
                    {r.type === 'in' ? '+' : '−'}
                    {egp(r.amount)}
                  </span>
                  {r.kind === 'ledger' && (
                    <span className="flex flex-shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {can(PERMISSIONS.financeEdit) && (
                        <button
                          type="button"
                          onClick={() => openForm(entries.find((e) => e.id === r.id))}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/12"
                          aria-label="edit"
                        >
                          <Icon name="edit" size={14} />
                        </button>
                      )}
                      {can(PERMISSIONS.financeDelete) && (
                        <ConfirmButton
                          onConfirm={() =>
                            start(async () => {
                              const result = await deleteLedgerEntry(String(r.id))
                              toast(
                                result.ok
                                  ? (result.message ?? t('toast.deleted'))
                                  : (result.error ?? t('toast.error')),
                                result.ok ? 'ok' : 'error',
                              )
                            })
                          }
                          disabled={pending}
                          className="h-8 w-8 px-0"
                        >
                          <Icon name="trash" size={14} />
                        </ConfirmButton>
                      )}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 text-[14px] font-extrabold">{t('dash.monthRevenue')}</div>
          <div className="flex flex-col gap-2.5">
            {[
              { label: t('finance.sessionRevenue'), value: Number(summary.session_revenue) },
              { label: t('finance.rentalRevenue'), value: Number(summary.rental_revenue) },
              { label: t('finance.payroll'), value: Number(summary.payroll_expense) },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-ink/60">{item.label}</span>
                <span className="ob-ltr text-[13.5px] font-extrabold">{egp(item.value)}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-ink/8 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold">{t('finance.net')}</span>
              <span
                className={`ob-ltr text-[18px] font-extrabold ${net >= 0 ? 'text-moss' : 'text-clay'}`}
              >
                {egp(net)}
              </span>
            </div>
            <div className="ob-ltr mt-0.5 text-end text-[11.5px] font-semibold text-ink/45">
              {usd(net, rate)}
            </div>
          </div>

          {spendByCategory.list.length > 0 && (
            <div className="mt-5 border-t border-ink/8 pt-4">
              <div className="ob-label mb-3">{t('finance.whereItWent')}</div>
              <div className="flex flex-col gap-2.5">
                {spendByCategory.list.slice(0, 8).map((row) => (
                  <div key={row.key}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12px] font-semibold text-ink/70">
                        {categoryLabel(row.key, lang)}
                      </span>
                      <span className="ob-ltr flex-shrink-0 text-[12px] font-extrabold">
                        {egp(row.amount)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink/8">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(row.amount / spendByCategory.max) * 100}%`,
                          background: categoryTint(row.key),
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {spendByCategory.list.length > 8 && (
                <p className="mt-2.5 text-[11px] font-semibold text-ink/40">
                  +{spendByCategory.list.length - 8} {t('finance.moreCategories')}
                </p>
              )}
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? t('common.edit') : t('finance.new')}
        footer={
          <>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="ob-btn ob-btn-ghost flex-1"
            >
              {t('common.cancel')}
            </button>
            <SubmitButton
              type="button"
              onClick={submit}
              pending={pending}
              disabled={!amount}
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

          <div className="flex gap-2">
            {(['in', 'out'] as LedgerType[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setType(v)
                  setCategory(categoriesFor(v)[0].key)
                }}
                data-on={type === v}
                className="ob-chip h-11 flex-1 justify-center text-[13px]"
              >
                {v === 'in' ? t('finance.income') : t('finance.expense')}
              </button>
            ))}
          </div>

          <Field label={t('common.category')}>
            {/* Grouped, so twenty-odd categories stay findable. */}
            <select
              className="ob-input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {groupedCategories(type, lang).map((group) => (
                <optgroup key={group.group} label={group.label}>
                  {group.items.map((c) => (
                    <option key={c.key} value={c.key}>
                      {lang === 'ar' ? c.ar : c.en}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>

          <Field label={t('common.notes')}>
            <input
              className="ob-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('finance.labelPh')}
            />
          </Field>

          <div className="flex gap-3">
            <Field label={t('common.amount')} className="flex-1">
              <input
                className="ob-input"
                type="number"
                inputMode="numeric"
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                dir="ltr"
              />
            </Field>
            <Field label={t('common.date')} className="flex-1">
              <input
                className="ob-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </div>

          <Field label={t('finance.method')}>
            <div className="flex flex-wrap gap-1.5">
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  data-on={method === m}
                  className="ob-chip capitalize"
                >
                  {m}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Modal>
    </>
  )
}
