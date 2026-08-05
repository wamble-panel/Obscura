'use client'

import { useEffect } from 'react'

const RECOVERY_FLAG = 'ob-chunk-recovery'

/**
 * Registers the service worker and flags iOS standalone mode so the layout
 * can add the right safe-area padding when launched from the Home Screen.
 *
 * It also digs the app out when a cached script goes bad. A build asset that
 * cannot load takes the whole page down with "a client-side exception has
 * occurred", and from inside that failure there is nothing the user can do
 * short of clearing site data — which nobody should have to be told to do on
 * a phone. So a failed script triggers one purge-and-reload, guarded by a
 * session flag so a genuine, repeatable failure cannot become a reload loop.
 */
export function PwaRegister() {
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari uses a non-standard flag
      (window.navigator as unknown as { standalone?: boolean }).standalone === true

    document.body.dataset.standalone = String(standalone)

    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          // Pick up a newer worker without waiting for every tab to close.
          registration.update().catch(() => undefined)
        })
        .catch(() => {
          // A failed registration just means no offline shell — not fatal.
        })
    }

    const recover = async () => {
      if (sessionStorage.getItem(RECOVERY_FLAG)) return
      sessionStorage.setItem(RECOVERY_FLAG, '1')

      try {
        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map((k) => caches.delete(k)))
        }
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations()
          await Promise.all(registrations.map((r) => r.unregister()))
        }
      } catch {
        // Even a partial clean-up is worth reloading after.
      }
      window.location.reload()
    }

    /** A script that never arrived, or arrived as something that will not run. */
    const onResourceError = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'SCRIPT') void recover()
    }

    const onError = (event: ErrorEvent) => {
      if (/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported/i.test(event.message)) {
        void recover()
      }
    }

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = String((event.reason as Error)?.message ?? event.reason ?? '')
      if (/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported/i.test(reason)) {
        void recover()
      }
    }

    // Capture: a failed <script> fires an error event that does not bubble.
    window.addEventListener('error', onResourceError, true)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)

    return () => {
      window.removeEventListener('error', onResourceError, true)
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
