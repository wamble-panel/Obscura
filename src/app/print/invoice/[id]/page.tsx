import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { getT } from '@/lib/lang-server'
import { PERMISSIONS } from '@/lib/permissions'
import { egp, formatDate, usd } from '@/lib/format'
import { PrintToolbar } from '@/components/print-toolbar'
import type { InvoiceBalance, InvoiceItem, Payment } from '@/lib/types'

export const metadata: Metadata = { title: 'Invoice' }
export const dynamic = 'force-dynamic'

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requirePermission(PERMISSIONS.invoicesView)

  const supabase = await createClient()
  const [invoiceRes, itemsRes, paymentsRes] = await Promise.all([
    supabase.from('v_invoice_balance').select('*').eq('id', id).maybeSingle(),
    supabase.from('invoice_items').select('*').eq('invoice_id', id).order('sort'),
    supabase.from('payments').select('*').eq('invoice_id', id).order('paid_at'),
  ])

  const invoice = invoiceRes.data as InvoiceBalance | null
  if (!invoice) notFound()

  const items = (itemsRes.data ?? []) as InvoiceItem[]
  const payments = (paymentsRes.data ?? []) as Payment[]
  const { studio, terms } = await getSettings()
  const { t, lang } = await getT()

  const statusLabel = t(`inv.status.${invoice.status}`)

  return (
    <>
      <PrintToolbar title={t('inv.title')} backHref="/invoices" />

      <article className="mx-auto my-6 max-w-[820px] bg-paper p-8 shadow-card print:my-0 print:max-w-none print:p-0 print:shadow-none sm:p-12">
        {/* ---------------- header ---------------- */}
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
            <div className="text-[26px] font-extrabold uppercase tracking-[-0.5px]">
              {t('inv.number')}
            </div>
            <div className="ob-ltr mt-0.5 font-mono text-[15px] font-bold text-ink/70">
              {invoice.number}
            </div>
            <div
              className={`mt-3 inline-flex rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.5px] ${
                invoice.status === 'paid'
                  ? 'bg-moss/15 text-moss'
                  : invoice.status === 'void'
                    ? 'bg-ink/10 text-ink/50'
                    : invoice.balance > 0
                      ? 'bg-clay/12 text-clay'
                      : 'bg-ink/10 text-ink/70'
              }`}
            >
              {statusLabel}
            </div>
          </div>
        </header>

        {/* ---------------- parties ---------------- */}
        <section className="flex flex-wrap justify-between gap-6 py-7">
          <div className="min-w-[220px]">
            <div className="ob-label mb-1.5">{t('inv.billTo')}</div>
            <div className="text-[16px] font-extrabold">{invoice.client_name}</div>
            {invoice.client_company && (
              <div className="text-[13px] font-semibold text-ink/60">{invoice.client_company}</div>
            )}
            {invoice.client_address && (
              <div className="mt-1 max-w-[260px] text-[12.5px] font-medium leading-relaxed text-ink/55">
                {invoice.client_address}
              </div>
            )}
            {invoice.client_phone && (
              <div className="ob-ltr mt-1 text-[12.5px] font-semibold text-ink/55">
                {invoice.client_phone}
              </div>
            )}
            {invoice.client_email && (
              <div className="ob-ltr text-[12.5px] font-semibold text-ink/55">
                {invoice.client_email}
              </div>
            )}
          </div>

          <div className="flex gap-8">
            <div>
              <div className="ob-label mb-1.5">{t('inv.issueDate')}</div>
              <div className="ob-ltr text-[13.5px] font-bold">
                {formatDate(invoice.issue_date, lang, 'short')}
              </div>
            </div>
            {invoice.due_date && (
              <div>
                <div className="ob-label mb-1.5">{t('inv.dueDate')}</div>
                <div className="ob-ltr text-[13.5px] font-bold">
                  {formatDate(invoice.due_date, lang, 'short')}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ---------------- items ---------------- */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-ink/12">
              <th className="py-2.5 text-start text-[10.5px] font-bold uppercase tracking-[0.6px] text-ink/45">
                {t('inv.description')}
              </th>
              <th className="w-16 py-2.5 text-end text-[10.5px] font-bold uppercase tracking-[0.6px] text-ink/45">
                {t('inv.qty')}
              </th>
              <th className="w-28 py-2.5 text-end text-[10.5px] font-bold uppercase tracking-[0.6px] text-ink/45">
                {t('inv.unitPrice')}
              </th>
              <th className="w-28 py-2.5 text-end text-[10.5px] font-bold uppercase tracking-[0.6px] text-ink/45">
                {t('inv.lineTotal')}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-ink/7">
                <td className="py-3 text-[13px] font-semibold">{item.description}</td>
                <td className="ob-ltr py-3 text-end text-[13px]">{item.qty}</td>
                <td className="ob-ltr py-3 text-end text-[13px]">{egp(item.unit_price)}</td>
                <td className="ob-ltr py-3 text-end text-[13px] font-bold">{egp(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ---------------- totals ---------------- */}
        <section className="mt-6 flex justify-end">
          <div className="w-full max-w-[300px]">
            <Row label={t('inv.subtotal')} value={egp(invoice.subtotal)} />
            {Number(invoice.discount) > 0 && (
              <Row label={t('inv.discount')} value={`−${egp(invoice.discount)}`} />
            )}
            {Number(invoice.tax_rate) > 0 && (
              <Row
                label={`${t('inv.tax')} ${invoice.tax_rate}%`}
                value={egp(invoice.tax_amount)}
              />
            )}

            <div className="mt-2 flex items-center justify-between rounded-[13px] bg-ink px-4 py-3.5 text-sand">
              <span className="text-[13px] font-bold">{t('inv.total')}</span>
              <span className="text-end">
                <b className="ob-ltr text-[19px]">{egp(invoice.total)}</b>
                <span className="ob-ltr ms-1.5 text-[11px] opacity-70">
                  {usd(invoice.total, studio.usd_rate)}
                </span>
              </span>
            </div>

            {Number(invoice.paid_amount) > 0 && (
              <>
                <Row label={t('inv.paid')} value={`−${egp(invoice.paid_amount)}`} />
                <div className="mt-1 flex items-center justify-between border-t border-ink/12 pt-3">
                  <span className="text-[13px] font-extrabold">{t('inv.balance')}</span>
                  <b
                    className={`ob-ltr text-[17px] ${
                      Number(invoice.balance) > 0 ? 'text-clay' : 'text-moss'
                    }`}
                  >
                    {egp(invoice.balance)}
                  </b>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ---------------- payments ---------------- */}
        {payments.length > 0 && (
          <section className="mt-8 break-inside-avoid">
            <div className="ob-label mb-2">{t('inv.payments')}</div>
            <table className="w-full border-collapse">
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-ink/7">
                    <td className="ob-ltr py-2.5 text-[12.5px] font-semibold">
                      {formatDate(p.paid_at, lang, 'short')}
                    </td>
                    <td className="py-2.5 text-[12.5px] capitalize text-ink/60">{p.method}</td>
                    <td className="ob-ltr py-2.5 text-[12.5px] text-ink/50">
                      {p.reference ?? ''}
                    </td>
                    <td className="ob-ltr py-2.5 text-end text-[12.5px] font-bold">
                      {egp(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* ---------------- footer ---------------- */}
        <footer className="mt-10 border-t border-ink/12 pt-6">
          {invoice.notes && (
            <div className="mb-4">
              <div className="ob-label mb-1">{t('common.notes')}</div>
              <p className="max-w-[520px] text-[12.5px] font-medium leading-relaxed text-ink/65">
                {invoice.notes}
              </p>
            </div>
          )}
          <div className="ob-label mb-1">{t('inv.terms')}</div>
          <p className="max-w-[520px] text-[12.5px] font-medium leading-relaxed text-ink/65">
            {invoice.terms || t('inv.termsDefault')}
          </p>
          <p className="mt-2 max-w-[520px] text-[12px] font-medium leading-relaxed text-ink/55">
            {terms.invoice_line}
          </p>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <p className="text-[12px] font-semibold text-ink/40">{t('inv.thankYou')}</p>
            <p className="ob-ltr text-[11.5px] font-semibold text-ink/45">
              {[studio.phone, studio.instagram].filter(Boolean).join(' · ')}
            </p>
          </div>
        </footer>
      </article>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 text-[13px]">
      <span className="font-semibold text-ink/60">{label}</span>
      <span className="ob-ltr font-bold">{value}</span>
    </div>
  )
}
