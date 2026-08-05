import { CURRENCY_CODES, DEFAULT_FX, type CurrencyCode, type FxRates } from './currency'

/**
 * Live exchange rates.
 *
 * Three free sources, no API key between them, tried in order until one
 * answers. Rates move by fractions of a percent a day, so a single failure is
 * never worth showing an error for — the caller keeps the rates it already
 * had. What is worth guarding against is a source answering with nonsense: a
 * bad number here would be printed on an invoice a client keeps, so every
 * response is range-checked before it is allowed anywhere near the database.
 *
 * Every source quotes "units of X per 1 EGP"; the studio thinks in "EGP per 1
 * USD", so each adapter inverts.
 */

type Source = {
  name: string
  url: string
  /** Pulls out { USD: 0.0206, EUR: 0.0189 } — foreign units per 1 EGP. */
  parse: (body: unknown) => Partial<Record<CurrencyCode, number>> | null
}

function perEgpFrom(map: unknown): Partial<Record<CurrencyCode, number>> | null {
  if (!map || typeof map !== 'object') return null
  const table = map as Record<string, unknown>
  const out: Partial<Record<CurrencyCode, number>> = {}
  for (const code of CURRENCY_CODES) {
    if (code === 'EGP') continue
    // One source upper-cases its keys, another lower-cases them.
    const value = Number(table[code] ?? table[code.toLowerCase()])
    if (Number.isFinite(value) && value > 0) out[code] = value
  }
  return Object.keys(out).length ? out : null
}

const SOURCES: Source[] = [
  {
    name: 'open.er-api.com',
    url: 'https://open.er-api.com/v6/latest/EGP',
    parse: (body) => {
      const data = body as { result?: string; rates?: unknown }
      if (data?.result && data.result !== 'success') return null
      return perEgpFrom(data?.rates)
    },
  },
  {
    name: 'currency-api (jsdelivr)',
    url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/egp.json',
    parse: (body) => perEgpFrom((body as { egp?: unknown })?.egp),
  },
  {
    name: 'currency-api (pages.dev)',
    url: 'https://latest.currency-api.pages.dev/v1/currencies/egp.json',
    parse: (body) => perEgpFrom((body as { egp?: unknown })?.egp),
  },
]

/**
 * A rate only counts if it is plausible. These bounds are deliberately wide —
 * they exist to catch a source returning 1, or 0.02 the wrong way up, not to
 * second-guess the market.
 */
const BOUNDS: Record<Exclude<CurrencyCode, 'EGP'>, [number, number]> = {
  USD: [10, 500],
  EUR: [10, 600],
}

function plausible(code: CurrencyCode, egpPerUnit: number): boolean {
  if (code === 'EGP') return egpPerUnit === 1
  const bounds = BOUNDS[code as Exclude<CurrencyCode, 'EGP'>]
  if (!bounds) return false
  return Number.isFinite(egpPerUnit) && egpPerUnit >= bounds[0] && egpPerUnit <= bounds[1]
}

/** Turns "foreign per EGP" into "EGP per foreign", dropping anything implausible. */
export function ratesFromPerEgp(
  perEgp: Partial<Record<CurrencyCode, number>>,
): Partial<Record<CurrencyCode, number>> {
  const out: Partial<Record<CurrencyCode, number>> = {}
  for (const [code, value] of Object.entries(perEgp) as [CurrencyCode, number][]) {
    if (!Number.isFinite(value) || value <= 0) continue
    const egpPerUnit = 1 / value
    if (plausible(code, egpPerUnit)) out[code] = Math.round(egpPerUnit * 10_000) / 10_000
  }
  return out
}

/** Exposed so the parsing can be tested without going near the network. */
export function readSource(name: string, body: unknown): Partial<Record<CurrencyCode, number>> {
  const source = SOURCES.find((s) => s.name === name)
  if (!source) return {}
  const perEgp = source.parse(body)
  return perEgp ? ratesFromPerEgp(perEgp) : {}
}

export type FxFetchResult =
  | { ok: true; fx: FxRates }
  | { ok: false; error: string; tried: string[] }

/**
 * Asks each source in turn for today's rates.
 *
 * `previous` is whatever is already stored: if a source only knows about the
 * dollar, the euro keeps the number it had rather than snapping back to a
 * default from months ago.
 */
export async function fetchLiveRates(
  previous?: FxRates | null,
  timeoutMs = 8000,
): Promise<FxFetchResult> {
  const tried: string[] = []
  let lastError = 'No source answered'

  for (const source of SOURCES) {
    tried.push(source.name)
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const response = await fetch(source.url, {
        signal: controller.signal,
        cache: 'no-store',
        headers: { accept: 'application/json' },
      })
      clearTimeout(timer)

      if (!response.ok) {
        lastError = `${source.name} returned HTTP ${response.status}`
        continue
      }

      const parsed = source.parse(await response.json())
      if (!parsed) {
        lastError = `${source.name} sent nothing usable`
        continue
      }

      const fresh = ratesFromPerEgp(parsed)
      if (!Object.keys(fresh).length) {
        lastError = `${source.name} sent rates outside a believable range`
        continue
      }

      const base = previous?.rates ?? DEFAULT_FX.rates
      return {
        ok: true,
        fx: {
          rates: { ...base, ...fresh, EGP: 1 },
          fetched_at: new Date().toISOString(),
          source: source.name,
        },
      }
    } catch (err) {
      lastError =
        (err as Error)?.name === 'AbortError'
          ? `${source.name} timed out`
          : `${source.name}: ${(err as Error).message}`
    }
  }

  return { ok: false, error: lastError, tried }
}
