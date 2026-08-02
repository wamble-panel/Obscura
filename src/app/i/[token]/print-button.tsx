'use client'

import { Icon } from '@/components/icons'

/** On iOS the print sheet is also where "Save to Files" as a PDF lives. */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="ob-btn ob-btn-primary h-10">
      <Icon name="download" size={15} />
      Save as PDF
    </button>
  )
}
