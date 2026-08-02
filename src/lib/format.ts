import { MONTHS, MONTHS_SHORT, WEEKDAYS, type Lang } from './i18n'
import type { PricingSettings, SessionPackage } from './types'

/* ---------------------------------------------------------------------------
 * Money — always shown LTR, even in Arabic, like the original designs.
 * ------------------------------------------------------------------------- */

export function comma(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export function egp(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  return (v < 0 ? '−' : '') + 'E£' + comma(Math.abs(v))
}

export function usd(n: number | null | undefined, rate = 48): string {
  const v = Number(n ?? 0)
  const safeRate = rate > 0 ? rate : 48
  return (v < 0 ? '−' : '') + '$' + comma(Math.abs(v) / safeRate)
}

/** Wraps a value in bidi isolates so numbers read correctly inside Arabic text. */
export function ltr(value: string | number): string {
  return '⁦' + value + '⁩'
}

/* ---------------------------------------------------------------------------
 * Dates. Everything is stored as a plain YYYY-MM-DD string so there is no
 * timezone drift between the browser, the server and Postgres.
 * ------------------------------------------------------------------------- */

export function pad(n: number): string {
  return (n < 10 ? '0' : '') + n
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseKey(key: string): Date {
  const [y, m, d] = String(key).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, 12)
}

export function todayKey(): string {
  return dateKey(new Date())
}

export function addDays(key: string, n: number): string {
  const d = parseKey(key)
  d.setDate(d.getDate() + n)
  return dateKey(d)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86_400_000)
}

export function formatDate(key: string, lang: Lang = 'en', style: 'long' | 'short' = 'long'): string {
  if (!key) return '—'
  const d = parseKey(key)
  const months = style === 'long' ? MONTHS[lang] : MONTHS_SHORT[lang]
  return `${WEEKDAYS[lang][d.getDay()]}, ${ltr(`${d.getDate()} ${months[d.getMonth()]}`)}`
}

export function formatDateShort(key: string, lang: Lang = 'en'): string {
  if (!key) return '—'
  const d = parseKey(key)
  return ltr(`${d.getDate()} ${MONTHS_SHORT[lang][d.getMonth()]}`)
}

export function formatMonth(year: number, month: number, lang: Lang = 'en'): string {
  return `${MONTHS[lang][month]} ${ltr(year)}`
}

/** 14 -> "2:00 PM" */
export function formatHour(h: number): string {
  const hour = ((Math.floor(h) % 24) + 24) % 24
  const suffix = hour < 12 ? 'AM' : 'PM'
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display}:00 ${suffix}`
}

export function formatTimeRange(start: number, hours: number): string {
  return `${formatHour(start)} – ${formatHour(start + hours)}`
}

export function formatDateTime(iso: string | null, lang: Lang = 'en'): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${ltr(`${d.getDate()} ${MONTHS_SHORT[lang][d.getMonth()]}`)} · ${ltr(time)}`
}

/** "just now" / "4m ago" / "3h ago" / "2d ago" */
export function timeAgo(iso: string | null, lang: Lang = 'en'): string {
  if (!iso) return lang === 'ar' ? 'أبدًا' : 'never'
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return lang === 'ar' ? 'الآن' : 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return lang === 'ar' ? `منذ ${ltr(mins)} د` : `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return lang === 'ar' ? `منذ ${ltr(hours)} س` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return lang === 'ar' ? `منذ ${ltr(days)} ي` : `${days}d ago`
  const months = Math.floor(days / 30)
  return lang === 'ar' ? `منذ ${ltr(months)} شهر` : `${months}mo ago`
}

export function initials(name: string | null | undefined): string {
  const parts = String(name ?? '').trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

export function monthPeriod(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/* ---------------------------------------------------------------------------
 * Session pricing — one function so the form, the API and the totals in the
 * database can never disagree.
 * ------------------------------------------------------------------------- */

export const DEFAULT_PRICING: PricingSettings = {
  hourly_rate: 300,
  hourly_min_hours: 2,
  half_day_price: 1200,
  half_day_hours: 5,
  full_day_price: 2500,
  full_day_hours: 10,
  deposit_pct: 50,
}

export function packageHours(pkg: SessionPackage, hours: number, pricing: PricingSettings): number {
  if (pkg === 'half') return pricing.half_day_hours
  if (pkg === 'full') return pricing.full_day_hours
  return Math.max(pricing.hourly_min_hours, hours)
}

export function packageBase(pkg: SessionPackage, hours: number, pricing: PricingSettings): number {
  if (pkg === 'half') return pricing.half_day_price
  if (pkg === 'full') return pricing.full_day_price
  return packageHours('hourly', hours, pricing) * pricing.hourly_rate
}

export function priceSession(
  pkg: SessionPackage,
  hours: number,
  addonTotal: number,
  pricing: PricingSettings,
) {
  const resolvedHours = packageHours(pkg, hours, pricing)
  const base = packageBase(pkg, hours, pricing)
  const total = base + addonTotal
  return {
    hours: resolvedHours,
    base,
    addons: addonTotal,
    total,
    deposit: Math.round((total * pricing.deposit_pct) / 100),
  }
}

/* ---------------------------------------------------------------------------
 * Misc
 * ------------------------------------------------------------------------- */

export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return ''
  const cols = columns ?? Object.keys(rows[0])
  const head = cols.join(',')
  const body = rows.map((r) => cols.map((c) => csvEscape(r[c])).join(',')).join('\n')
  return `${head}\n${body}`
}

export function deviceFromUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device'
  const s = ua.toLowerCase()
  const os = s.includes('iphone')
    ? 'iPhone'
    : s.includes('ipad')
      ? 'iPad'
      : s.includes('android')
        ? 'Android'
        : s.includes('mac os')
          ? 'Mac'
          : s.includes('windows')
            ? 'Windows'
            : s.includes('linux')
              ? 'Linux'
              : 'Device'
  const browser = s.includes('edg/')
    ? 'Edge'
    : s.includes('chrome')
      ? 'Chrome'
      : s.includes('safari')
        ? 'Safari'
        : s.includes('firefox')
          ? 'Firefox'
          : 'Browser'
  return `${os} · ${browser}`
}
