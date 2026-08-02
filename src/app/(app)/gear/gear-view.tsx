'use client'

import { useMemo, useState, useTransition } from 'react'
import { useApp } from '@/components/app-context'
import { useT } from '@/components/lang-provider'
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
import { egp } from '@/lib/format'
import { deleteGear, saveGear, setGearStatus } from '@/server/gear'
import type { Gear, GearStatus, Rental } from '@/lib/types'

export const GEAR_CATEGORIES = [
  'Lighting',
  'Modifiers',
  'Cameras',
  'Lenses',
  'Accessories',
  'Grip',
  'Backdrops',
  'Props',
] as const

type Filter = 'all' | 'in' | 'out'

export function GearView({ gear, openRentals }: { gear: Gear[]; openRentals: Rental[] }) {
  const t = useT()
  const toast = useToast()
  const { can } = useApp()
  const [pending, start] = useTransition()

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Gear | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [category, setCategory] = useState<string>('Lighting')
  const [note, setNote] = useState('')
  const [qty, setQty] = useState(1)
  const [rate, setRate] = useState(300)
  const [serial, setSerial] = useState('')

  const rentalFor = (gearId: string) => openRentals.find((r) => r.gear_id === gearId)

  const statusLabel: Record<GearStatus, string> = {
    in: t('gear.inStudio'),
    out: t('gear.rented'),
    maint: t('gear.maint'),
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return gear
      .filter((g) => (filter === 'all' ? true : filter === 'in' ? g.status === 'in' : g.status !== 'in'))
      .filter((g) =>
        q ? g.name.toLowerCase().includes(q) || g.category.toLowerCase().includes(q) : true,
      )
  }, [gear, filter, query])

  const grouped = useMemo(() => {
    return GEAR_CATEGORIES.map((cat) => ({
      cat,
      items: filtered.filter((g) => g.category === cat),
    }))
      .concat([
        {
          cat: 'Other' as (typeof GEAR_CATEGORIES)[number],
          items: filtered.filter(
            (g) => !GEAR_CATEGORIES.includes(g.category as (typeof GEAR_CATEGORIES)[number]),
          ),
        },
      ])
      .filter((group) => group.items.length > 0)
  }, [filtered])

  const openForm = (item?: Gear) => {
    setError(null)
    setEditing(item ?? null)
    setName(item?.name ?? '')
    setCategory(item?.category ?? 'Lighting')
    setNote(item?.note ?? '')
    setQty(item?.qty ?? 1)
    setRate(Number(item?.rate ?? 300))
    setSerial(item?.serial ?? '')
    setFormOpen(true)
  }

  const submit = () => {
    setError(null)
    start(async () => {
      const result = await saveGear({
        id: editing?.id,
        name,
        category,
        note,
        qty,
        rate,
        serial,
      })
      if (result.ok) {
        toast(result.message ?? t('toast.saved'))
        setFormOpen(false)
        setDetailId(null)
      } else {
        setError(result.error ?? t('toast.error'))
      }
    })
  }

  const detail = gear.find((g) => g.id === detailId) ?? null
  const detailRental = detail ? rentalFor(detail.id) : undefined

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
        title={t('gear.title')}
        subtitle={t('gear.sub')}
        actions={
          can(PERMISSIONS.gearCreate) && (
            <button type="button" onClick={() => openForm()} className="ob-btn ob-btn-primary">
              <Icon name="plus" size={15} />
              {t('gear.new')}
            </button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label={t('common.all')} value={gear.length} icon="camera" />
        <StatCard
          label={t('gear.available')}
          value={gear.filter((g) => g.status === 'in').length}
          tone="good"
        />
        <StatCard
          label={t('rentals.out')}
          value={gear.filter((g) => g.status !== 'in').length}
          tone={gear.some((g) => g.status !== 'in') ? 'warn' : 'default'}
        />
      </div>

      <Card className="p-4 sm:p-5">
        <Toolbar>
          <SearchInput value={query} onChange={setQuery} />
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('common.all') },
              { value: 'in', label: t('gear.available') },
              { value: 'out', label: t('rentals.out') },
            ]}
          />
        </Toolbar>

        {grouped.length === 0 ? (
          <EmptyState icon="camera" title={t('gear.empty')} />
        ) : (
          <div className="flex flex-col gap-5">
            {grouped.map((group) => (
              <div key={group.cat}>
                <div className="ob-label mb-2">{group.cat}</div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((g) => {
                    const rental = rentalFor(g.id)
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setDetailId(g.id)}
                        className="flex items-center gap-3 rounded-[14px] border border-ink/8 bg-paper/50 px-3.5 py-3 text-start transition-colors hover:bg-paper"
                      >
                        <span
                          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-[11px] font-extrabold ${
                            g.status === 'in'
                              ? 'bg-ink/7 text-ink'
                              : g.status === 'out'
                                ? 'bg-clay/13 text-clay'
                                : 'bg-olive/15 text-olive'
                          }`}
                        >
                          <span className="ob-ltr">{g.qty}×</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-bold">{g.name}</span>
                          <span
                            className={`block truncate text-[11.5px] font-semibold ${
                              g.status === 'in' ? 'text-ink/45' : 'text-clay'
                            }`}
                          >
                            {g.status === 'out' && rental
                              ? `${statusLabel.out} · ${rental.renter_name}`
                              : (g.note || statusLabel[g.status])}
                          </span>
                        </span>
                        <span className="ob-ltr flex-shrink-0 text-[12.5px] font-extrabold">
                          {egp(g.rate)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
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
              {can(PERMISSIONS.gearEdit) && (
                <button
                  type="button"
                  onClick={() => openForm(detail)}
                  className="ob-btn ob-btn-ghost flex-1"
                >
                  <Icon name="edit" size={15} />
                  {t('common.edit')}
                </button>
              )}
              {can(PERMISSIONS.gearDelete) && (
                <ConfirmButton
                  onConfirm={() => run(() => deleteGear(detail.id), true)}
                  disabled={pending}
                  className="flex-1"
                >
                  <Icon name="trash" size={15} />
                  {t('common.delete')}
                </ConfirmButton>
              )}
            </>
          )
        }
      >
        {detail && (
          <>
            <div className="ob-label">{detail.category}</div>
            <div className="mt-1 text-[21px] font-extrabold tracking-[-0.4px]">{detail.name}</div>
            {detail.note && (
              <div className="mt-0.5 text-[12.5px] font-semibold text-ink/55">{detail.note}</div>
            )}

            <div className="mt-4">
              <Badge
                tone={detail.status === 'in' ? 'good' : detail.status === 'out' ? 'warn' : 'gold'}
              >
                {statusLabel[detail.status]}
              </Badge>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <div className="ob-tile px-3.5 py-3">
                <div className="ob-label">{t('common.qty')}</div>
                <div className="ob-ltr mt-0.5 text-[16px] font-extrabold">{detail.qty}</div>
              </div>
              <div className="ob-tile px-3.5 py-3">
                <div className="ob-label">{t('gear.ratePerSession')}</div>
                <div className="ob-ltr mt-0.5 text-[16px] font-extrabold">{egp(detail.rate)}</div>
              </div>
            </div>

            {detail.serial && (
              <div className="mt-2.5 ob-tile px-3.5 py-3">
                <div className="ob-label">{t('gear.serial')}</div>
                <div className="ob-ltr mt-0.5 font-mono text-[13px] font-bold">{detail.serial}</div>
              </div>
            )}

            {detailRental && (
              <div className="mt-4 rounded-[14px] border border-clay/25 bg-clay/6 px-4 py-3.5">
                <div className="ob-label text-clay">{t('rentals.active')}</div>
                <div className="mt-1 text-[14px] font-extrabold">{detailRental.renter_name}</div>
                <div className="ob-ltr mt-0.5 text-[12px] font-semibold text-ink/55">
                  {t('rentals.due')} · {detailRental.due_date}
                </div>
              </div>
            )}

            {can(PERMISSIONS.gearEdit) && !detailRental && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => setGearStatus(detail.id, detail.status === 'maint' ? 'in' : 'maint'))
                }
                className="ob-btn ob-btn-ghost mt-4 h-11 w-full"
              >
                {detail.status === 'maint' ? t('gear.markReady') : t('gear.markMaint')}
              </button>
            )}
          </>
        )}
      </Drawer>

      {/* ------------------------------ add / edit ------------------------------ */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? t('common.edit') : t('gear.new')}
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
              disabled={!name.trim()}
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
          <Field label={t('common.name')}>
            <input
              className="ob-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('gear.namePh')}
            />
          </Field>
          <Field label={t('common.category')}>
            <div className="flex flex-wrap gap-1.5">
              {GEAR_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  data-on={category === c}
                  className="ob-chip"
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('common.notes')}>
            <input className="ob-input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex gap-3">
            <Field label={t('common.qty')} className="flex-1">
              <Stepper value={qty} onChange={setQty} min={0} max={50} />
            </Field>
            <Field label={t('gear.ratePerSession')} className="flex-1">
              <input
                className="ob-input"
                type="number"
                inputMode="numeric"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value) || 0)}
                dir="ltr"
              />
            </Field>
          </div>
          <Field label={t('gear.serial')} hint={t('common.optional')}>
            <input
              className="ob-input"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              dir="ltr"
            />
          </Field>
        </div>
      </Modal>
    </>
  )
}
