import { cookies } from 'next/headers'
import { LANG_COOKIE, makeTranslator, type Lang } from './i18n'

/** Reads the language cookie inside Server Components. */
export async function getLang(): Promise<Lang> {
  const store = await cookies()
  return store.get(LANG_COOKIE)?.value === 'ar' ? 'ar' : 'en'
}

/** Server-side translator, for pages that render text without a client component. */
export async function getT() {
  const lang = await getLang()
  return { lang, t: makeTranslator(lang) }
}
