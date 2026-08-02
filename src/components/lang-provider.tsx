'use client'

import { createContext, useCallback, useContext, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LANG_COOKIE, dirFor, makeTranslator, type Lang, type Translator } from '@/lib/i18n'

type LangContextValue = {
  lang: Lang
  dir: 'ltr' | 'rtl'
  t: Translator
  setLang: (lang: Lang) => void
  toggleLang: () => void
  switching: boolean
}

const LangContext = createContext<LangContextValue | null>(null)

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const router = useRouter()
  const [switching, startTransition] = useTransition()

  const setLang = useCallback(
    (next: Lang) => {
      document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
      document.documentElement.lang = next
      document.documentElement.dir = dirFor(next)
      startTransition(() => router.refresh())
    },
    [router],
  )

  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      dir: dirFor(lang),
      t: makeTranslator(lang),
      setLang,
      toggleLang: () => setLang(lang === 'en' ? 'ar' : 'en'),
      switching,
    }),
    [lang, setLang, switching],
  )

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used inside <LangProvider>')
  return ctx
}

/** Shorthand for components that only need the translate function. */
export function useT(): Translator {
  return useLang().t
}
