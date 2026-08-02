'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker and flags iOS standalone mode so the layout
 * can add the right safe-area padding when launched from the Home Screen.
 */
export function PwaRegister() {
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari uses a non-standard flag
      (window.navigator as unknown as { standalone?: boolean }).standalone === true

    document.body.dataset.standalone = String(standalone)

    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // A failed registration just means no offline shell — not fatal.
      })
    }
  }, [])

  return null
}
