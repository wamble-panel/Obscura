import Image from 'next/image'
import type { StudioSettings, TermsSettings } from '@/lib/types'
import { Icon } from './icons'

/**
 * The studio's Terms & Conditions as real, selectable, printable text.
 *
 * The original lives as a flat image, which cannot be searched, translated,
 * read by a screen reader, or edited without a designer. This renders the same
 * content from the settings row instead — `**bold**` is the only markup.
 */

function Emphasised({ text }: { text: string }) {
  // Split on **…** and bold the odd segments.
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-extrabold">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

/** Matches a badge to its pictogram by what the text actually says. */
function badgeIcon(label: string): 'noSmoking' | 'noPets' | 'noAlcohol' | 'close' {
  const l = label.toLowerCase()
  if (l.includes('smok')) return 'noSmoking'
  if (l.includes('pet') || l.includes('animal')) return 'noPets'
  if (l.includes('alcohol') || l.includes('drink')) return 'noAlcohol'
  return 'close'
}

export function TermsContent({
  terms,
  studio,
  showLogo = true,
}: {
  terms: TermsSettings
  studio: Pick<StudioSettings, 'name' | 'branch' | 'phone' | 'instagram'>
  showLogo?: boolean
}) {
  return (
    <article className="mx-auto max-w-[840px] bg-paper p-6 shadow-card print:shadow-none sm:p-10">
      <header className="flex flex-wrap items-center justify-between gap-5 border-b border-ink/12 pb-7">
        {showLogo && (
          <Image
            src="/brand/lockup.png"
            alt={studio.name}
            width={220}
            height={75}
            priority
            className="h-10 w-auto sm:h-12"
          />
        )}
        <h1 className="text-[28px] font-extrabold tracking-[-0.8px] text-ink-70 sm:text-[34px]">
          {terms.heading}
        </h1>
      </header>

      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        {terms.sections.map((section) => (
          <section
            key={section.title}
            className="relative rounded-[18px] border border-gold/35 bg-cream/60 px-5 pb-5 pt-8 break-inside-avoid"
          >
            <h2 className="absolute -top-3.5 inline-flex rounded-full bg-gold px-4 py-1.5 text-[13px] font-extrabold leading-tight text-paper ltr:left-5 rtl:right-5">
              {section.title}
            </h2>
            <ul className="flex flex-col gap-3.5">
              {section.items.map((item, i) => (
                <li key={i} className="flex gap-2 text-[13.5px] font-medium leading-relaxed">
                  <span aria-hidden className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-gold" />
                  <span>
                    <Emphasised text={item} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {terms.badges.length > 0 && (
        <div className="mt-8 grid gap-4 rounded-[18px] bg-ink px-6 py-7 text-sand sm:grid-cols-3">
          {terms.badges.map((badge) => (
            <div key={badge} className="flex flex-col items-center gap-2.5">
              <Icon name={badgeIcon(badge)} size={46} className="text-clay" />
              <span className="text-[11.5px] font-extrabold uppercase tracking-[1.5px]">
                {badge}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="mt-7 text-center text-[13.5px] font-semibold text-ink/60">
        {terms.agree_line}
      </p>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-ink/12 pt-5 text-[12.5px] font-semibold text-ink/55">
        <span className="ob-ltr">
          {[studio.phone, studio.instagram].filter(Boolean).join(' · ')}
        </span>
        <span>
          {studio.name}
          {studio.branch ? ` · ${studio.branch}` : ''}
        </span>
      </footer>
    </article>
  )
}
