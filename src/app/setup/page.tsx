import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Icon } from '@/components/icons'

export const metadata: Metadata = { title: 'Setup' }
export const dynamic = 'force-dynamic'

/**
 * Each entry reads its variable through a *static* `process.env.X` reference.
 * Next.js only inlines NEXT_PUBLIC_ variables when they are written that way —
 * a dynamic `process.env[name]` lookup would always come back empty and report
 * a correctly-configured project as broken.
 */
const VARS: {
  name: string
  value: string | undefined
  where: string
  example: string
  required: boolean
  note?: string
}[] = [
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    value: process.env.NEXT_PUBLIC_SUPABASE_URL,
    where: 'Supabase → Project Settings → Data API → Project URL',
    example: 'https://abcdefgh.supabase.co',
    required: true,
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    where: 'Supabase → Project Settings → API Keys → anon / public',
    example: 'eyJhbGciOi…',
    required: true,
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    value: process.env.SUPABASE_SERVICE_ROLE_KEY,
    where: 'Supabase → Project Settings → API Keys → service_role (keep secret)',
    example: 'eyJhbGciOi…',
    required: false,
    note: 'Only needed so admins can create accounts for team members from inside the app.',
  },
  {
    name: 'CRON_SECRET',
    value: process.env.CRON_SECRET,
    where: 'Any random string you invent',
    example: 'a-long-random-string',
    required: false,
    note: 'Protects the keep-alive endpoint. Vercel sends it automatically for scheduled runs.',
  },
  {
    name: 'NEXT_PUBLIC_SITE_URL',
    value: process.env.NEXT_PUBLIC_SITE_URL,
    where: 'Your deployed URL',
    example: 'https://obscura.vercel.app',
    required: false,
    note: 'Used to build password-reset links.',
  },
]

export default function SetupPage() {
  const ready = VARS.filter((v) => v.required).every((v) => Boolean(v.value))

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[720px] px-5 py-12">
      <Image src="/brand/lockup.png" alt="Obscura" width={150} height={51} className="mb-8 h-9 w-auto" />

      <h1 className="text-[26px] font-extrabold tracking-[-0.6px]">Almost there</h1>
      <p className="mt-1.5 text-[13.5px] font-medium text-ink/55">
        Obscura needs to know where your Supabase project lives. Add these in{' '}
        <b>Vercel → Settings → Environment Variables</b>, then redeploy.
      </p>

      <div className="mt-7 flex flex-col gap-3">
        {VARS.map((v) => {
          const ok = Boolean(v.value)
          return (
            <div key={v.name} className="ob-card p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${
                    ok ? 'bg-moss/15 text-moss' : v.required ? 'bg-clay/15 text-clay' : 'bg-ink/8 text-ink/40'
                  }`}
                >
                  <Icon name={ok ? 'check' : v.required ? 'alert' : 'dots'} size={13} />
                </span>
                <code className="font-mono text-[13px] font-bold">{v.name}</code>
                {!v.required && (
                  <span className="ob-badge bg-ink/8 text-ink/50">optional</span>
                )}
              </div>
              <div className="mt-2 ltr:pl-8 rtl:pr-8">
                <div className="text-[12.5px] font-semibold text-ink/60">{v.where}</div>
                <code className="mt-1 block truncate font-mono text-[11.5px] text-ink/35">
                  {v.example}
                </code>
                {v.note && <div className="mt-1.5 text-[11.5px] text-ink/45">{v.note}</div>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="ob-card mt-6 p-5">
        <h2 className="text-[15px] font-extrabold">Then, in Supabase</h2>
        <ol className="mt-3 flex list-decimal flex-col gap-2 text-[13px] font-medium text-ink/65 ltr:pl-5 rtl:pr-5">
          <li>
            Open <b>SQL Editor</b> and run the contents of{' '}
            <code className="font-mono text-[12px]">supabase/schema.sql</code>.
          </li>
          <li>
            Optionally run <code className="font-mono text-[12px]">supabase/seed.sql</code> to load the
            studio&apos;s equipment list.
          </li>
          <li>Come back here and create your account — the first one becomes the admin.</li>
        </ol>
      </div>

      {ready && (
        <Link href="/login" className="ob-btn ob-btn-primary mt-6 h-12 w-full text-[14px]">
          Everything is set — go to sign in
        </Link>
      )}
    </main>
  )
}
