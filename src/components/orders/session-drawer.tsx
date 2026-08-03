'use client'

import { useTransition } from 'react'
import { useApp } from '../app-context'
import { useT } from '../lang-provider'
import { Badge, ConfirmButton, Drawer, useToast } from '../ui'
import { Icon } from '../icons'
import { dayCount, egp, formatDate, formatHour, usd } from '@/lib/format'
import { PERMISSIONS } from '@/lib/permissions'
import { deleteSession, setDepositPaid, setSessionStatus } from '@/server/sessions'
import { useLang } from '../lang-provider'
import type { SessionStatus, StudioSession } from '@/lib/types'

const STATUS_TONE: Record<SessionStatus, 'neutral' | 'ink' | 'good' | 'warn'> = {
  pending: 'warn',
  confirmed: 'ink',
  completed: 'good',
  cancelled: 'neutral',
}

export function SessionDrawer({
  session,
  onClose,
  onEdit,
}: {
  session: StudioSession | null
  onClose: () => void
  onEdit?: (session: StudioSession) => void
}) {
  const t = useT()
  const { lang } = useLang()
  const toast = useToast()
  const { can, settings } = useApp()
  const [pending, start] = useTransition()

  if (!session) return null

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, close = false) =>
    start(async () => {
      const result = await fn()
      toast(result.ok ? (result.message ?? t('toast.saved')) : (result.error ?? t('toast.error')), result.ok ? 'ok' : 'error')
      if (result.ok && close) onClose()
    })

  const days = dayCount(session.date, session.end_date)

  const rows: [string, string][] = [
    days > 1
      ? [
          t('orders.dayRange'),
          `${formatDate(session.date, lang, 'short')} – ${formatDate(session.end_date, lang, 'short')}`,
        ]
      : [t('common.date'), formatDate(session.date, lang)],
    days > 1
      ? [t('orders.duration'), `${days} ${t('orders.days')}`]
      : [
          t('common.time'),
          formatHour(session.start_hour) + ' – ' + formatHour(session.start_hour + session.hours),
        ],
    ...(days > 1 ? [] : ([[t('orders.duration'), `${session.hours}h`]] as [string, string][])),
    [
      t('orders.package'),
      session.package === 'hourly'
        ? t('orders.hourly')
        : session.package === 'half'
          ? t('orders.half')
          : t('orders.full'),
    ],
  ]

  return (
    <Drawer
      open={Boolean(session)}
      onClose={onClose}
      title={t('orders.details')}
      footer={
        <>
          {can(PERMISSIONS.ordersEdit) && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(session)}
              className="ob-btn ob-btn-ghost flex-1"
            >
              <Icon name="edit" size={15} />
              {t('common.edit')}
            </button>
          )}
          {can(PERMISSIONS.ordersDelete) && (
            <ConfirmButton
              onConfirm={() => run(() => deleteSession(session.id), true)}
              disabled={pending}
              className="flex-1"
            >
              <Icon name="trash" size={15} />
              {t('common.delete')}
            </ConfirmButton>
          )}
        </>
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[21px] font-extrabold tracking-[-0.4px]">{session.client_name}</div>
          <div className="mt-0.5 text-[12.5px] font-semibold text-ink/55">
            {t(`orders.shoot.${session.shoot_type}`, session.shoot_type)} ·{' '}
            <span className="ob-ltr">{session.code}</span>
          </div>
        </div>
        <Badge tone={STATUS_TONE[session.status]}>{t(`orders.${session.status}`)}</Badge>
      </div>

      {session.phone && (
        <a
          href={`tel:${session.phone}`}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-ink/5 px-3.5 py-2.5 text-[13px] font-bold"
        >
          <Icon name="phone" size={15} />
          <span className="ob-ltr">{session.phone}</span>
        </a>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {rows.map(([label, value]) => (
          <div key={label} className="ob-tile px-3.5 py-3">
            <div className="ob-label">{label}</div>
            <div className="mt-0.5 text-[14px] font-extrabold">
              <span className="ob-ltr">{value}</span>
            </div>
          </div>
        ))}
      </div>

      {(session.session_addons ?? []).length > 0 && (
        <div className="mt-4">
          <div className="ob-label mb-2">{t('orders.addOns')}</div>
          <div className="flex flex-col gap-1.5">
            {session.session_addons!.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-xl border border-ink/10 px-3.5 py-2.5 text-[13px]"
              >
                <span className="font-semibold">{a.name}</span>
                <span className="ob-ltr font-bold">{egp(a.price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-[14px] border border-ink/10 px-4">
        <div className="flex justify-between border-b border-ink/7 py-3 text-[13px]">
          <span className="font-semibold text-ink/65">{t('orders.package')}</span>
          <b className="ob-ltr">{egp(session.base_amount)}</b>
        </div>
        {Number(session.addons_amount) > 0 && (
          <div className="flex justify-between border-b border-ink/7 py-3 text-[13px]">
            <span className="font-semibold text-ink/65">{t('orders.addOns')}</span>
            <b className="ob-ltr">{egp(session.addons_amount)}</b>
          </div>
        )}
        <div className="flex justify-between py-3 text-[13px]">
          <span className="font-semibold text-ink/65">{t('orders.deposit')}</span>
          <b className="ob-ltr">{egp(session.deposit_amount)}</b>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-[15px] bg-ink px-4 py-4 text-sand">
        <span className="text-[13.5px] font-bold">{t('common.total')}</span>
        <span>
          <b className="ob-ltr text-[18px]">{egp(session.total_amount)}</b>{' '}
          <span className="ob-ltr text-[12px] opacity-70">
            {usd(session.total_amount, settings.studio.usd_rate)}
          </span>
        </span>
      </div>

      {can(PERMISSIONS.ordersEdit) && (
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={pending || session.deposit_paid}
            onClick={() => run(() => setDepositPaid(session.id, true))}
            className={`ob-btn h-11 w-full ${
              session.deposit_paid ? 'bg-ink/8 text-ink/45' : 'ob-btn-primary'
            }`}
          >
            <Icon name={session.deposit_paid ? 'check' : 'wallet'} size={15} />
            {session.deposit_paid ? t('orders.depositPaid') : t('orders.markPaid')}
          </button>

          {session.status !== 'completed' && session.status !== 'cancelled' && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => setSessionStatus(session.id, 'completed'))}
              className="ob-btn ob-btn-ghost h-11 w-full"
            >
              {t('orders.markCompleted')}
            </button>
          )}

          {session.status !== 'cancelled' && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => setSessionStatus(session.id, 'cancelled'), true)}
              className="ob-btn ob-btn-ghost h-11 w-full text-clay"
            >
              {t('orders.cancelBooking')}
            </button>
          )}
        </div>
      )}
    </Drawer>
  )
}
