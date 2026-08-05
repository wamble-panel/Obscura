import { Fragment } from 'react'
import type { Metadata } from 'next'
import Image from 'next/image'
import { fetchSharedInvoice } from '@/lib/supabase/public'
import { egp, formatDate, usd } from '@/lib/format'
import { groupInvoiceItems } from '@/lib/invoice-sections'
import { convert, rateLine, toCurrencyCode } from '@/lib/currency'
import { Icon } from '@/components/icons'
import { PrintButton } from './print-button'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Invoice',
  robots: { index: false, follow: false },
}

/**
 * The page a client opens from the link they were sent. No account, no login,
 * no navigation into the rest of the studio — just their invoice, and a button
 * to save it as a PDF.
 */
export default async function SharedInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const data = await fetchSharedInvoice(token)

  if (!data || (!data.invoice && !data.expired)) {
    return (
      <Notice
        icon="alert"
        title="This link is not available"
        body="It may have been withdrawn, or the address was copied incompletely. Ask the studio for a fresh link."
      />
    )
  }

  if (data.expired) {
    return (
      <Notice
        icon="clock"
        title="This link has expired"
        body="Ask the studio to send you a new one and it will open right up."
      />
    )
  }

  const invoice = data.invoice!
  const items = data.items ?? []
  const groups = groupInvoiceItems(items)
  const currency = toCurrencyCode(invoice.currency)
  const fxRate = Number(invoice.fx_rate) || 1
  const payments = data.payments ?? []
  const studio = data.studio ?? { name: 'Obscura Studio', branch: '', usd_rate: 48 }
  const paid = Number(data.paid_amount ?? 0)
  const balance = Math.max(Number(invoice.total) - paid, 0)

  return (
    <main className="min-h-dvh bg-sand pb-16 print:bg-white print:pb-0">
      <div className="sticky top-0 z-10 border-b border-ink/10 bg-sand/90 backdrop-blur-md print:hidden">
        <div className="mx-auto flex max-w-[820px] items-center justify-between gap-3 px-5 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <span className="text-[13px] font-bold text-ink/60">
            {studio.name}
            {studio.branch ? ` · ${studio.branch}` : ''}
          </span>
          <PrintButton />
        </div>
      </div>

      <article className="ob-sheet mx-auto my-6 max-w-[820px] bg-paper p-6 shadow-card print:my-0 sm:p-12">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-ink/12 pb-7">
          <div>
            <Image
              src="/brand/lockup.png"
              alt={studio.name}
              width={200}
              height={68}
              priority
              className="h-10 w-auto sm:h-11"
            />
            <div className="mt-3 text-[12px] font-semibold leading-relaxed text-ink/55">
              <div className="text-[13px] font-extrabold text-ink">{studio.name}</div>
              {studio.branch && <div>{studio.branch}</div>}
            </div>
          </div>

          <div className="text-end">
            <div className="text-[22px] font-extrabold uppercase tracking-[-0.5px] sm:text-[26px]">
              Invoice
            </div>
            <div className="ob-ltr mt-0.5 font-mono text-[14px] font-bold text-ink/70">
              {invoice.number}
            </div>
            <div
              className={`mt-3 inline-flex rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.5px] ${
                invoice.status === 'paid'
                  ? 'bg-moss/15 text-moss'
                  : balance > 0
                    ? 'bg-clay/12 text-clay'
                    : 'bg-ink/10 text-ink/70'
              }`}
            >
              {invoice.status === 'paid' ? 'Paid' : balance > 0 ? 'Due' : 'Issued'}
            </div>
          </div>
        </header>

        <section className="flex flex-wrap justify-between gap-6 py-7">
          <div className="min-w-[200px]">
            <div className="ob-label mb-1.5">Billed to</div>
            <div className="text-[16px] font-extrabold">{invoice.client_name}</div>
            {invoice.client_company && (
              <div className="text-[13px] font-semibold text-ink/60">{invoice.client_company}</div>
            )}
            {invoice.client_address && (
              <div className="mt-1 max-w-[260px] text-[12.5px] font-medium leading-relaxed text-ink/55">
                {invoice.client_address}
              </div>
            )}
          </div>
          <div className="flex gap-8">
            <div>
              <div className="ob-label mb-1.5">Issued</div>
              <div className="ob-ltr text-[13.5px] font-bold">
                {formatDate(invoice.issue_date, 'en', 'short')}
              </div>
            </div>
            {invoice.due_date && (
              <div>
                <div className="ob-label mb-1.5">Due</div>
                <div className="ob-ltr text-[13.5px] font-bold">
                  {formatDate(invoice.due_date, 'en', 'short')}
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="ob-scroll-x">
          <table className="w-full min-w-[420px] border-collapse">
            <thead>
              <tr className="border-y border-ink/12">
                <th className="py-2.5 text-start text-[10.5px] font-bold uppercase tracking-[0.6px] text-ink/45">
                  Description
                </th>
                <th className="w-14 py-2.5 text-end text-[10.5px] font-bold uppercase tracking-[0.6px] text-ink/45">
                  Qty
                </th>
                <th className="w-24 py-2.5 text-end text-[10.5px] font-bold uppercase tracking-[0.6px] text-ink/45">
                  Price
                </th>
                <th className="w-24 py-2.5 text-end text-[10.5px] font-bold uppercase tracking-[0.6px] text-ink/45">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group, gi) => (
                <Fragment key={group.section ?? `g${gi}`}>
                  {group.section && (
                    <tr>
                      <td
                        colSpan={3}
                        className="pt-5 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.7px] text-ink/45"
                      >
                        {group.section}
                      </td>
                      <td className="ob-ltr pt-5 pb-1.5 text-end text-[10.5px] font-bold text-ink/45">
                        {egp(group.total)}
                      </td>
                    </tr>
                  )}
                  {group.items.map((item, i) => (
                    <tr key={i} className="border-b border-ink/7">
                      <td className="py-3 text-[13px] font-semibold">
                        {item.description}
                        {item.detail && (
                          <span className="mt-0.5 block text-[11px] font-medium leading-[1.45] text-ink/50">
                            {item.detail}
                          </span>
                        )}
                      </td>
                      <td className="ob-ltr py-3 align-top text-end text-[13px]">{item.qty}</td>
                      <td className="ob-ltr py-3 align-top text-end text-[13px]">
                        {egp(item.unit_price)}
                      </td>
                      <td className="ob-ltr py-3 align-top text-end text-[13px] font-bold">
                        {egp(item.amount)}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-6 flex justify-end">
          <div className="w-full max-w-[300px]">
            <SumRow label="Subtotal" value={egp(invoice.subtotal)} />
            {Number(invoice.discount) > 0 && (
              <SumRow label="Discount" value={`−${egp(invoice.discount)}`} />
            )}
            {Number(invoice.tax_rate) > 0 && (
              <SumRow label={`Tax ${invoice.tax_rate}%`} value={egp(invoice.tax_amount)} />
            )}

            <div className="mt-2 flex items-center justify-between gap-3 rounded-[13px] bg-ink px-4 py-3.5 text-sand">
              <span className="text-[13px] font-bold">Total</span>
              <span className="text-end">
                <b className="ob-ltr block text-[19px]">{egp(invoice.total)}</b>
                <span className="ob-ltr block text-[12px] font-bold opacity-75">
                  {currency === 'EGP'
                    ? usd(invoice.total, studio.usd_rate)
                    : convert(invoice.total, currency, fxRate)}
                </span>
              </span>
            </div>

            {currency !== 'EGP' && (
              <p className="ob-ltr mt-1.5 text-end text-[10.5px] font-semibold text-ink/45">
                {rateLine(currency, fxRate)}
              </p>
            )}

            {paid > 0 && (
              <>
                <SumRow label="Paid" value={`−${egp(paid)}`} />
                <div className="mt-1 flex items-center justify-between border-t border-ink/12 pt-3">
                  <span className="text-[13px] font-extrabold">Balance due</span>
                  <b className={`ob-ltr text-[17px] ${balance > 0 ? 'text-clay' : 'text-moss'}`}>
                    {egp(balance)}
                  </b>
                </div>
              </>
            )}
          </div>
        </section>

        {payments.length > 0 && (
          <section className="mt-8 break-inside-avoid">
            <div className="ob-label mb-2">Payments received</div>
            <table className="w-full border-collapse">
              <tbody>
                {payments.map((p, i) => (
                  <tr key={i} className="border-b border-ink/7">
                    <td className="ob-ltr py-2.5 text-[12.5px] font-semibold">
                      {formatDate(p.paid_at, 'en', 'short')}
                    </td>
                    <td className="py-2.5 text-[12.5px] capitalize text-ink/60">{p.method}</td>
                    <td className="ob-ltr py-2.5 text-end text-[12.5px] font-bold">
                      {egp(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <footer className="mt-10 border-t border-ink/12 pt-6">
          {invoice.notes && (
            <div className="mb-4">
              <div className="ob-label mb-1">Notes</div>
              <p className="max-w-[520px] text-[12.5px] font-medium leading-relaxed text-ink/65">
                {invoice.notes}
              </p>
            </div>
          )}
          {invoice.terms && (
            <>
              <div className="ob-label mb-1">Terms</div>
              <p className="max-w-[520px] text-[12.5px] font-medium leading-relaxed text-ink/65">
                {invoice.terms}
              </p>
            </>
          )}

          <p className="mt-4 text-[12px] font-medium text-ink/55">
            Booking is subject to our{' '}
            <a
              href="/terms"
              className="font-bold text-ink underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
            >
              Terms &amp; Conditions
            </a>
            .
          </p>

          <p className="mt-6 text-[12px] font-semibold text-ink/40">
            Thank you for working with {studio.name}.
          </p>
        </footer>
      </article>
    </main>
  )
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 text-[13px]">
      <span className="font-semibold text-ink/60">{label}</span>
      <span className="ob-ltr font-bold">{value}</span>
    </div>
  )
}

function Notice({ icon, title, body }: { icon: 'alert' | 'clock'; title: string; body: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-[400px] text-center">
        <Image
          src="/brand/lockup.png"
          alt="Obscura"
          width={132}
          height={45}
          className="mx-auto mb-8 h-8 w-auto"
        />
        <div className="ob-card px-6 py-9">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink/8 text-ink/60">
            <Icon name={icon} size={24} />
          </div>
          <h1 className="text-[19px] font-extrabold tracking-[-0.4px]">{title}</h1>
          <p className="mx-auto mt-2 max-w-[300px] text-[13px] font-medium leading-relaxed text-ink/55">
            {body}
          </p>
        </div>
      </div>
    </main>
  )
}
