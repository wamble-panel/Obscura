import { jsPDF } from 'jspdf'
import { groupInvoiceItems, type SectionedLine } from './invoice-sections'

/**
 * Draws an invoice as a real PDF.
 *
 * The browser's own print sheet was doing this before, and on a phone it does
 * it badly: iOS prints through AirPrint, which stamps the page address and the
 * date into the margin and paginates to its own rules, so a one-page invoice
 * arrived as two with a link across the top. `@page { margin: 0 }` is honoured
 * by desktop Chrome and Safari; iOS ignores it.
 *
 * So the browser is out of the loop. This draws the sheet directly — vector
 * text, exact A4, exactly one page, no address anywhere — and writes a file
 * rather than opening a dialog. The layout mirrors the printed sheet: same
 * order, same headings, same section subtotals.
 */

const A4 = { w: 210, h: 297 } // millimetres
const M = { x: 15, top: 14, bottom: 12 }

const INK: [number, number, number] = [6, 57, 48]
const MUTED: [number, number, number] = [122, 141, 136]
const RULE: [number, number, number] = [214, 220, 217]
const SAND: [number, number, number] = [242, 240, 233]
const TINT: [number, number, number] = [246, 245, 240]

/**
 * How far the type may be squeezed before the invoice stops being readable.
 * A very long one is allowed a second page rather than becoming unreadable.
 */
const MIN_SCALE = 0.62
const PASSES = 7

export type PdfLine = SectionedLine & {
  description: string
  section?: string | null
  detail?: string | null
  qty: number
  unit_price: number
  amount: number
}

export type PdfInvoice = {
  number: string
  status: string
  client_name: string
  client_company?: string | null
  client_address?: string | null
  client_phone?: string | null
  client_email?: string | null
  issue_date: string
  due_date?: string | null
  subtotal: number
  discount: number
  tax_rate: number
  tax_amount: number
  total: number
  /** Already formatted, e.g. "$500.00". Null prints nothing. */
  second_amount?: string | null
  notes?: string | null
  terms?: string | null
  paid_amount?: number
  balance?: number
}

export type PdfStudio = {
  name: string
  branch?: string
  phone?: string
  instagram?: string
  /** data: URI for the lockup. Without one, the studio name carries the header. */
  logo?: string | null
}

export type PdfBank = { label: string; value: string }[]
export type PdfPayment = { paid_at: string; method: string; amount: number }

export type PdfLabels = Partial<
  Record<
    | 'invoice' | 'billTo' | 'issued' | 'due' | 'description' | 'qty' | 'unitPrice'
    | 'amount' | 'subtotal' | 'discount' | 'tax' | 'total' | 'paid' | 'balance'
    | 'notes' | 'terms' | 'payTo' | 'payments' | 'thanks',
    string
  >
>

export type BuildInput = {
  invoice: PdfInvoice
  items: PdfLine[]
  studio: PdfStudio
  bank?: PdfBank
  payments?: PdfPayment[]
  labels?: PdfLabels
}

const money = (n: number) => {
  const v = Number(n) || 0
  return (v < 0 ? '-' : '') + 'EGP ' + Math.abs(v).toLocaleString('en-US')
}

