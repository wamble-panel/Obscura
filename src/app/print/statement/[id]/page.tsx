import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { getT } from '@/lib/lang-server'
import { PERMISSIONS } from '@/lib/permissions'
import { egp, formatDate, todayKey } from '@/lib/format'
import { PrintToolbar } from '@/components/print-toolbar'
import type { Client, InvoiceBalance, Payment } from '@/lib/types'

export const metadata: Metadata = { title: 'Statement' }
export const dynamic = 'force-dynamic'

type Line = {
  date: string
  ref: string
  detail: string
  charge: number
  credit: number
}

export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { id } = await params
  const { from, to } = await searchParams
  await requirePermission(PERMISSIONS.invoicesView)

  const supabase = await createClient()
  const { data: client } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()
  if (!client) notFound()

  const [invoicesRes, paymentsRes] = await Promise.all([
    supabase
      .from('v_invoice_balance')
      .select('*')
      .eq('client_id', id)
      .neq('status', 'void')
      .order('issue_date'),
    supabase.from('payments').select('*').eq('client_id', id).order('paid_at'),
  ])

  const invoices = (invoicesRes.data ?? []) as InvoiceBalance[]
  const payments = (paymentsRes.data ?? []) as Payment[]
  const { studio } = await getSettings()
  const { t, lang } = await getT()

  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to)

  // One running ledger: invoices are charges, payments are credits.
  const lines: Line[] = [
    ...invoices
      .filter((i) => inRange(i.issue_date))
      .map((i) => ({
        date: i.issue_date,
        ref: i.number,
        detail: t('inv.number'),
        charge: Number(i.total),
        credit: 0,
      })),
    ...payments
      .filter((p) => inRange(p.paid_at))
      .map((p) => ({
        date: p.paid_at,
        ref: p.reference ?? '',
        detail: `${t('inv.recordPayment')} · ${p.method}`,
        charge: 0,
        credit: Number(p.amount),
      })),
  ].sort((a, b) => (a.date === b.date ? (b.charge ? 1 : -1) : a.date < b.date ? -1 : 1))

  const totalCharged = lines.reduce((sum, l) => sum + l.charge, 0)
  const totalPaid = lines.reduce((sum, l) => sum + l.credit, 0)
  const balance = totalCharged - totalPaid

  let running = 0

  return (
    <>
      <PrintToolbar title={t('inv.statements')} backHref="/invoices" />

      <article className="mx-auto my-6 max-w-[820px] bg-paper p-8 shadow-card print:my-0 print:max-w-none print:p-0 print:shadow-none sm:p-12">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-ink/12 pb-7">
          <div>
            <Image
              src="/brand/lockup.png"
              alt={studio.name}
              width={200}
              height={68}
              priority
              className="h-11 w-auto"
            />
            <div className="mt-3 text-[12px] font-semibold leading-relaxed text-ink/55">
              <div className="text-[13px] font-extrabold text-ink">{studio.name}</div>
              <div>{studio.branch}</div>
            </div>
          </div>
          <div className="text-end">
            <div className="text-[22px] font-extrabold uppercase tracking-[-0.5px]">
              {t('inv.statementFor')}
            </div>
            <div className="ob-ltr mt-1 text-[12.5px] font-semibold text-ink/55">
              {from || to
                ? `${from ? formatDate(from, lang, 'short') : '…'} → ${to ? formatDate(to, lang, 'short') : '…'}`
                : formatDate(todayKey(), lang, 'short')}
            </div>
          </div>
        </header>

        <section className="py-7">
          <div className="ob-label mb-1.5">{t('inv.billTo')}</div>
          <div className="text-[16px] font-extrabold">{(client as Client).name}</div>
          {(client as Client).company && (
            <div className="text-[13px] font-semibold text-ink/60">{(client as Client).company}</div>
          )}
          {(client as Client).phone && (
            <div className="ob-ltr text-[12.5px] font-semibold text-ink/55">
              {(client as Client).phone}
            </div>
          )}
        </section>

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-ink/12">
              {[t('common.date'), t('inv.number'), t('inv.description'), t('inv.total'), t('inv.paid'), t('inv.balance')].map(
                (h, i) => (
                  <th
                    key={i}
                    className={`py-2.5 text-[10.5px] font-bold uppercase tracking-[0.6px] text-ink/45 ${
                      i > 2 ? 'text-end' : 'text-start'
                    }`}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[13px] font-medium text-ink/40">
                  {t('common.empty')}
                </td>
              </tr>
            ) : (
              lines.map((line, i) => {
                running += line.charge - line.credit
                return (
                  <tr key={i} className="border-b border-ink/7">
                    <td className="ob-ltr py-2.5 text-[12.5px] font-semibold">
                      {formatDate(line.date, lang, 'short')}
                    </td>
                    <td className="ob-ltr py-2.5 font-mono text-[12px] text-ink/55">{line.ref}</td>
                    <td className="py-2.5 text-[12.5px] text-ink/70">{line.detail}</td>
                    <td className="ob-ltr py-2.5 text-end text-[12.5px]">
                      {line.charge ? egp(line.charge) : ''}
                    </td>
                    <td className="ob-ltr py-2.5 text-end text-[12.5px] text-moss">
                      {line.credit ? egp(line.credit) : ''}
                    </td>
                    <td className="ob-ltr py-2.5 text-end text-[12.5px] font-bold">
                      {egp(running)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        <section className="mt-6 flex justify-end">
          <div className="w-full max-w-[300px]">
            <div className="flex items-center justify-between py-2 text-[13px]">
              <span className="font-semibold text-ink/60">{t('inv.totalInvoiced')}</span>
              <span className="ob-ltr font-bold">{egp(totalCharged)}</span>
            </div>
            <div className="flex items-center justify-between py-2 text-[13px]">
              <span className="font-semibold text-ink/60">{t('inv.collected')}</span>
              <span className="ob-ltr font-bold text-moss">−{egp(totalPaid)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-[13px] bg-ink px-4 py-3.5 text-sand">
              <span className="text-[13px] font-bold">{t('inv.balance')}</span>
              <b className="ob-ltr text-[19px]">{egp(balance)}</b>
            </div>
          </div>
        </section>

        <footer className="mt-10 flex flex-wrap items-end justify-between gap-3 border-t border-ink/12 pt-6">
          <p className="text-[12px] font-semibold text-ink/40">{t('inv.thankYou')}</p>
          <p className="ob-ltr text-[11.5px] font-semibold text-ink/45">
            {[studio.phone, studio.instagram].filter(Boolean).join(' · ')}
          </p>
        </footer>
      </article>
    </>
  )
}
