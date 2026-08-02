'use client'

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
  Stepper,
  SubmitButton,
  Toolbar,
  useToast,
} from '@/components/ui'
import { Icon } from '@/components/icons'
import { PERMISSIONS } from '@/lib/permissions'
import { addDays, daysBetween, egp, formatDate, todayKey } from '@/lib/format'
import { deleteRental, returnRental, saveRental } from '@/server/rentals'
import type { Client, Gear, Rental, RentalStatus } from '@/lib/types'

type Filter = 'open' | 'returned' | 'all'

export function RentalsView({
  rentals,
  gear,
  clients,
}: {
  rentals: Rental[]
  gear: Gear[]
  clients: Client[]
}) {
  const t = useT()
  const { lang } = useLang()
  const toast = useToast()
  const { can } = useApp()
  const [pending, start] = useTransition()

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('open')
  const [formOpen, setFormOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [returnCondition, setReturnCondition] = useState('')

  const today = todayKey()

  const [gearId, setGearId] = useState('')
  const [renterName, setRenterName] = useState('')
  const [renterPhone, setRenterPhone] = useState('')
  const [clientId, setClientId] = useState('')
  const [qty, setQty] = useState(1)
  const [startDate, setStartDate] = useState(today)
  const [dueDate, setDueDate] = useState(addDays(today, 3))
  const [fee, setFee] = useState(0)
  const [deposit, setDeposit] = useState(0)
  const [conditionOut, setConditionOut] = useState('')
  const [recordIncome, setRecordIncome] = useState(true)

  const availableGear = useMemo(
    () => gear.filter((g) => g.status === 'in' && !g.is_archived),
    [gear],
  )

  // Default the fee to the item's own rate as soon as one is picked.
  useEffect(() => {
    const item = gear.find((g) => g.id === gearId)
    if (item) setFee(Number(item.rate))
  }, [gearId, gear])

  const openForm = () => {
    setError(null)
    setGearId('')
    setRenterName('')
    setRenterPhone('')
    setClientId('')
    setQty(1)
    setStartDate(today)
    setDueDate(addDays(today, 3))
    setFee(0)
    setDeposit(0)
    setConditionOut('')
    setRecordIncome(true)
    setFormOpen(true)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rentals
      .filter((r) =>
        filter === 'open'
          ? r.status === 'active' || r.status === 'overdue'
          : filter === 'returned'
            ? r.status === 'returned'
            : true,
      )
      .filter((r) =>
        q
          ? r.renter_name.toLowerCase().includes(q) ||
            r.gear_name.toLowerCase().includes(q) ||
            r.code.toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => (a.due_date < b.due_date ? -1 : 1))
  }, [rentals, filter, query])

  const open = rentals.filter((r) => r.status === 'active' || r.status === 'overdue')
  const overdue = open.filter((r) => r.due_date < today)

  const submit = () => {
    setError(null)
    start(async () => {
      const result = await saveRental({
        gearId,
        clientId: clientId || null,
        renterName,
        renterPhone,
        qty,
        startDate,
        dueDate,
        fee,
        deposit,
        conditionOut,
        recordIncome,
      })
      if (result.ok) {
        toast(result.message ?? t('toast.saved'))
        setFormOpen(false)
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

  const detail = rentals.find((r) => r.id === detailId) ?? null

  const statusOf = (r: Rental): { label: string; tone: 'ink' | 'good' | 'warn' | 'neutral' } => {
    if (r.status === 'returned') return { label: t('rentals.returned'), tone: 'good' }
    if (r.status === 'cancelled') return { label: t('orders.cancelled'), tone: 'neutral' }
    if (r.due_date < today) return { label: t('rentals.overdue'), tone: 'warn' }
    return { label: t('rentals.active'), tone: 'ink' }
  }

  return (
    <>
      <PageHeader
        title={t('rentals.title')}
        subtitle={t('rentals.sub')}
        actions={
          can(PERMISSIONS.rentalsCreate) && (
            <button type="button" onClick={openForm} className="ob-btn ob-btn-primary">
              <Icon name="plus" size={15} />
              {t('rentals.new')}
            </button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('rentals.active')} value={open.length} icon="truck" />
        <StatCard
          label={t('rentals.overdue')}
          value={overdue.length}
          tone={overdue.length ? 'warn' : 'default'}
          icon="alert"
        />
        <StatCard
          label={t('gear.available')}
          value={availableGear.length}
          sub={`${t('common.of')} ${gear.length}`}
          icon="camera"
        />
        <StatCard
          label={t('rentals.fee')}
          value={egp(open.reduce((sum, r) => sum + Number(r.fee), 0))}
          icon="wallet"
        />
      </div>

      {overdue.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-[16px] border border-clay/25 bg-clay/8 px-4 py-3.5">
          <Icon name="alert" size={17} className="mt-px flex-shrink-0 text-clay" />
          <div className="min-w-0 text-[12.5px] font-semibold text-clay">
            {overdue.map((r) => (
              <div key={r.id} className="truncate">
                {r.gear_name} · {r.renter_name} —{' '}
                <span className="ob-ltr">
                  {Math.abs(daysBetween(r.due_date, today))} {t('rentals.daysLate')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Card className="p-4 sm:p-5">
        <Toolbar>
          <SearchInput value={query} onChange={setQuery} />
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'open', label: t('rentals.active') },
              { value: 'returned', label: t('rentals.returned') },
              { value: 'all', label: t('common.all') },
            ]}
          />
        </Toolbar>

        {filtered.length === 0 ? (
          <EmptyState
            icon="truck"
            title={t('rentals.empty')}
            action={
              can(PERMISSIONS.rentalsCreate) ? (
                <button type="button" onClick={openForm} className="ob-btn ob-btn-primary">
                  {t('rentals.new')}
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {filtered.map((r) => {
              const st = statusOf(r)
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setDetailId(r.id)}
                  className="flex items-center gap-3 rounded-[14px] border border-ink/8 bg-paper/50 px-4 py-3.5 text-start transition-colors hover:bg-paper"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-extrabold">{r.gear_name}</div>
                    <div className="truncate text-[11.5px] font-semibold text-ink/50">
                      {r.renter_name} · <span className="ob-ltr">{r.code}</span>
                    </div>
                    <div className="mt-1 text-[11.5px] font-semibold text-ink/45">
                      {t('rentals.due')}{' '}
                      <span className="ob-ltr">{formatDate(r.due_date, lang, 'short')}</span>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                    <span className="ob-ltr text-[13px] font-extrabold">{egp(r.fee)}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
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
        title={t('common.details')}
        footer={
          detail && (
            <>
              {can(PERMISSIONS.rentalsEdit) && detail.status !== 'returned' && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => returnRental(detail.id, returnCondition), true)}
                  className="ob-btn ob-btn-primary flex-[1.6]"
                >
                  <Icon name="check" size={15} />
                  {t('rentals.return')}
                </button>
              )}
              {can(PERMISSIONS.rentalsDelete) && (
                <ConfirmButton
                  onConfirm={() => run(() => deleteRental(detail.id), true)}
                  disabled={pending}
                  className="flex-1"
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
            <div className="ob-ltr ob-label">{detail.code}</div>
            <div className="mt-1 text-[21px] font-extrabold tracking-[-0.4px]">
              {detail.gear_name}
            </div>
            <div className="mt-0.5 text-[13px] font-semibold text-ink/55">{detail.renter_name}</div>

            <div className="mt-3">
              <Badge tone={statusOf(detail).tone}>{statusOf(detail).label}</Badge>
            </div>

            {detail.renter_phone && (
              <a
                href={`tel:${detail.renter_phone}`}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-ink/5 px-3.5 py-2.5 text-[13px] font-bold"
              >
                <Icon name="phone" size={15} />
                <span className="ob-ltr">{detail.renter_phone}</span>
              </a>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <div className="ob-tile px-3.5 py-3">
                <div className="ob-label">{t('rentals.startDate')}</div>
                <div className="ob-ltr mt-0.5 text-[13.5px] font-extrabold">
                  {formatDate(detail.start_date, lang, 'short')}
                </div>
              </div>
              <div className="ob-tile px-3.5 py-3">
                <div className="ob-label">{t('rentals.dueDate')}</div>
                <div className="ob-ltr mt-0.5 text-[13.5px] font-extrabold">
                  {formatDate(detail.due_date, lang, 'short')}
                </div>
              </div>
              <div className="ob-tile px-3.5 py-3">
                <div className="ob-label">{t('rentals.fee')}</div>
                <div className="ob-ltr mt-0.5 text-[13.5px] font-extrabold">{egp(detail.fee)}</div>
              </div>
              <div className="ob-tile px-3.5 py-3">
                <div className="ob-label">{t('rentals.deposit')}</div>
                <div className="ob-ltr mt-0.5 text-[13.5px] font-extrabold">
                  {egp(detail.deposit)}
                </div>
              </div>
            </div>

            {detail.condition_out && (
              <div className="mt-2.5 ob-tile px-3.5 py-3">
                <div className="ob-label">{t('rentals.conditionOut')}</div>
                <div className="mt-0.5 text-[12.5px] font-semibold">{detail.condition_out}</div>
              </div>
            )}

            {detail.status !== 'returned' && can(PERMISSIONS.rentalsEdit) && (
              <Field label={t('rentals.conditionIn')} className="mt-4">
                <input
                  className="ob-input"
                  value={returnCondition}
                  onChange={(e) => setReturnCondition(e.target.value)}
                  placeholder={t('common.optional')}
                />
              </Field>
            )}

            {detail.returned_at && (
              <div className="mt-4 rounded-[14px] border border-moss/25 bg-moss/6 px-4 py-3">
                <div className="ob-label text-moss">{t('rentals.returned')}</div>
                <div className="ob-ltr mt-0.5 text-[13px] font-bold">
                  {new Date(detail.returned_at).toLocaleString()}
                </div>
                {detail.condition_in && (
                  <div className="mt-1 text-[12px] font-semibold text-ink/55">
                    {detail.condition_in}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Drawer>

      {/* ------------------------------ new rental ------------------------------ */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={t('rentals.new')}
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
              disabled={!gearId || !renterName.trim()}
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

          <Field
            label={t('gear.title')}
            hint={availableGear.length === 0 ? t('gear.empty') : undefined}
          >
            <select
              className="ob-input"
              value={gearId}
              onChange={(e) => setGearId(e.target.value)}
            >
              <option value="">—</option>
              {availableGear.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {egp(g.rate)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('rentals.renter')}>
            <input
              className="ob-input"
              value={renterName}
              onChange={(e) => {
                setRenterName(e.target.value)
                setClientId('')
              }}
              placeholder={t('rentals.renterPh')}
            />
            {clients.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {clients.slice(0, 5).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setRenterName(c.name)
                      setClientId(c.id)
                      if (c.phone) setRenterPhone(c.phone)
                    }}
                    data-on={clientId === c.id}
                    className="ob-chip h-8 text-[11.5px]"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </Field>

          <Field label={t('common.phone')}>
            <input
              className="ob-input"
              value={renterPhone}
              onChange={(e) => setRenterPhone(e.target.value)}
              inputMode="tel"
              dir="ltr"
            />
          </Field>

          <div className="flex gap-3">
            <Field label={t('rentals.startDate')} className="flex-1">
              <input
                className="ob-input"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label={t('rentals.dueDate')} className="flex-1">
              <input
                className="ob-input"
                type="date"
                value={dueDate}
                min={startDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex gap-3">
            <Field label={t('rentals.fee')} className="flex-1">
              <input
                className="ob-input"
                type="number"
                inputMode="numeric"
                value={fee}
                onChange={(e) => setFee(Number(e.target.value) || 0)}
                dir="ltr"
              />
            </Field>
            <Field label={t('rentals.deposit')} className="flex-1">
              <input
                className="ob-input"
                type="number"
                inputMode="numeric"
                value={deposit}
                onChange={(e) => setDeposit(Number(e.target.value) || 0)}
                dir="ltr"
              />
            </Field>
          </div>

          <Field label={t('common.qty')}>
            <Stepper value={qty} onChange={setQty} min={1} max={20} />
          </Field>

          <Field label={t('rentals.conditionOut')} hint={t('common.optional')}>
            <input
              className="ob-input"
              value={conditionOut}
              onChange={(e) => setConditionOut(e.target.value)}
            />
          </Field>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-ink/5 px-4 py-3">
            <input
              type="checkbox"
              checked={recordIncome}
              onChange={(e) => setRecordIncome(e.target.checked)}
              className="h-4 w-4 accent-[#063930]"
            />
            <span className="text-[12.5px] font-semibold">{t('rentals.logIncome')}</span>
          </label>
        </div>
      </Modal>
    </>
  )
}
