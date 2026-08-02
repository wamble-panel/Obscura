'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { deviceFromUserAgent } from '@/lib/format'

const INTERVAL_MS = 45_000

/**
 * Tells the database this account is still here, roughly every 45 seconds and
 * whenever the page becomes visible again. That is what powers the "online
 * right now" board on the audit page.
 */
export function PresenceHeartbeat() {
  const pathname = usePathname()
  const pathRef = useRef(pathname)
  pathRef.current = pathname

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    const beat = async () => {
      if (cancelled || document.visibilityState === 'hidden') return
      try {
        await supabase.rpc('touch_presence', {
          p_path: pathRef.current,
          p_user_agent: navigator.userAgent,
          p_ip: null,
          p_device: deviceFromUserAgent(navigator.userAgent),
        })
      } catch {
        // Offline or a dropped session — the next beat will catch up.
      }
    }

    void beat()
    const id = setInterval(beat, INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void beat()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // Report the page change immediately so the audit board stays accurate.
  useEffect(() => {
    const supabase = createClient()
    void supabase
      .rpc('touch_presence', {
        p_path: pathname,
        p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        p_ip: null,
        p_device:
          typeof navigator !== 'undefined' ? deviceFromUserAgent(navigator.userAgent) : null,
      })
      .then(() => undefined)
  }, [pathname])

  return null
}
