import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Document',
  robots: { index: false, follow: false },
}

/**
 * Documents meant for paper or PDF. No sidebar, no bottom bar, no watermark —
 * whatever is on screen is exactly what comes out of the printer.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-sand print:bg-white">{children}</div>
}
