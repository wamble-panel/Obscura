import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import { DEFAULT_STUDIO, DEFAULT_TERMS } from '@/lib/settings'
import { TermsContent } from '@/components/terms-content'
import { PrintButton } from '../i/[token]/print-button'
import type { StudioSettings, TermsSettings } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: 'Booking terms for Obscura studio sessions.',
  robots: { index: true, follow: true },
}

/**
 * Public — a client should be able to read the terms from the link on their
 * invoice, or from a message, without an account.
 */
export default async function TermsPage() {
  let terms: TermsSettings = DEFAULT_TERMS
  let studio: Pick<StudioSettings, 'name' | 'branch' | 'phone' | 'instagram'> = DEFAULT_STUDIO

  try {
    const { data } = await createPublicClient().rpc('public_terms')
    const payload = data as { terms?: Partial<TermsSettings>; studio?: typeof studio } | null
    if (payload?.terms && Object.keys(payload.terms).length) {
      terms = { ...DEFAULT_TERMS, ...payload.terms }
    }
    if (payload?.studio) studio = { ...studio, ...payload.studio }
  } catch {
    // Fall back to the built-in copy rather than showing the client an error.
  }

  return (
    <main className="min-h-dvh bg-sand pb-16 print:bg-white print:pb-0">
      <div className="sticky top-0 z-10 border-b border-ink/10 bg-sand/90 backdrop-blur-md print:hidden">
        <div className="mx-auto flex max-w-[840px] items-center justify-between gap-3 px-5 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <span className="text-[13px] font-bold text-ink/60">
            {studio.name}
            {studio.branch ? ` · ${studio.branch}` : ''}
          </span>
          <PrintButton />
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6">
        <TermsContent terms={terms} studio={studio} />
      </div>
    </main>
  )
}
