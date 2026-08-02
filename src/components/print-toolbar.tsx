'use client'

import { useRouter } from 'next/navigation'
import { Icon } from './icons'

/** Sticky controls that never appear on the printed page. */
export function PrintToolbar({ title, backHref }: { title: string; backHref: string }) {
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
        <button type="button" onClick={() => window.print()} className="ob-btn ob-btn-primary h-10">
          <Icon name="download" size={15} />
          Print / Save as PDF
        </button>
      </div>
    </div>
  )
}
