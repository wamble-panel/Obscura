/**
 * Money in more than one currency.
 *
 * The studio earns, spends and books in Egyptian pounds, so EGP stays the
 * money of record: every amount in the database is EGP and nothing here
 * changes that. What this adds is a second currency shown alongside — an
 * invoice can be presented in dollars or euros without the ledger, the
 * pricing or the finance page having to know about it.
 *
 * A rate is always **EGP for one unit of the foreign currency**, which is how
 * the rate is quoted in Cairo and matches the `usd_rate: 48` that was here
 * before. One unit of EGP costs one EGP, so its rate is 1.
 */

export type CurrencyCode = 'EGP' | 'USD' | 'EUR'

export type Currency = {
  code: CurrencyCode
  symbol: string
  en: string
  ar: string
  /** Pounds are shown whole; a hundred-times-larger unit needs its cents. */
  decimals: number
}

export const CURRENCIES: Record<CurrencyCode, Currency> = {
  EGP: { code: 'EGP', symbol: 'E£', en: 'Egyptian pound', ar: 'جنيه مصري', decimals: 0 },
  USD: { code: 'USD', symbol: '$', en: 'US dollar', ar: 'دولار أمريكي', decimals: 2 },
  EUR: { code: 'EUR', symbol: '€', en: 'Euro', ar: 'يورو', decimals: 2 },
}

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[]

/** Everything the studio can present an invoice in, apart from its own money. */
export const FOREIGN_CODES = CURRENCY_CODES.filter((c) => c !== 'EGP')

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && value in CURRENCIES
}

export function toCurrencyCode(value: unknown, fallback: CurrencyCode = 'EGP'): CurrencyCode {
  return isCurrencyCode(value) ? value : fallback
}

/* ---------------------------------------------------------------------------
 * Rates
 * ------------------------------------------------------------------------- */

export type FxRates = {
  /** EGP per one unit. EGP itself is always 1. */
  rates: Record<CurrencyCode, number>
  /** When the numbers were last pulled, ISO. Null means they never have been. */
  fetched_at: string | null
  /** Where they came from, or 'manual' when someone typed them in. */
  source: string
}

export const DEFAULT_FX: FxRates = {
  rates: { EGP: 1, USD: 48, EUR: 52 },
  fetched_at: null,
  source: 'default',
}

/**
 * A rate that can be relied on. A missing, zero, negative or absurd rate would
 * silently turn a 20,000 pound invoice into "$0" or "$4,000,000" on a document
 * the client keeps, so anything outside a sane band falls back to the default.
 */
export function rateFor(code: CurrencyCode, fx?: Partial<FxRates> | null): number {
  if (code === 'EGP') return 1
  const raw = Number(fx?.rates?.[code])
  if (!Number.isFinite(raw) || raw <= 0 || raw > 100_000) return DEFAULT_FX.rates[code]
  return raw
}

/** Merges whatever came out of the database over the defaults, safely. */
export function normalizeFx(value: unknown): FxRates {
  const input = (value ?? {}) as Partial<FxRates>
  const rates = { ...DEFAULT_FX.rates }
  for (const code of CURRENCY_CODES) {
    rates[code] = rateFor(code, input)
  }
  rates.EGP = 1
  return {
    rates,
    fetched_at: typeof input.fetched_at === 'string' ? input.fetched_at : null,
    source: typeof input.source === 'string' ? input.source : DEFAULT_FX.source,
  }
}

/* ---------------------------------------------------------------------------
 * Formatting and conversion
 * ------------------------------------------------------------------------- */

function group(n: number, decimals: number): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Formats an amount that is already in `code`. */
export function money(amount: number | null | undefined, code: CurrencyCode = 'EGP'): string {
  const currency = CURRENCIES[code] ?? CURRENCIES.EGP
  const value = Number(amount ?? 0)
  // A real minus sign, not a hyphen — it lines up with the digits.
  return (value < 0 ? '−' : '') + currency.symbol + group(Math.abs(value), currency.decimals)
}

/** Converts an EGP amount into `code` at `rate` EGP per unit. */
export function fromEgp(egpAmount: number | null | undefined, rate: number): number {
  const value = Number(egpAmount ?? 0)
  const safe = Number.isFinite(rate) && rate > 0 ? rate : 1
  return value / safe
}

/** An EGP amount, formatted in `code` at `rate`. */
export function convert(
  egpAmount: number | null | undefined,
  code: CurrencyCode,
  rate: number,
): string {
  if (code === 'EGP') return money(egpAmount, 'EGP')
  return money(fromEgp(egpAmount, rate), code)
}

/** "1 USD = E£48.50" — shown wherever a converted figure appears. */
export function rateLine(code: CurrencyCode, rate: number): string {
  if (code === 'EGP') return ''
  return `1 ${code} = E£${group(rate, 2)}`
}