const shortDate = (key?: string | null) => {
  if (!key) return ''
  const d = new Date(`${key}T12:00:00`)
  if (Number.isNaN(d.getTime())) return key
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * One layout pass at a given scale.
 *
 * Every type size and vertical step multiplies by `s`, so the whole sheet can
 * be run again smaller when it will not fit. That is what makes one page a
 * guarantee rather than a hope: the content is made genuinely shorter, instead
 * of being drawn off the edge with the overflow page deleted afterwards.
 */
function drawSheet(input: BuildInput, s: number): { doc: jsPDF; bottom: number } {
  const { invoice, items, studio, bank = [], payments = [], labels = {} } = input
  const L: Required<PdfLabels> = {
    invoice: 'INVOICE', billTo: 'BILLED TO', issued: 'ISSUE DATE', due: 'DUE DATE',
    description: 'DESCRIPTION', qty: 'QTY', unitPrice: 'UNIT PRICE', amount: 'AMOUNT',
    subtotal: 'Subtotal', discount: 'Discount', tax: 'Tax', total: 'Total',
    paid: 'Paid', balance: 'Balance due', notes: 'NOTES', terms: 'TERMS',
    payTo: 'PAYMENT DETAILS', payments: 'PAYMENTS RECEIVED',
    thanks: `Thank you for working with ${studio.name}.`,
    ...labels,
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const right = A4.w - M.x
  const colQty = right - 78
  const colUnit = right - 42

  const ink = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2])
  const size = (pt: number) => doc.setFontSize(pt * s)
  const bold = () => doc.setFont('helvetica', 'bold')
  const plain = () => doc.setFont('helvetica', 'normal')
  const rule = (yy: number) => {
    doc.setDrawColor(RULE[0], RULE[1], RULE[2])
    doc.setLineWidth(0.2)
    doc.line(M.x, yy, right, yy)
  }

  let y = M.top

  /* ---------------- header ---------------- */
  if (studio.logo) {
    try {
      doc.addImage(studio.logo, 'PNG', M.x, y, 34 * s, 11.6 * s, undefined, 'FAST')
    } catch {
      // A logo that will not decode is not worth losing the invoice over.
    }
  }
  bold()
  size(9.5)
  ink(INK)
  doc.text(studio.name, M.x, y + 17 * s)
  if (studio.branch) {
    plain()
    size(8.5)
    ink(MUTED)
    doc.text(studio.branch, M.x, y + 21.5 * s)
  }

  bold()
  size(20)
  ink(INK)
  doc.text(L.invoice, right, y + 6 * s, { align: 'right' })
  size(10)
  ink(MUTED)
  doc.text(invoice.number, right, y + 12 * s, { align: 'right' })
  size(7.5)
  doc.text(invoice.status.toUpperCase(), right, y + 17 * s, { align: 'right' })

  y += 27 * s
  rule(y)
  y += 8 * s

  /* ---------------- parties ---------------- */
  bold()
  size(7)
  ink(MUTED)
  doc.text(L.billTo, M.x, y)
  doc.text(L.issued, colUnit, y, { align: 'right' })
  if (invoice.due_date) doc.text(L.due, right, y, { align: 'right' })

  size(11)
  ink(INK)
  doc.text(invoice.client_name, M.x, y + 6 * s)
  size(9)
  doc.text(shortDate(invoice.issue_date), colUnit, y + 6 * s, { align: 'right' })
  if (invoice.due_date) {
    doc.text(shortDate(invoice.due_date), right, y + 6 * s, { align: 'right' })
  }

  let sub = y + 11 * s
  plain()
  size(8.5)
  ink(MUTED)
  for (const line of [
    invoice.client_company,
    invoice.client_address,
    invoice.client_phone,
    invoice.client_email,
  ]) {
    if (!line) continue
    doc.text(String(line), M.x, sub)
    sub += 4.2 * s
  }

  y = Math.max(sub, y + 12 * s) + 4 * s
  rule(y)
  y += 5 * s

  /* ---------------- column heads ---------------- */
  bold()
  size(7)
  ink(MUTED)
  doc.text(L.description, M.x, y)
  doc.text(L.qty, colQty, y, { align: 'right' })
  doc.text(L.unitPrice, colUnit, y, { align: 'right' })
  doc.text(L.amount, right, y, { align: 'right' })
  y += 2.5 * s
  rule(y)
  y += 5 * s

  /* ---------------- the lines ---------------- */
  for (const group of groupInvoiceItems(items)) {
    if (group.section) {
      bold()
      size(7)
      ink(MUTED)
      doc.text(group.section.toUpperCase(), M.x, y)
      doc.text(money(group.total), right, y, { align: 'right' })
      y += 5 * s
    }

    for (const item of group.items) {
      bold()
      size(9)
      ink(INK)

      // Wrap rather than run underneath the numbers.
      const wrapped = doc.splitTextToSize(item.description, colQty - M.x - 6) as string[]
      doc.text(wrapped, M.x, y)
      doc.text(String(item.qty), colQty, y, { align: 'right' })
      plain()
      doc.text(money(item.unit_price), colUnit, y, { align: 'right' })
      bold()
      doc.text(money(item.amount), right, y, { align: 'right' })

      let bottom = y + (wrapped.length - 1) * 4 * s
      if (item.detail) {
        plain()
        size(7.5)
        ink(MUTED)
        const detail = doc.splitTextToSize(item.detail, colQty - M.x - 6) as string[]
        doc.text(detail, M.x, bottom + 3.6 * s)
        bottom += 3.6 * s + (detail.length - 1) * 3.2 * s
      }

      y = bottom + 3 * s
      doc.setDrawColor(RULE[0], RULE[1], RULE[2])
      doc.setLineWidth(0.15)
      doc.line(M.x, y, right, y)
      y += 3.5 * s
    }
    y += 1.5 * s
  }

  /* ---------------- totals ---------------- */
  y += 2 * s
  const boxLeft = right - 78
  const totalRow = (label: string, value: string, strong = false) => {
    doc.setFont('helvetica', strong ? 'bold' : 'normal')
    size(9)
    ink(strong ? INK : MUTED)
    doc.text(label, boxLeft, y)
    ink(INK)
    bold()
    doc.text(value, right, y, { align: 'right' })
    y += 5.5 * s
  }

  totalRow(L.subtotal, money(invoice.subtotal))
  if (Number(invoice.discount) > 0) totalRow(L.discount, '-' + money(invoice.discount))
  if (Number(invoice.tax_rate) > 0) {
    totalRow(`${L.tax} ${invoice.tax_rate}%`, money(invoice.tax_amount))
  }

  // The total sits in the studio's green — it survives here because this is
  // drawn, not printed, so no browser gets to decide to drop the background.
  const boxH = (invoice.second_amount ? 15 : 11) * s
  doc.setFillColor(INK[0], INK[1], INK[2])
  doc.roundedRect(boxLeft - 3, y - 4 * s, right - boxLeft + 3, boxH, 2, 2, 'F')
  doc.setTextColor(SAND[0], SAND[1], SAND[2])
  bold()
  size(9.5)
  doc.text(L.total, boxLeft, y + 2.5 * s)
  size(13)
  doc.text(money(invoice.total), right - 3, y + 2.5 * s, { align: 'right' })
  if (invoice.second_amount) {
    size(8.5)
    doc.text(invoice.second_amount, right - 3, y + 8 * s, { align: 'right' })
  }
  y += boxH + 3 * s

  if (Number(invoice.paid_amount) > 0) {
    totalRow(L.paid, '-' + money(invoice.paid_amount ?? 0))
    totalRow(L.balance, money(invoice.balance ?? 0), true)
  }

  /* ---------------- payments ---------------- */
  if (payments.length) {
    y += 3 * s
    bold()
    size(7)
    ink(MUTED)
    doc.text(L.payments, M.x, y)
    y += 4.5 * s
    plain()
    size(8.5)
    ink(INK)
    for (const p of payments) {
      doc.text(shortDate(p.paid_at), M.x, y)
      doc.text(p.method, M.x + 30, y)
      doc.text(money(p.amount), right, y, { align: 'right' })
      y += 4.4 * s
    }
  }

  /* ---------------- footer ---------------- */
  const hasFooter = bank.length > 0 || invoice.notes || invoice.terms
  if (hasFooter) {
    y += 4 * s
    rule(y)
    y += 6 * s
  }

  if (bank.length) {
    const h = 6 * s + bank.length * 4 * s
    doc.setFillColor(TINT[0], TINT[1], TINT[2])
    doc.roundedRect(M.x, y - 4 * s, right - M.x, h, 2, 2, 'F')
    bold()
    size(7)
    ink(MUTED)
    doc.text(L.payTo, M.x + 3, y)
    y += 4.5 * s
    size(8.5)
    for (const b of bank) {
      plain()
      ink(MUTED)
      doc.text(b.label, M.x + 3, y)
      bold()
      ink(INK)
      doc.text(b.value, M.x + 32, y)
      y += 4 * s
    }
    y += 3 * s
  }

  const textBlock = (heading: string, body: string) => {
    bold()
    size(7)
    ink(MUTED)
    doc.text(heading, M.x, y)
    y += 4 * s
    plain()
    size(8.5)
    ink(INK)
    const lines = doc.splitTextToSize(body, right - M.x - 45) as string[]
    doc.text(lines, M.x, y)
    y += lines.length * 4 * s + 3 * s
  }

  if (invoice.notes) textBlock(L.notes, invoice.notes)
  if (invoice.terms) textBlock(L.terms, invoice.terms)

  // The sign-off is pinned to the foot of the page, so it never collides with
  // the blocks above it — those are what get squeezed if there is a clash.
  plain()
  size(8)
  ink(MUTED)
  doc.text(L.thanks, M.x, A4.h - M.bottom)
  const contact = [studio.phone, studio.instagram].filter(Boolean).join('  ·  ')
  if (contact) doc.text(contact, right, A4.h - M.bottom, { align: 'right' })

  return { doc, bottom: y }
}

/**
 * Draws the invoice, shrinking until it fits on one page.
 *
 * A pass is cheap — no rendering, just text placement — so trying a handful is
 * far simpler than predicting the height, and it copes with a long notes block
 * or a dozen extra lines without any special cases.
 */
export function buildInvoicePdf(input: BuildInput): jsPDF {
  // Leave room for the sign-off pinned at the foot.
  const limit = A4.h - M.bottom - 8

  let attempt = drawSheet(input, 1)
  let scale = 1

  for (let i = 0; i < PASSES && attempt.bottom > limit && scale > MIN_SCALE; i++) {
    const used = attempt.bottom - M.top
    const available = limit - M.top
    scale = Math.max(MIN_SCALE, scale * (available / used) * 0.99)
    attempt = drawSheet(input, scale)
  }

  return attempt.doc
}

/** Builds the PDF and hands it to the browser as a download. */
export function downloadInvoicePdf(input: BuildInput, filename: string) {
  buildInvoicePdf(input).save(filename)
}
