'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useIsPhone } from '@/lib/use-media'
import { useRouter } from 'next/navigation'
import { useApp } from '@/components/app-context'
import { useLang, useT } from '@/components/lang-provider'
import { Badge, Card, EmptyState, PageHeader, Segmented } from '@/components/ui'
import { Icon } from '@/components/icons'
import { BookingModal, type BookingSeed } from '@/components/orders/booking-modal'
import { SessionDrawer } from '@/components/orders/session-drawer'
import { PERMISSIONS } from '@/lib/permissions'
import { MONTHS, WEEKDAYS_MIN } from '@/lib/i18n'
import { dateKey, egp, formatDate, formatHour, pad, todayKey } from '@/lib/format'
import type { Client, Gear, StudioSession } from '@/lib/types'

const ROW_HEIGHT = 40

export function CalendarView({
  sessions,
  gear,
  clients,
  year,
  month,
}: {
  sessions: StudioSession[]
  gear: Gear[]
  clients: Client[]
  year: number
  month: number
}) {
  const t = useT()
  const { lang } = useLang()
  const router = useRouter()
  const { can, settings } = useApp()
  const { studio } = settings

  const today = todayKey()
  const [selected, setSelected] = useState<string>(() => {
    const first = `${year}-${pad(month + 1)}-01`
    return today >= first && today <= `${year}-${pad(month + 1)}-31` ? today : first
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<StudioSession | null>(null)
  const [seed, setSeed] = useState<BookingSeed | undefined>()
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const isPhone = useIsPhone()
  // On a phone the 24-hour grid is most of the screen, and the day's bookings
  // were listed twice. Default to the list; the grid is a tap away when you
  // actually need to see gaps.
  const [dayView, setDayView] = useState<'list' | 'grid'>('list')
  const showGrid = !isPhone || dayView === 'grid'

  // Drag-to-select across the hour column
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef<number | null>(null)
  const [dragEnd, setDragEnd] = useState<number | null>(null)

  // The studio runs around the clock, so the day is 24 rows tall. Scroll to
  // where the day actually starts rather than parking on an empty 3am.
  const timelineRef = useRef<HTMLDivElement>(null)
  const [nowOffset, setNowOffset] = useState(0)


  const canCreate = can(PERMISSIONS.ordersCreate)

  const byDate = useMemo(() => {
    const map = new Map<string, StudioSession[]>()
    for (const s of sessions) {
      if (s.status === 'cancelled') continue
      const list = map.get(s.date) ?? []
      list.push(s)
      map.set(s.date, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.start_hour - b.start_hour)
    return map
  }, [sessions])

  /** Per-day totals so the month grid can show how busy each day is at a glance. */
  const dayLoad = useMemo(() => {
    const map = new Map<string, { count: number; hours: number; unpaid: boolean }>()
    for (const [date, list] of byDate) {
      map.set(date, {
        count: list.length,
        hours: list.reduce((sum, s) => sum + s.hours, 0),
        unpaid: list.some((s) => !s.deposit_paid),
      })
    }
    return map
  }, [byDate])

  useEffect(() => {
    const el = timelineRef.current
    if (!el) return
    const list = byDate.get(selected) ?? []
    const focusHour =
      list.length > 0
        ? Math.min(...list.map((s) => s.start_hour))
        : selected === today
          ? new Date().getHours()
          : 9
    const top = Math.max(0, (focusHour - studio.open_hour) * ROW_HEIGHT - ROW_HEIGHT)
    el.scrollTo({ top, behavior: 'smooth' })
  }, [selected, byDate, studio.open_hour, today])

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setNowOffset((now.getHours() - studio.open_hour + now.getMinutes() / 60) * ROW_HEIGHT)
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [studio.open_hour])

  const daySessions = byDate.get(selected) ?? []
  const dayHours = daySessions.reduce((sum, s) => sum + s.hours, 0)
  const dayRevenue = daySessions.reduce((sum, s) => sum + Number(s.total_amount), 0)
  const openHours = studio.close_hour - studio.open_hour

  const cells = useMemo(() => {
    const first = new Date(year, month, 1, 12)
    const offset = first.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const list: { key: string | null; day: number | null }[] = []
    for (let i = 0; i < offset; i++) list.push({ key: null, day: null })
    for (let d = 1; d <= daysInMonth; d++) {
      list.push({ key: `${year}-${pad(month + 1)}-${pad(d)}`, day: d })
    }
    return list
  }, [year, month])

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
    router.push(`/calendar?y=${y}&m=${m}`)
  }

  const monthSessions = sessions.filter((s) => s.status !== 'cancelled')
  const monthRevenue = monthSessions.reduce((sum, s) => sum + Number(s.total_amount), 0)

  const hourRows = useMemo(() => {
    const list: number[] = []
    for (let h = studio.open_hour; h < studio.close_hour; h++) list.push(h)
    return list
  }, [studio.open_hour, studio.close_hour])

  const finishDrag = () => {
    if (!dragging || dragStart.current === null) {
      setDragging(false)
      return
    }
    const a = Math.min(dragStart.current, dragEnd ?? dragStart.current)
    const b = Math.max(dragStart.current, dragEnd ?? dragStart.current)
    const hours = b - a + 1
    setDragging(false)
    dragStart.current = null
    setDragEnd(null)

    if (!canCreate) return
    setEditing(null)
    setSeed({
      date: selected,
      startHour: a,
      hours,
      package:
        hours >= settings.pricing.full_day_hours
          ? 'full'
          : hours >= settings.pricing.half_day_hours
            ? 'half'
            : 'hourly',
    })
    setModalOpen(true)
  }

  const selection =
    dragging && dragStart.current !== null
      ? {
          from: Math.min(dragStart.current, dragEnd ?? dragStart.current),
          to: Math.max(dragStart.current, dragEnd ?? dragStart.current),
        }
      : null

  return (
    <>
      <PageHeader
        title={t('cal.title')}
        subtitle={t('cal.sub')}
        actions={
          canCreate && (
            <button
              type="button"
              onClick={() => {
                setEditing(null)
                setSeed({ date: selected })
                setModalOpen(true)
              }}
              className="ob-btn ob-btn-primary"
            >
              <Icon name="plus" size={15} />
              {t('orders.book')}
            </button>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {/* ------------------------------ day timeline ------------------------------ */}
        <Card className="order-2 lg:order-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[16px] font-extrabold tracking-[-0.2px]">
                {formatDate(selected, lang)}
              </div>
              <div className="mt-0.5 text-[12px] font-medium text-ink/55">
                <span className="ob-ltr">{dayHours}h</span> {t('cal.dayUsage')} ·{' '}
                <span className="ob-ltr">{Math.max(0, openHours - dayHours)}h</span>{' '}
                {t('cal.free')}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="ob-ltr rounded-full bg-ink/6 px-3 py-1.5 text-[12px] font-bold">
                {egp(dayRevenue)}
              </div>
              {isPhone && (
                <Segmented<'list' | 'grid'>
                  value={dayView}
                  onChange={setDayView}
                  options={[
                    { value: 'list', label: t('cal.list') },
                    { value: 'grid', label: t('cal.hours') },
                  ]}
                />
              )}
            </div>
          </div>

          {showGrid ? (
          <div
            ref={timelineRef}
            data-no-pull
            className="ob-scroll-y relative mt-4 max-h-[46vh] overflow-y-auto sm:max-h-[62vh] lg:max-h-[560px]"
          >
          <div
            className="relative select-none"
            onMouseLeave={() => dragging && finishDrag()}
            onMouseUp={finishDrag}
          >
            {hourRows.map((h) => (
              <div
                key={h}
                onMouseDown={() => {
                  if (!canCreate) return
                  dragStart.current = h
                  setDragEnd(h)
                  setDragging(true)
                }}
                onMouseEnter={() => dragging && setDragEnd(h)}
                className={`flex items-stretch ${canCreate ? 'cursor-pointer' : ''}`}
                style={{ height: ROW_HEIGHT }}
              >
                <div className="w-[62px] flex-shrink-0 pt-px text-[11px] font-semibold text-ink/40">
                  <span className="ob-ltr">{formatHour(h)}</span>
                </div>
                <div className="flex-1 border-t border-ink/7" />
              </div>
            ))}

            {selection && (
              <div
                className="pointer-events-none absolute rounded-xl border-[1.5px] border-dashed border-ink/50 bg-ink/7 ltr:left-[62px] ltr:right-0 rtl:right-[62px] rtl:left-0"
                style={{
                  top: (selection.from - studio.open_hour) * ROW_HEIGHT,
                  height: (selection.to - selection.from + 1) * ROW_HEIGHT - 5,
                }}
              />
            )}

            {daySessions.map((s) => {
              const top = (s.start_hour - studio.open_hour) * ROW_HEIGHT
              const height = s.hours * ROW_HEIGHT - 5
              return (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => setDrawerId(s.id)}
                  className="absolute flex flex-col justify-center overflow-hidden rounded-xl bg-ink/12 px-3 py-2 text-start ltr:left-[62px] ltr:right-0 ltr:border-l-[3px] rtl:right-[62px] rtl:left-0 rtl:border-r-[3px] border-ink transition-colors hover:bg-ink/18"
                  style={{ top, height }}
                >
                  <span className="truncate text-[13px] font-extrabold">{s.client_name}</span>
                  <span className="ob-ltr truncate text-[11px] font-semibold text-ink/60">
                    {formatHour(s.start_hour)} – {formatHour(s.start_hour + s.hours)} ·{' '}
                    {egp(s.total_amount)}
                  </span>
                  {!s.deposit_paid && (
                    <span className="absolute top-2 text-[9.5px] font-bold text-clay ltr:right-2 rtl:left-2">
                      {t('orders.pending')}
                    </span>
                  )}
                </button>
              )
            })}

            {/* where we are in the day, on today only */}
            {selected === today && (
              <div
                aria-hidden
                className="pointer-events-none absolute z-10 ltr:left-[54px] ltr:right-0 rtl:right-[54px] rtl:left-0"
                style={{ top: nowOffset }}
              >
                <div className="relative h-px bg-clay">
                  <span className="absolute -top-1 h-2 w-2 rounded-full bg-clay ltr:-left-1 rtl:-right-1" />
                </div>
              </div>
            )}
          </div>
          </div>
          ) : (
            /* Phone default: just what is booked, tappable, no dead hours. */
            <div className="mt-4 flex flex-col gap-2">
              {daySessions.length === 0 ? (
                <EmptyState
                  icon="calendar"
                  title={t('orders.empty')}
                  action={
                    canCreate ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(null)
                          setSeed({ date: selected })
                          setModalOpen(true)
                        }}
                        className="ob-btn ob-btn-primary"
                      >
                        <Icon name="plus" size={15} />
                        {t('orders.book')}
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                daySessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setDrawerId(s.id)}
                    className="flex items-center gap-3 rounded-[14px] border border-ink/8 bg-paper/60 px-3.5 py-3 text-start"
                  >
                    <span className="ob-ltr flex w-[58px] flex-shrink-0 flex-col items-center rounded-[10px] bg-ink/6 px-1 py-1.5">
                      <span className="text-[12.5px] font-extrabold leading-none">
                        {formatHour(s.start_hour).replace(':00', '')}
                      </span>
                      <span className="mt-0.5 text-[9.5px] font-bold text-ink/45">{s.hours}h</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-extrabold">
                        {s.client_name}
                      </span>
                      <span className="ob-ltr block truncate text-[11.5px] font-semibold text-ink/50">
                        {formatHour(s.start_hour)} – {formatHour(s.start_hour + s.hours)}
                      </span>
                    </span>
                    <span className="flex flex-shrink-0 flex-col items-end gap-1">
                      <span className="ob-ltr text-[13px] font-extrabold">
                        {egp(s.total_amount)}
                      </span>
                      <Badge tone={s.deposit_paid ? 'ink' : 'warn'}>
                        {s.deposit_paid ? t('orders.confirmed') : t('orders.pending')}
                      </Badge>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {canCreate && (
            <p className="mt-3.5 hidden text-[11.5px] font-medium text-ink/45 lg:block">
              {t('orders.dragHint')}
            </p>
          )}
        </Card>

        {/* ------------------------------ month grid ------------------------------ */}
        <div className="order-1 flex flex-col gap-4 lg:order-2">
          <Card>
            <div className="mb-3.5 flex items-center justify-between gap-2">
              <div className="text-[15px] font-extrabold tracking-[-0.2px]">
                {MONTHS[lang][month]} <span className="ob-ltr">{year}</span>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => goMonth(-1)}
                  className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-ink/12"
                  aria-label="previous month"
                >
                  <Icon name="chevronLeft" size={16} className="rtl:rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date()
                    setSelected(dateKey(now))
                    router.push(`/calendar?y=${now.getFullYear()}&m=${now.getMonth()}`)
                  }}
                  className="h-8 rounded-[9px] border border-ink/12 px-3 text-[12.5px] font-bold"
                >
                  {t('common.today')}
                </button>
                <button
                  type="button"
                  onClick={() => goMonth(1)}
                  className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-ink/12"
                  aria-label="next month"
                >
                  <Icon name="chevronRight" size={16} className="rtl:rotate-180" />
                </button>
              </div>
            </div>

            <div className="mb-1.5 grid grid-cols-7 gap-1">
              {WEEKDAYS_MIN[lang].map((w, i) => (
                <div
                  key={i}
                  className="text-center text-[10.5px] font-bold uppercase text-ink/35"
                >
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, i) => {
                if (!cell.key) return <div key={i} />
                const active = cell.key === selected
                const isToday = cell.key === today
                const load = dayLoad.get(cell.key)
                // One dot per session, up to three, then "+" for anything beyond.
                const dots = Math.min(load?.count ?? 0, 3)
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => setSelected(cell.key!)}
                    title={
                      load
                        ? `${load.count} session${load.count > 1 ? 's' : ''} · ${load.hours}h`
                        : undefined
                    }
                    className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl text-[13.5px] transition-colors ${
                      active
                        ? 'bg-ink font-extrabold text-bone'
                        : isToday
                          ? 'bg-ink/10 font-extrabold'
                          : 'font-semibold hover:bg-ink/6'
                    }`}
                  >
                    <span className="ob-ltr leading-none">{cell.day}</span>

                    {/* how many bookings */}
                    <span className="flex h-1.5 items-center gap-[2px]">
                      {Array.from({ length: dots }).map((_, d) => (
                        <span
                          key={d}
                          className="h-1 w-1 rounded-full"
                          style={{
                            background: active
                              ? 'rgba(242,240,233,.9)'
                              : load?.unpaid
                                ? '#C4643F'
                                : '#B29A6E',
                          }}
                        />
                      ))}
                      {(load?.count ?? 0) > 3 && (
                        <span
                          className="text-[8px] font-extrabold leading-none"
                          style={{ color: active ? 'rgba(242,240,233,.9)' : '#B29A6E' }}
                        >
                          +
                        </span>
                      )}
                    </span>

                    {/* how many hours */}
                    <span
                      className={`ob-ltr text-[8.5px] font-bold leading-none ${
                        active ? 'text-bone/70' : 'text-ink/40'
                      }`}
                    >
                      {load ? `${load.hours}h` : ' '}
                    </span>
                  </button>
                )
              })}
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[18px] border border-ink/8 bg-paper/86 p-4 shadow-soft">
              <div className="text-[11.5px] font-semibold text-ink/50">{t('dash.monthRevenue')}</div>
              <div className="ob-ltr mt-1 text-[20px] font-extrabold tracking-[-0.5px]">
                {egp(monthRevenue)}
              </div>
            </div>
            <div className="rounded-[18px] border border-ink/8 bg-paper/86 p-4 shadow-soft">
              <div className="text-[11.5px] font-semibold text-ink/50">{t('clients.sessions')}</div>
              <div className="ob-ltr mt-1 text-[20px] font-extrabold tracking-[-0.5px]">
                {monthSessions.length}
              </div>
            </div>
          </div>

          <Card className="hidden lg:block">
            <div className="mb-3 text-[13.5px] font-extrabold">{t('dash.todaySessions')}</div>
            {daySessions.length === 0 ? (
              <EmptyState
                icon="calendar"
                title={t('orders.empty')}
                body={canCreate ? t('orders.dragHint') : undefined}
              />
            ) : (
              <div className="flex flex-col gap-2">
                {daySessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setDrawerId(s.id)}
                    className="flex items-center justify-between gap-3 rounded-[14px] border border-ink/8 px-3.5 py-3 text-start transition-colors hover:bg-ink/4"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-extrabold">{s.client_name}</div>
                      <div className="ob-ltr mt-0.5 text-[11.5px] font-semibold text-ink/50">
                        {formatHour(s.start_hour)} – {formatHour(s.start_hour + s.hours)}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1">
                      <span className="ob-ltr text-[13px] font-extrabold">
                        {egp(s.total_amount)}
                      </span>
                      <Badge tone={s.deposit_paid ? 'ink' : 'warn'}>
                        {s.deposit_paid ? t('orders.confirmed') : t('orders.pending')}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <BookingModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditing(null)
        }}
        gear={gear}
        clients={clients}
        sessions={sessions}
        session={editing}
        seed={seed}
      />

      <SessionDrawer
        session={sessions.find((s) => s.id === drawerId) ?? null}
        onClose={() => setDrawerId(null)}
        onEdit={(s) => {
          setDrawerId(null)
          setEditing(s)
          setSeed(undefined)
          setModalOpen(true)
        }}
      />
    </>
  )
}
