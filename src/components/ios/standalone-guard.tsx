'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Keeps a Home Screen launch inside the installed app.
 *
 * iOS treats a full-page navigation as leaving the web app and reopens the
 * destination in Safari, address bar and all. Everything here routes through
 * next/link already, but one stray plain <a> — in this code or in something
 * added later — is enough to eject the user. This catches those and hands them
 * to the client router instead.
 *
 * Only active in standalone; in a normal browser tab it does nothing, so
 * ordinary link behaviour (new tab, copy address, cmd-click) is untouched.
 */
export function StandaloneGuard() {
  const router = useRouter()

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (!standalone) return

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const anchor = (event.target as HTMLElement | null)?.closest('a')
      if (!anchor) return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#')) return
      if (anchor.hasAttribute('download')) return

      // Let mail:, tel: and friends do their thing.
      const url = new URL(anchor.href, window.location.href)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return

      // Another site genuinely belongs in the browser.
      if (url.origin !== window.location.origin) return

      // Same origin: never let it become a document load.
      event.preventDefault()
      router.push(url.pathname + url.search + url.hash)
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [router])

  return null
}
