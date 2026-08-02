'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useApp } from '@/components/app-context'
import { useLang, useT } from '@/components/lang-provider'
import { Card, Field, PageHeader, SubmitButton, useToast } from '@/components/ui'
import { Icon } from '@/components/icons'
import { PERMISSIONS } from '@/lib/permissions'
import { timeAgo } from '@/lib/format'
import { pingDatabase, saveSettings } from '@/server/settings'
import type { PricingSettings, StudioSettings, TermsSettings } from '@/lib/types'

export function SettingsView({
  studio: initialStudio,
  pricing: initialPricing,
  terms: initialTerms,
  keepalive,
}: {
  studio: StudioSettings
  pricing: PricingSettings
  terms: TermsSettings
  keepalive: { pinged_at: string | null; hits: number; source: string | null } | null
}) {
  const t = useT()
  const { lang } = useLang()
  const toast = useToast()
  const { can } = useApp()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [studio, setStudio] = useState(initialStudio)
  const [pricing, setPricing] = useState(initialPricing)
  const [terms, setTerms] = useState(initialTerms)

  const editable = can(PERMISSIONS.settingsEdit)

  const submit = () => {
    setError(null)
    start(async () => {
      const result = await saveSettings({ studio, pricing, terms })
      if (result.ok) toast(t('settings.saved'))
      else setError(result.error ?? t('toast.error'))
    })
  }

  const ping = () =>
    start(async () => {
      const result = await pingDatabase()
      toast(
        result.ok ? (result.message ?? t('toast.saved')) : (result.error ?? t('toast.error')),
        result.ok ? 'ok' : 'error',
      )
    })

  const num =
    <T extends object>(setter: (v: T) => void, obj: T, key: keyof T) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setter({ ...obj, [key]: Number(e.target.value) || 0 })

  const text =
    <T extends object>(setter: (v: T) => void, obj: T, key: keyof T) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setter({ ...obj, [key]: e.target.value })

  const stale =
    keepalive?.pinged_at &&
    Date.now() - new Date(keepalive.pinged_at).getTime() > 3 * 24 * 60 * 60 * 1000

  return (
    <>
      <PageHeader
        title={t('settings.title')}
        subtitle={t('settings.sub')}
        actions={
          editable && (
            <SubmitButton type="button" onClick={submit} pending={pending}>
              {t('common.save')}
            </SubmitButton>
          )
        }
      />

      {error && (
        <div className="mb-4 rounded-xl bg-clay/10 px-4 py-3 text-[12.5px] font-semibold text-clay">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card>
          <h2 className="mb-4 text-[15px] font-extrabold">{t('settings.studio')}</h2>
          <div className="flex flex-col gap-4">
            <Field label={t('settings.studioName')}>
              <input
                className="ob-input"
                value={studio.name}
                disabled={!editable}
                onChange={text(setStudio, studio, 'name')}
              />
            </Field>
            <Field label={t('settings.branch')}>
              <input
                className="ob-input"
                value={studio.branch}
                disabled={!editable}
                onChange={text(setStudio, studio, 'branch')}
              />
            </Field>
            <div className="flex gap-3">
              <Field label={t('settings.currency')} className="flex-1">
                <input
                  className="ob-input"
                  value={studio.currency}
                  disabled={!editable}
                  onChange={text(setStudio, studio, 'currency')}
                  dir="ltr"
                />
              </Field>
              <Field label={t('settings.usdRate')} className="flex-1">
                <input
                  className="ob-input"
                  type="number"
                  inputMode="decimal"
                  value={studio.usd_rate}
                  disabled={!editable}
                  onChange={num(setStudio, studio, 'usd_rate')}
                  dir="ltr"
                />
              </Field>
            </div>
            <div className="flex gap-3">
              <Field label={t('common.phone')} className="flex-1">
                <input
                  className="ob-input"
                  value={studio.phone}
                  disabled={!editable}
                  onChange={text(setStudio, studio, 'phone')}
                  dir="ltr"
                />
              </Field>
              <Field label="Instagram" className="flex-1">
                <input
                  className="ob-input"
                  value={studio.instagram}
                  disabled={!editable}
                  onChange={text(setStudio, studio, 'instagram')}
                  dir="ltr"
                />
              </Field>
            </div>
            <div className="flex gap-3">
              <Field label={t('settings.openHour')} className="flex-1">
                <input
                  className="ob-input"
                  type="number"
                  min={0}
                  max={23}
                  value={studio.open_hour}
                  disabled={!editable}
                  onChange={num(setStudio, studio, 'open_hour')}
                  dir="ltr"
                />
              </Field>
              <Field label={t('settings.closeHour')} className="flex-1">
                <input
                  className="ob-input"
                  type="number"
                  min={1}
                  max={24}
                  value={studio.close_hour}
                  disabled={!editable}
                  onChange={num(setStudio, studio, 'close_hour')}
                  dir="ltr"
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-[15px] font-extrabold">{t('settings.pricing')}</h2>
          <div className="flex flex-col gap-4">
            <div className="flex gap-3">
              <Field label={t('settings.hourlyRate')} className="flex-1">
                <input
                  className="ob-input"
                  type="number"
                  value={pricing.hourly_rate}
                  disabled={!editable}
                  onChange={num(setPricing, pricing, 'hourly_rate')}
                  dir="ltr"
                />
              </Field>
              <Field label={t('settings.minHours')} className="flex-1">
                <input
                  className="ob-input"
                  type="number"
                  value={pricing.hourly_min_hours}
                  disabled={!editable}
                  onChange={num(setPricing, pricing, 'hourly_min_hours')}
                  dir="ltr"
                />
              </Field>
            </div>
            <div className="flex gap-3">
              <Field label={t('settings.halfDay')} className="flex-1">
                <input
                  className="ob-input"
                  type="number"
                  value={pricing.half_day_price}
                  disabled={!editable}
                  onChange={num(setPricing, pricing, 'half_day_price')}
                  dir="ltr"
                />
              </Field>
              <Field label={t('settings.halfHours')} className="flex-1">
                <input
                  className="ob-input"
                  type="number"
                  value={pricing.half_day_hours}
                  disabled={!editable}
                  onChange={num(setPricing, pricing, 'half_day_hours')}
                  dir="ltr"
                />
              </Field>
            </div>
            <div className="flex gap-3">
              <Field label={t('settings.fullDay')} className="flex-1">
                <input
                  className="ob-input"
                  type="number"
                  value={pricing.full_day_price}
                  disabled={!editable}
                  onChange={num(setPricing, pricing, 'full_day_price')}
                  dir="ltr"
                />
              </Field>
              <Field label={t('settings.fullHours')} className="flex-1">
                <input
                  className="ob-input"
                  type="number"
                  value={pricing.full_day_hours}
                  disabled={!editable}
                  onChange={num(setPricing, pricing, 'full_day_hours')}
                  dir="ltr"
                />
              </Field>
            </div>
            <Field label={t('settings.depositPct')}>
              <input
                className="ob-input"
                type="number"
                min={0}
                max={100}
                value={pricing.deposit_pct}
                disabled={!editable}
                onChange={num(setPricing, pricing, 'deposit_pct')}
                dir="ltr"
              />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 text-[15px] font-extrabold">{t('settings.system')}</h2>
          <p className="mb-4 text-[12.5px] font-medium text-ink/55">
            A free Supabase project pauses after a week with no traffic. A scheduled job pings it
            every day so that never happens.
          </p>

          <div className="flex items-center justify-between rounded-[14px] bg-ink/5 px-4 py-3.5">
            <div className="min-w-0">
              <div className="text-[12.5px] font-bold">{t('settings.keepalive')}</div>
              <div
                className={`mt-0.5 text-[11.5px] font-semibold ${stale ? 'text-clay' : 'text-ink/50'}`}
              >
                {t('settings.lastPing')} · {timeAgo(keepalive?.pinged_at ?? null, lang)}
                {keepalive ? (
                  <>
                    {' · '}
                    <span className="ob-ltr">{keepalive.hits}</span>
                  </>
                ) : null}
              </div>
            </div>
            <span
              className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                stale ? 'bg-clay' : 'animate-pulse-soft bg-moss'
              }`}
            />
          </div>

          <button
            type="button"
            onClick={ping}
            disabled={pending}
            className="ob-btn ob-btn-ghost mt-3 w-full"
          >
            <Icon name="refresh" size={15} />
            {t('settings.pingNow')}
          </button>
        </Card>

        {/* -------------------------- Terms & Conditions -------------------------- */}
        <Card className="lg:col-span-2">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-extrabold">{t('settings.terms')}</h2>
            {/* Kept in-app: target="_blank" would kick a Home Screen launch out
                into Safari, address bar and all. */}
            <Link href="/terms" className="text-[12px] font-bold text-ink/55 hover:text-ink">
              {t('settings.viewTerms')} →
            </Link>
          </div>
          <p className="mb-4 text-[12.5px] font-medium text-ink/55">{t('settings.termsHint')}</p>

          <div className="flex flex-col gap-4">
            {terms.sections.map((section, si) => (
              <div key={si} className="rounded-[14px] border border-ink/10 p-3.5">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    className="ob-input h-10 flex-1 font-bold"
                    value={section.title}
                    disabled={!editable}
                    onChange={(e) =>
                      setTerms((prev) => ({
                        ...prev,
                        sections: prev.sections.map((s, i) =>
                          i === si ? { ...s, title: e.target.value } : s,
                        ),
                      }))
                    }
                  />
                  {editable && (
                    <button
                      type="button"
                      onClick={() =>
                        setTerms((prev) => ({
                          ...prev,
                          sections: prev.sections.filter((_, i) => i !== si),
                        }))
                      }
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-ink/12"
                      aria-label={t('common.remove')}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  {section.items.map((item, ii) => (
                    <div key={ii} className="flex items-start gap-2">
                      <textarea
                        className="ob-input min-h-[44px] flex-1 text-[13px]"
                        rows={2}
                        value={item}
                        disabled={!editable}
                        onChange={(e) =>
                          setTerms((prev) => ({
                            ...prev,
                            sections: prev.sections.map((s, i) =>
                              i === si
                                ? {
                                    ...s,
                                    items: s.items.map((x, j) => (j === ii ? e.target.value : x)),
                                  }
                                : s,
                            ),
                          }))
                        }
                      />
                      {editable && (
                        <button
                          type="button"
                          onClick={() =>
                            setTerms((prev) => ({
                              ...prev,
                              sections: prev.sections.map((s, i) =>
                                i === si
                                  ? { ...s, items: s.items.filter((_, j) => j !== ii) }
                                  : s,
                              ),
                            }))
                          }
                          className="mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-ink/12"
                          aria-label={t('common.remove')}
                        >
                          <Icon name="close" size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {editable && (
                  <button
                    type="button"
                    onClick={() =>
                      setTerms((prev) => ({
                        ...prev,
                        sections: prev.sections.map((s, i) =>
                          i === si ? { ...s, items: [...s.items, ''] } : s,
                        ),
                      }))
                    }
                    className="mt-2 text-[11.5px] font-bold text-ink/55 hover:text-ink"
                  >
                    + {t('settings.addPoint')}
                  </button>
                )}
              </div>
            ))}

            {editable && (
              <button
                type="button"
                onClick={() =>
                  setTerms((prev) => ({
                    ...prev,
                    sections: [...prev.sections, { title: '', items: [''] }],
                  }))
                }
                className="ob-btn ob-btn-ghost w-full"
              >
                <Icon name="plus" size={15} />
                {t('settings.addSection')}
              </button>
            )}

            <Field label={t('settings.agreeLine')}>
              <input
                className="ob-input"
                value={terms.agree_line}
                disabled={!editable}
                onChange={(e) => setTerms((prev) => ({ ...prev, agree_line: e.target.value }))}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 text-[15px] font-extrabold">{t('settings.install')}</h2>
          <p className="text-[12.5px] font-medium leading-relaxed text-ink/55">
            {t('settings.installBody')}
          </p>
          <ol className="mt-4 flex flex-col gap-2.5">
            {[
              { icon: 'globe' as const, text: 'Open this site in Safari on your iPhone.' },
              { icon: 'share' as const, text: 'Tap the Share button in the toolbar.' },
              { icon: 'plus' as const, text: 'Choose "Add to Home Screen", then Add.' },
            ].map((step, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-ink/7">
                  <Icon name={step.icon} size={16} />
                </span>
                <span className="text-[12.5px] font-semibold">{step.text}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  )
}
