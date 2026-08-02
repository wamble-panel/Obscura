'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useApp } from '../app-context'
import { useT } from '../lang-provider'
import { Field, Modal, Stepper, SubmitButton, useToast } from '../ui'
import { ClientPicker } from '../client-picker'
import { egp, formatHour, packageBase, packageHours, todayKey, usd } from '@/lib/format'
import { saveSession, type SessionInput } from '@/server/sessions'
import type { Client, Gear, SessionPackage, StudioSession } from '@/lib/types'

const SHOOT_TYPES = ['product', 'fashion', 'food', 'auto', 'other'] as const

export type BookingSeed = {
  date?: string
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
}: {
  open: boolean
  onClose: () => void
  gear: Gear[]
  clients: Client[]
  session?: StudioSession | null
  seed?: BookingSeed
}) {
  const t = useT()
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
  const [startHour, setStartHour] = useState(11)
  const [pkg, setPkg] = useState<SessionPackage>('half')
  const [hours, setHours] = useState(pricing.hourly_min_hours)
  const [addons, setAddons] = useState<string[]>([])
  const [notes, setNotes] = useState('')

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
      setStartHour(session.start_hour)
      setPkg(session.package)
      setHours(session.hours)
      setAddons((session.session_addons ?? []).map((a) => a.gear_id).filter(Boolean) as string[])
      setNotes(session.notes ?? '')
    } else {
      setClientName('')
      setClientId('')
      setPhone('')
      setShootType('product')
      setDate(seed?.date ?? todayKey())
      setStartHour(seed?.startHour ?? Math.max(studio.open_hour, 11))
      setPkg(seed?.package ?? 'half')
      setHours(seed?.hours ?? pricing.hourly_min_hours)
      setAddons([])
      setNotes('')
    }
  }, [open, session, seed, pricing.hourly_min_hours, studio.open_hour])

  const addonTotal = useMemo(
    () => gear.filter((g) => addons.includes(g.id)).reduce((sum, g) => sum + Number(g.rate), 0),
    [addons, gear],
  )

  const resolvedHours = packageHours(pkg, hours, pricing)
  const base = packageBase(pkg, hours, pricing)
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
            disabled={!clientName.trim() || !fits}
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
          <div className="flex flex-wrap gap-1.5">
            {SHOOT_TYPES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setShootType(s)}
                data-on={shootType === s}
                className="ob-chip flex-1"
              >
                {t(`orders.shoot.${s}`)}
              </button>
            ))}
          </div>
        </Field>

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

        <div className="flex gap-3">
          <Field label={t('common.date')} className="flex-[1.3]">
            <input
              className="ob-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          {pkg === 'hourly' && (
            <Field label={t('common.hours')} className="flex-1">
              <Stepper value={hours} onChange={setHours} min={pricing.hourly_min_hours} max={12} />
            </Field>
          )}
        </div>

        <Field
          label={t('orders.startTime')}
          error={!fits ? `Ends after closing (${formatHour(studio.close_hour)})` : undefined}
        >
          <div className="flex flex-wrap gap-1.5">
            {startChoices.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setStartHour(h)}
                data-on={startHour === h}
                className="ob-chip h-8 px-2.5 text-[11.5px]"
                style={{ opacity: h + resolvedHours <= studio.close_hour ? 1 : 0.35 }}
              >
                <span className="ob-ltr">{formatHour(h)}</span>
              </button>
            ))}
          </div>
        </Field>

        {addonChoices.length > 0 && (
          <Field label={t('orders.addOns')}>
            <div className="flex flex-wrap gap-1.5">
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
          </Field>
        )}

        <Field label={t('common.notes')}>
          <textarea
            className="ob-input"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <div className="rounded-[14px] bg-ink/6 px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] font-semibold text-ink/65">
              <span className="ob-ltr">
                {resolvedHours}h · {formatHour(startHour)} – {formatHour(startHour + resolvedHours)}
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
