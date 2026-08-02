'use client'

import clsx from 'clsx'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { NAV_ITEMS, can, type NavItem } from '@/lib/permissions'
import { egp } from '@/lib/format'
import { useApp } from '../app-context'
import { useLang, useT } from '../lang-provider'
import { Icon, type IconName } from '../icons'
import { Avatar } from '../ui'
import { SignOutButton } from '../sign-out-button'

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/')
}

function NavLink({
  item,
  active,
  onClick,
}: {
  item: NavItem
  active: boolean
  onClick?: () => void
}) {
  const t = useT()
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-[13.5px] font-semibold transition-colors',
        active
          ? 'border border-ink/10 bg-paper/95 text-ink shadow-[0_1px_2px_rgba(6,57,48,.05),0_8px_20px_-12px_rgba(6,57,48,.4)]'
          : 'border border-transparent text-ink/62 hover:bg-paper/50 hover:text-ink',
      )}
    >
      <Icon name={item.icon as IconName} size={17} />
      {t(item.labelKey)}
    </Link>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const t = useT()
  const { lang, toggleLang } = useLang()
  const { viewer, settings } = useApp()
  const [moreOpen, setMoreOpen] = useState(false)

  const allowed = NAV_ITEMS.filter((item) =>
    can(viewer.permissions, item.permission, viewer.profile.role_key),
  )

  const groups: { key: NavItem['group']; label: string }[] = [
    { key: 'studio', label: t('nav.group.studio') },
    { key: 'business', label: t('nav.group.business') },
    { key: 'admin', label: t('nav.group.admin') },
  ]

  // Bottom bar on phones: up to four primary destinations, rest under "More".
  const primaryMobile = allowed.filter((i) => i.mobile).slice(0, 4)
  const mobileHrefs = new Set(primaryMobile.map((i) => i.href))
  const overflow = allowed.filter((i) => !mobileHrefs.has(i.href))

  useEffect(() => {
    setMoreOpen(false)
  }, [pathname])

  return (
    <div className="relative flex min-h-dvh flex-col lg:flex-row">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.04]"
        style={{
          backgroundImage: "url('/brand/mark.png')",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center 46%',
          backgroundSize: 'min(420px, 40%) auto',
        }}
      />

      {/* ---------------- Sidebar (desktop) ---------------- */}
      <aside className="sticky top-0 z-20 hidden h-dvh w-[240px] flex-shrink-0 flex-col self-start border-ink/10 bg-paper/55 px-3.5 pt-6 pb-4 ltr:border-r rtl:border-l lg:flex">
        <Link href="/dashboard" className="mb-6 flex items-center px-2.5">
          <Image src="/brand/lockup.png" alt="Obscura" width={130} height={44} className="h-6 w-auto" priority />
        </Link>

        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {groups.map((group) => {
            const items = allowed.filter((i) => i.group === group.key)
            if (!items.length) return null
            return (
              <div key={group.key} className="mb-2">
                <div className="px-3 pb-1.5 pt-2 text-[10.5px] font-bold uppercase tracking-[0.9px] text-ink/40">
                  {group.label}
                </div>
                <div className="flex flex-col gap-0.5">
                  {items.map((item) => (
                    <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        <div className="mt-3 rounded-[13px] border border-ink/9 bg-paper/75 px-3.5 py-3">
          <div className="text-[13px] font-bold">{settings.studio.branch}</div>
          <div className="mt-0.5 text-[11.5px] font-medium text-ink/55">
            <span className="ob-ltr">
              {settings.studio.open_hour}:00 – {settings.studio.close_hour}:00
            </span>
          </div>
          <div className="mt-2.5 flex gap-1.5">
            <div className="flex-1 rounded-[9px] bg-ink/5 px-2 py-1.5">
              <div className="text-[9.5px] font-bold uppercase tracking-[0.5px] text-ink/45">
                {t('common.hour')}
              </div>
              <div className="ob-ltr mt-0.5 text-[12.5px] font-extrabold">
                {egp(settings.pricing.hourly_rate)}
              </div>
            </div>
            <div className="flex-1 rounded-[9px] bg-ink/5 px-2 py-1.5">
              <div className="text-[9.5px] font-bold uppercase tracking-[0.5px] text-ink/45">
                {t('common.day')}
              </div>
              <div className="ob-ltr mt-0.5 text-[12.5px] font-extrabold">
                {egp(settings.pricing.full_day_price)}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-0.5">
          <button
            type="button"
            onClick={toggleLang}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-ink/62 hover:bg-ink/5"
          >
            <Icon name="globe" size={16} />
            {lang === 'en' ? 'العربية' : 'English'}
          </button>
          <SignOutButton variant="plain" />
        </div>

        <div className="mt-3 flex items-center gap-2.5 border-t border-ink/8 px-1 pt-3">
          <Avatar name={viewer.profile.full_name ?? viewer.profile.email} size={32} />
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-bold">
              {viewer.profile.full_name ?? viewer.profile.email}
            </div>
            <div className="truncate text-[11px] font-semibold capitalize text-ink/45">
              {viewer.profile.role_key}
            </div>
          </div>
        </div>
      </aside>

      {/* ---------------- Main column ---------------- */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-ink/8 bg-sand/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md lg:hidden">
          <Link href="/dashboard" className="flex items-center">
            <Image src="/brand/lockup.png" alt="Obscura" width={110} height={37} className="h-5 w-auto" />
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleLang}
              className="flex h-9 items-center rounded-full border border-ink/12 bg-paper/70 px-3 text-[12px] font-bold"
            >
              {lang === 'en' ? 'ع' : 'EN'}
            </button>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/12 bg-paper/70"
              aria-label={t('nav.more')}
            >
              <Icon name="menu" size={17} />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:pb-14 lg:pt-7">
          {children}
        </main>
      </div>

      {/* ---------------- Bottom nav (phones) ---------------- */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-ink/10 bg-paper/95 px-1.5 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md lg:hidden">
        {primaryMobile.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex flex-1 flex-col items-center gap-1 py-0.5 text-[10.5px] font-bold',
                active ? 'text-ink' : 'text-ink/40',
              )}
            >
              <Icon name={item.icon as IconName} size={20} strokeWidth={active ? 2.2 : 1.75} />
              {t(item.labelKey)}
            </Link>
          )
        })}
        {overflow.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-1 flex-col items-center gap-1 py-0.5 text-[10.5px] font-bold text-ink/40"
          >
            <Icon name="dots" size={20} />
            {t('nav.more')}
          </button>
        )}
      </nav>

      {/* ---------------- "More" sheet ---------------- */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-60 flex items-end bg-ink/35 animate-[fadeIn_.18s_ease] lg:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="w-full rounded-t-[24px] bg-cream px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 animate-[sheetUp_.26s_cubic-bezier(.22,1,.36,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink/15" />
            <div className="mb-4 flex items-center gap-3">
              <Avatar name={viewer.profile.full_name ?? viewer.profile.email} size={40} />
              <div className="min-w-0">
                <div className="truncate text-[14px] font-extrabold">
                  {viewer.profile.full_name ?? viewer.profile.email}
                </div>
                <div className="truncate text-[11.5px] font-semibold capitalize text-ink/50">
                  {viewer.profile.role_key}
                </div>
              </div>
            </div>

            <div className="grid max-h-[50vh] grid-cols-2 gap-1.5 overflow-y-auto">
              {allowed.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                  onClick={() => setMoreOpen(false)}
                />
              ))}
            </div>

            <div className="mt-3 border-t border-ink/8 pt-3">
              <SignOutButton variant="plain" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
