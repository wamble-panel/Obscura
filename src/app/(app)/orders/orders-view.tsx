'use client'

import { useMemo, useState } from 'react'
import { useApp } from '@/components/app-context'
import { useLang, useT } from '@/components/lang-provider'
import {
  Badge,
  Card,
  Cell,
  DataTable,
  EmptyState,
  PageHeader,
  Row,
  SearchInput,
  Segmented,
  StatCard,
  Toolbar,
} from '@/components/ui'
import { Icon } from '@/components/icons'
import { BookingModal } from '@/components/orders/booking-modal'
import { SessionDrawer } from '@/components/orders/session-drawer'
import { PERMISSIONS } from '@/lib/permissions'
import { dayCount, egp, formatDate, formatHour, toCsv } from '@/lib/format'
import type { Client, Gear, SessionStatus, StudioSession } from '@/lib/types'

type Filter = 'upcoming' | 'all' | SessionStatus

export function OrdersView({
  sessions,
  gear,
  clients,
}: {
  sessions: StudioSession[]
  gear: Gear[]
  clients: Client[]
}) {
  const t = useT()
  const { lang } = useLang()
  const { can } = useApp()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('upcoming')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<StudioSession | null>(null)
  const [drawerId, setDrawerId] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sessions
      .filter((s) => {
        if (filter === 'upcoming') return (s.end_date ?? s.date) >= today && s.status !== 'cancelled'
        if (filter !== 'all') return s.status === filter
        return true
      })
      .filter((s) =>
        q
          ? s.client_name.toLowerCase().includes(q) ||
            s.code.toLowerCase().includes(q) ||
            (s.phone ?? '').includes(q)
          : true,
      )
      .sort((a, b) => (a.date === b.date ? a.start_hour - b.start_hour : a.date < b.date ? 1 : -1))
  }, [sessions, filter, query, today])

  const stats = useMemo(() => {
    const active = sessions.filter((s) => s.status !== 'cancelled')
    const upcoming = active.filter((s) => (s.end_date ?? s.date) >= today)
    const unpaid = active.filter((s) => !s.deposit_paid && (s.end_date ?? s.date) >= today)
    return {
      total: active.length,
      upcoming: upcoming.length,
      revenue: active.reduce((sum, s) => sum + Number(s.total_amount), 0),
      unpaid: unpaid.reduce((sum, s) => sum + Number(s.deposit_amount), 0),
    }
  }, [sessions, today])

  const exportCsv = () => {
    const csv = toCsv(
      filtered.map((s) => ({
        code: s.code,
        client: s.client_name,
        phone: s.phone ?? '',
        date: s.date,
        end_date: s.end_date,
        days: dayCount(s.date, s.end_date),
        start: formatHour(s.start_hour),
        hours: s.hours,
        package: s.package,
        total: s.total_amount,
        deposit_paid: s.deposit_paid ? 'yes' : 'no',
        status: s.status,
      })),
    )
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `obscura-orders-${today}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const tones: Record<SessionStatus, 'neutral' | 'ink' | 'good' | 'warn'> = {
    pending: 'warn',
    confirmed: 'ink',
    completed: 'good',
    cancelled: 'neutral',
  }

  return (
    <>
      <PageHeader
        title={t('orders.title')}
        subtitle={t('orders.sub')}
        actions={
          <>
            <button type="button" onClick={exportCsv} className="ob-btn ob-btn-ghost">
              <Icon name="download" size={15} />
              <span className="hidden sm:inline">{t('common.export')}</span>
            </button>
            {can(PERMISSIONS.ordersCreate) && (
              <button
                type="button"
                onClick={() => {
                  setEditing(null)
                  setModalOpen(true)
                }}
                className="ob-btn ob-btn-primary"
              >
                <Icon name="plus" size={15} />
                {t('orders.new')}
              </button>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('clients.sessions')} value={stats.total} icon="receipt" />
        <StatCard label={t('dash.upcoming')} value={stats.upcoming} icon="calendar" />
        <StatCard label={t('common.total')} value={egp(stats.revenue)} icon="wallet" />
        <StatCard
          label={t('orders.deposit')}
          value={egp(stats.unpaid)}
          sub={t('orders.pending')}
          tone={stats.unpaid > 0 ? 'warn' : 'default'}
          icon="alert"
        />
      </div>

      <Card padded={false} className="p-4 sm:p-5">
        <Toolbar>
          <SearchInput value={query} onChange={setQuery} />
          <div className="ob-scroll-x">
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'upcoming', label: t('dash.upcoming') },
                { value: 'pending', label: t('orders.pending') },
                { value: 'confirmed', label: t('orders.confirmed') },
                { value: 'completed', label: t('orders.completed') },
                { value: 'all', label: t('common.all') },
              ]}
            />
          </div>
        </Toolbar>

        {filtered.length === 0 ? (
          <EmptyState icon="receipt" title={t('orders.empty')} />
        ) : (
          <>
            {/* Table on wide screens */}
            <div className="hidden md:block">
              <DataTable
                head={[
                  t('orders.code'),
                  t('common.client'),
                  t('common.date'),
                  t('common.time'),
                  t('common.total'),
                  t('common.status'),
                ]}
              >
                {filtered.map((s) => (
                  <Row key={s.id} onClick={() => setDrawerId(s.id)}>
                    <Cell className="ob-ltr font-mono text-[12px] text-ink/50">{s.code}</Cell>
                    <Cell bold>{s.client_name}</Cell>
                    <Cell>
                      {formatDate(s.date, lang, 'short')}
                      {dayCount(s.date, s.end_date) > 1 && (
                        <span className="text-ink/45"> – {formatDate(s.end_date, lang, 'short')}</span>
                      )}
                    </Cell>
                    <Cell className="ob-ltr text-ink/60">
                      {dayCount(s.date, s.end_date) > 1
                        ? `${dayCount(s.date, s.end_date)} ${t('orders.days')}`
                        : `${formatHour(s.start_hour)} · ${s.hours}h`}
                    </Cell>
                    <Cell bold className="ob-ltr">
                      {egp(s.total_amount)}
                    </Cell>
                    <Cell>
                      <Badge tone={tones[s.status]}>{t(`orders.${s.status}`)}</Badge>
                    </Cell>
                  </Row>
                ))}
              </DataTable>
            </div>

            {/* Cards on phones */}
            <div className="flex flex-col gap-2 md:hidden">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setDrawerId(s.id)}
                  className="flex items-center justify-between gap-3 rounded-[14px] border border-ink/8 px-3.5 py-3 text-start"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-extrabold">{s.client_name}</div>
                    <div className="ob-ltr mt-0.5 text-[11.5px] font-semibold text-ink/50">
                      {dayCount(s.date, s.end_date) > 1
                        ? `${formatDate(s.date, lang, 'short')} – ${formatDate(s.end_date, lang, 'short')}`
                        : `${formatDate(s.date, lang, 'short')} · ${formatHour(s.start_hour)}`}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <span className="ob-ltr text-[13px] font-extrabold">{egp(s.total_amount)}</span>
                    <Badge tone={tones[s.status]}>{t(`orders.${s.status}`)}</Badge>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </Card>

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
      />

      <SessionDrawer
        session={sessions.find((s) => s.id === drawerId) ?? null}
        onClose={() => setDrawerId(null)}
        onEdit={(s) => {
          setDrawerId(null)
          setEditing(s)
          setModalOpen(true)
        }}
      />
    </>
  )
}
