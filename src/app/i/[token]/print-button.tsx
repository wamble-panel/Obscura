'use client'

import { Icon } from '@/components/icons'
import { printOnePage } from '@/lib/print-sheet'

/**
 * Saves the invoice as a PDF.
 *
 * A page cannot write a file to someone's disk on its own, so this opens the
 * browser's own print sheet with "Save as PDF" as the destination — which is
 * the better outcome anyway, since the text stays real text, selectable and
 * searchable, rather than a picture of itself. The print stylesheet does the
 * rest: no URL stamped into the margin, the colours kept, and the invoice
 * measured down onto a single page.
 *
 * On iPhone the same sheet is where "Save to Files" lives.
 */
export function PrintButton() {
  return (
    <button type="button" onClick={() => printOnePage()} className="ob-btn ob-btn-primary h-10">
      <Icon name="download" size={15} />
      Download PDF
    </button>
  )
}
