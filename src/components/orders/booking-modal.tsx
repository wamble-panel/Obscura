'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useApp } from '../app-context'
import { useLang } from '../lang-provider'
import { Icon } from '../icons'
import { Field, Modal, SubmitButton, useToast } from '../ui'
import { ClientPicker } from '../client-picker'
import {
  addDays,
  daysBetween,
  egp,
  formatDateShort,
  formatHour,
  packageBase,
  packageHours,
  todayKey,
  usd,
} from '@/lib/format'
import { saveSession, type SessionInput } from '@/server/sessions'
import type { Client, Gear, SessionPackage, StudioSession } from '@/lib/types'

const SHOOT_TYPES = ['product', 'fashion', 'food', 'auto', 'other'] as const

export type BookingSeed = {
  date?: string
  endDate?: string
  startHour?: number
  hours?: number
  package?: SessionPackage
}

export function BookingModal({
  open,
  onClose,
  gear,
  clients,
  session,
  seed,
  sessions = [],
}: {
  open: boolean
  onClose: () => void
  gear: Gear[]
  clients: Client[]
  session?: StudioSession | null
  seed?: BookingSeed
  /** Everything already booked, so taken hours can be greyed out up front. */
  sessions?: StudioSession[]
}) {
  const { t, lang } = useLang()
  const toast = useToast()
  const { settings } = useApp()
  const { pricing, studio } = settings
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [clientName, setClientName] = useState('')
  const [clientId, setClientId] = useState<string>('')
  const [phone, setPhone] = useState('')
  const [shootType, setShootType] = useState<string>('product')
  const [date, setDate] = useState(todayKey())
  const [endDate, setEndDate] = useState(todayKey())
  const [startHour, setStartHour] = useState(11)
  const [pkg, setPkg] = useState<SessionPackage>('half')
  const [hours, setHours] = useState(pricing.hourly_min_hours)
  const [addons, setAddons] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [showAddons, setShowAddons] = useState(false)
  const [showNotes, setShowNotes] = useState(false)

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setError(null)
    if (session) {
      setClientName(session.client_name)
      setClientId(session.client_id ?? '')
      setPhone(session.phone ?? '')
      setShootType(session.shoot_type)
      setDate(session.date)
      setEndDate(session.end_date ?? session.date)
      setStartHour(session.start_hour)
      setPkg(session.package)
      setHours(session.hours)
      setAddons((session.session_addons ?? []).map((a) => a.gear_id).filter(Boolean) as string[])
      setNotes(session.notes ?? '')
      setShowAddons((session.session_addons ?? []).length > 0)
      setShowNotes(Boolean(session.notes))
    } else {
      setClientName('')
      setClientId('')
      setPhone('')
      setShootType('product')
      setDate(seed?.date ?? todayKey())
      setEndDate(seed?.endDate ?? seed?.date ?? todayKey())
      setStartHour(seed?.startHour ?? Math.max(studio.open_hour, 11))
      setPkg(seed?.package ?? 'half')
      setHours(seed?.hours ?? pricing.hourly_min_hours)
      setAddons([])
      setNotes('')
      setShowAddons(false)
      setShowNotes(false)
    }
  }, [open, session, seed, pricing.hourly_min_hours, studio.open_hour])

  const addonTotal = useMemo(
    () => gear.filter((g) => addons.includes(g.id)).reduce((sum, g) => sum + Number(g.rate), 0),
    [addons, gear],
  )

  // Several days is sold as full days — the database prices it that way, so the
  // form must show the same number or the total on screen would be a lie.
  const days = Math.max(1, daysBetween(date, endDate) + 1)
  const isMultiDay = days > 1

  useEffect(() => {
    if (endDate < date) setEndDate(date)
  }, [date, endDate])

  const resolvedHours = packageHours(pkg, hours, pricing)
  const base = isMultiDay ? days * pricing.full_day_price : packageBase(pkg, hours, pricing)
  const total = base + addonTotal
  const deposit = Math.round((total * pricing.deposit_pct) / 100)

  // Suggested add-ons: the studio's most expensive kit, which is what people ask for.
  const addonChoices = useMemo(
    () =>
      [...gear]
        .filter((g) => !g.is_archived && g.status !== 'maint')
        .sort((a, b) => Number(b.rate) - Number(a.rate))
        .slice(0, 12),
    [gear],
  )

  const startChoices = useMemo(() => {
    const list: number[] = []
    for (let h = studio.open_hour; h <= studio.close_hour - 1; h++) list.push(h)
    return list
  }, [studio.open_hour, studio.close_hour])

  /** Everything else on the books that could get in the way, minus this booking. */
  const others = useMemo(
    () => sessions.filter((s) => s.status !== 'cancelled' && s.id !== session?.id),
    [sessions, session?.id],
  )

  /** Hours already spoken for on the first day. */
  const bookedHours = useMemo(() => {
    const taken = new Set<number>()
    for (const s of others) {
      if (s.date !== date) continue
      for (let h = s.start_hour; h < s.start_hour + s.hours; h++) taken.add(h)
    }
    return taken
  }, [others, date])

  /*
   * Say so in the form rather than letting the database reject it on save. The
   * rule matches check_session_overlap(): a booking that spans days takes the
   * whole of every day it touches, so any overlapping range is a clash. Two
   * single-day bookings only clash if their hours actually meet.
   */
  const clash = useMemo(() => {
    for (const s of others) {
      const sEnd = s.end_date ?? s.date
      if (date > sEnd || s.date > endDate) continue
      if (isMultiDay || sEnd > s.date) return true
      if (startHour < s.start_hour + s.hours && s.start_hour < startHour + resolvedHours) return true
    }
    return false
  }, [others, date, endDate, isMultiDay, startHour, resolvedHours])

  const endHour = startHour + resolvedHours

  /**
   * How late this booking could run: the studio's closing time, or the start of
   * the next booking that day, whichever comes first. Offering an end time that
   * cannot be taken is worse than offering fewer.
   */
  const latestEnd = useMemo(() => {
    let limit = studio.close_hour
    for (let h = startHour + 1; h <= studio.close_hour; h++) {
      if (bookedHours.has(h)) {
        limit = h
        break
      }
    }
    return limit
  }, [bookedHours, startHour, studio.close_hour])

  const endChoices = useMemo(() => {
    const list: number[] = []
    for (let h = startHour + pricing.hourly_min_hours; h <= latestEnd; h++) list.push(h)
    // Always show the current value, even if the day has since filled up
    // around it — an empty dropdown is a dead end.
    if (!list.includes(endHour)) list.unshift(endHour)
    return list
  }, [startHour, latestEnd, pricing.hourly_min_hours, endHour])

  // Moving the start must not silently leave the end behind it.
  useEffect(() => {
    if (pkg !== 'hourly') return
    const maxHours = latestEnd - startHour
    if (maxHours >= pricing.hourly_min_hours && hours > maxHours) {
      setHours(maxHours)
    }
  }, [startHour, latestEnd, pkg, hours, pricing.hourly_min_hours])

  const fits = startHour + resolvedHours <= studio.close_hour

  const submit = () => {
    setError(null)
    const input: SessionInput = {
      id: session?.id,
      clientId: clientId || null,
      clientName,
      phone,
      shootType,
      date,
      endDate,
      startHour,
      package: pkg,
      hours,
      addonGearIds: addons,
      notes,
      depositPaid: session?.deposit_paid,
      status: session?.status,
    }
    start(async () => {
      const result = await saveSession(input)
      if (result.ok) {
        toast(result.message ?? t('toast.saved'))
        onClose()
      } else {
        setError(result.error ?? t('toast.error'))
      }
    })
  }

  const pkgOptions: { key: SessionPackage; label: string; sub: string; price: string }[] = [
    {
      key: 'hourly',
      label: t('orders.hourly'),
      sub: `min ${pricing.hourly_min_hours}h`,
      price: `${egp(pricing.hourly_rate)}/h`,
    },
    {
      key: 'half',
      label: t('orders.half'),
      sub: `${pricing.half_day_hours}h`,
      price: egp(pricing.half_day_price),
    },
    {
      key: 'full',
      label: t('orders.full'),
      sub: `${pricing.full_day_hours}h`,
      price: egp(pricing.full_day_price),
    },
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={session ? t('orders.details') : t('orders.new')}
      subtitle={studio.branch}
      footer={
        <>
          <button type="button" onClick={onClose} className="ob-btn ob-btn-ghost flex-1">
            {t('common.cancel')}
          </button>
          <SubmitButton
            type="button"
            onClick={submit}
            pending={pending}
            disabled={!clientName.trim() || !fits || clash}
            className="flex-[1.6]"
          >
            {t('orders.confirmBooking')}
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
          <ClientPicker
            clients={clients}
            value={clientName}
            clientId={clientId}
            placeholder={t('orders.clientPh')}
            onChange={({ name, clientId: id, client }) => {
              setClientName(name)
              setClientId(id)
              if (client?.phone) setPhone(client.phone)
            }}
          />
        </Field>

        <Field label={t('common.phone')}>
          <input
            className="ob-input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            dir="ltr"
          />
        </Field>

        <Field label={t('orders.shootType')}>
          <select
            className="ob-input"
            value={shootType}
            onChange={(e) => setShootType(e.target.value)}
          >
            {SHOOT_TYPES.map((s) => (
              <option key={s} value={s}>
                {t(`orders.shoot.${s}`)}
              </option>
            ))}
          </select>
        </Field>

        {!isMultiDay && (
        <Field label={t('orders.package')}>
          <div className="flex flex-col gap-1.5">
            {pkgOptions.map((option) => {
              const on = pkg === option.key
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setPkg(option.key)}
                  className={`flex items-center gap-3 rounded-[13px] px-4 py-3 text-start transition-colors ${
                    on ? 'bg-ink text-bone' : 'bg-ink/5 text-ink hover:bg-ink/8'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                      on ? 'border-bone/70' : 'border-ink/25'
                    }`}
                  >
                    {on && <span className="h-1.5 w-1.5 rounded-full bg-bone" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-bold">{option.label}</span>
                    <span
                      className={`block text-[11.5px] font-semibold ${on ? 'text-bone/65' : 'text-ink/45'}`}
                    >
                      <span className="ob-ltr">{option.sub}</span>
                    </span>
                  </span>
                  <span className="ob-ltr text-[13px] font-extrabold">{option.price}</span>
                </button>
              )
            })}
          </div>
        </Field>
        )}

        <div className="flex gap-3">
          <Field label={isMultiDay ? t('orders.firstDay') : t('common.date')} className="flex-1">
            <input
              className="ob-input"
              type="date"
              value={date}
              onChange={(e) => {
                const next = e.target.value
                // Drag the end along so the range keeps its length.
                if (next && endDate >= date) {
                  setEndDate(addDays(next, days - 1))
                }
                setDate(next)
              }}
            />
          </Field>
          <Field label={t('orders.lastDay')} className="flex-1">
            <input
              className="ob-input"
              type="date"
              value={endDate}
              min={date}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>

        {/* Quick spans, because "three days" is how these get asked for. */}
        <div className="-mt-1 flex flex-wrap items-center gap-1.5">
          {[1, 2, 3, 5, 7].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setEndDate(addDays(date, n - 1))}
              data-on={days === n}
              className="ob-chip h-8 px-3 text-[11.5px]"
            >
              {n === 1 ? t('orders.oneDay') : `${n} ${t('orders.days')}`}
            </button>
          ))}
          {isMultiDay && (
            <span className="ob-ltr ms-auto text-[11.5px] font-bold text-ink/50">
              {days} × {egp(pricing.full_day_price)}
            </span>
          )}
        </div>

        {/*
          Start and end, the way people actually describe a booking — "eleven
          to four", not "eleven for five hours". The duration falls out of it.
          Both are selects, so on a phone this is two taps of the iOS wheel
          rather than a grid of 24 buttons.
        */}
        {isMultiDay ? (
          <div className="rounded-[14px] bg-ink/5 px-4 py-3.5">
            <div className="ob-label">{t('orders.multiDay')}</div>
            <p className="mt-1 text-[12.5px] font-semibold text-ink/60">
              {t('orders.multiDayHint')}
            </p>
          </div>
        ) : (
        <div className="flex gap-3">
          <Field label={t('orders.startTime')} className="flex-1">
            <select
              className="ob-input"
              value={startHour}
              onChange={(e) => setStartHour(Number(e.target.value))}
            >
              {startChoices.map((h) => {
                const taken = bookedHours.has(h)
                return (
                  <option key={h} value={h} disabled={taken}>
                    {formatHour(h)}
                    {taken ? ` — ${t('orders.taken')}` : ''}
                  </option>
                )
              })}
            </select>
          </Field>

          <Field label={t('orders.endTime')} className="flex-1">
            {pkg === 'hourly' ? (
              <select
                className="ob-input"
                value={endHour}
                onChange={(e) => setHours(Number(e.target.value) - startHour)}
              >
                {endChoices.map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
            ) : (
              /* A package fixes its own length, so this is the outcome, not a choice. */
              <div className="ob-input flex items-center justify-between bg-ink/5 text-ink/60">
                <span className="ob-ltr">{formatHour(endHour)}</span>
                <span className="ob-ltr text-[11.5px] font-bold">{resolvedHours}h</span>
              </div>
            )}
          </Field>
        </div>
        )}

        {(clash || (!fits && !isMultiDay)) && (
          <p className="-mt-2 text-[11.5px] font-semibold text-clay">
            {clash ? t('orders.overlap') : t('orders.pastClosing')}
          </p>
        )}

        {addonChoices.length > 0 && (
          <div className="rounded-[14px] border border-ink/10">
            <button
              type="button"
              onClick={() => setShowAddons((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start"
            >
              <span className="min-w-0">
                <span className="ob-label block">{t('orders.addOns')}</span>
                <span className="mt-0.5 block truncate text-[12.5px] font-semibold text-ink/60">
                  {addons.length === 0
                    ? t('orders.addOnsNone')
                    : `${addons.length} · ${egp(addonTotal)}`}
                </span>
              </span>
              <Icon
                name="chevronDown"
                size={16}
                className={`flex-shrink-0 text-ink/40 transition-transform ${showAddons ? 'rotate-180' : ''}`}
              />
            </button>

            {showAddons && (
              <div className="flex flex-wrap gap-1.5 border-t border-ink/8 px-4 py-3">
                {addonChoices.map((g) => {
                  const on = addons.includes(g.id)
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() =>
                        setAddons((prev) =>
                          prev.includes(g.id) ? prev.filter((x) => x !== g.id) : [...prev, g.id],
                        )
                      }
                      data-on={on}
                      className="ob-chip"
                    >
                      {g.name}
                      <span className={`ob-ltr text-[11px] ${on ? 'text-bone/70' : 'text-ink/40'}`}>
                        {egp(g.rate)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {showNotes ? (
          <Field label={t('common.notes')}>
            <textarea
              className="ob-input"
              rows={2}
              autoFocus
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        ) : (
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="self-start text-[12.5px] font-bold text-ink/50 hover:text-ink"
          >
            + {t('common.notes')}
          </button>
        )}

        <div className="rounded-[14px] bg-ink/6 px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] font-semibold text-ink/65">
              <span className="ob-ltr">
                {isMultiDay
                  ? `${days} ${t('orders.days')} · ${formatDateShort(date, lang)} – ${formatDateShort(endDate, lang)}`
                  : `${resolvedHours}h · ${formatHour(startHour)} – ${formatHour(startHour + resolvedHours)}`}
              </span>
            </span>
            <span className="text-end">
              <b className="ob-ltr text-[17px]">{egp(total)}</b>{' '}
              <span className="ob-ltr text-[11.5px] text-ink/50">{usd(total, studio.usd_rate)}</span>
            </span>
          </div>
          {addonTotal > 0 && (
            <div className="mt-1.5 flex justify-between text-[11.5px] font-semibold text-ink/50">
              <span>
                {t('orders.addOns')} · <span className="ob-ltr">{addons.length}</span>
              </span>
              <span className="ob-ltr">{egp(addonTotal)}</span>
            </div>
          )}
          <div className="mt-1.5 flex justify-between text-[11.5px] font-semibold text-ink/50">
            <span>
              {t('orders.deposit')} · <span className="ob-ltr">{pricing.deposit_pct}%</span>
            </span>
            <span className="ob-ltr">{egp(deposit)}</span>
          </div>
        </div>
      </div>
    </Modal>
  )
}
