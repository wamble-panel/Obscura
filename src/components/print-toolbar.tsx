'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from './icons'
import { printOnePage } from '@/lib/print-sheet'

/**
 * Sticky controls that never appear on the printed page.
 *
 * `action` replaces the print button where there is something better to offer
 * — the invoice sheet hands over a real generated PDF instead.
 */
export function PrintToolbar({
  title,
  backHref,
  action,
}: {
  title: string
  backHref: string
  action?: ReactNode
}) {
  const router = useRouter()

  return (
    <div className="sticky top-0 z-10 border-b border-ink/10 bg-sand/90 backdrop-blur-md print:hidden">
      <div className="mx-auto flex max-w-[820px] items-center justify-between gap-3 px-5 py-3">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="flex items-center gap-2 text-[13px] font-bold text-ink/60 hover:text-ink"
        >
          <Icon name="chevronLeft" size={16} className="rtl:rotate-180" />
          {title}
        </button>
        {action ?? (
          <button type="button" onClick={() => printOnePage()} className="ob-btn ob-btn-primary h-10">
            <Icon name="download" size={15} />
            Print
          </button>
        )}
      </div>
    </div>
  )
}
