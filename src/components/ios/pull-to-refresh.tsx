'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const THRESHOLD = 72
const MAX_PULL = 110

/**
 * Pull down to refresh — only when launched from the Home Screen.
 *
 * In a browser tab you already have the reload button and Safari's own
 * pull gesture; in standalone mode there is neither, which is the single most
 * common way a web app feels stuck. Gated to standalone so it can never fight
 * with the browser's native gesture.
 */
export function PullToRefresh() {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const active = useRef(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (!standalone) return

    const scrollTop = () => window.scrollY || document.documentElement.scrollTop || 0

    const onStart = (e: TouchEvent) => {
      if (scrollTop() > 0 || refreshing) return
      // Never hijack a gesture that began inside something scrollable of its own.
      const target = e.target as HTMLElement | null
      if (target?.closest('.ob-scroll-x, [data-no-pull], input, textarea, select')) return
      startY.current = e.touches[0].clientY
      active.current = true
    }

    const onMove = (e: TouchEvent) => {
      if (!active.current || startY.current === null) return
      const delta = e.touches[0].clientY - startY.current

      if (delta <= 0 || scrollTop() > 0) {
        active.current = false
        setPull(0)
        return
      }

      // Resist as it stretches, so it feels attached rather than loose.
      const eased = Math.min(MAX_PULL, delta * 0.42)
      setPull(eased)
      if (eased > 6 && e.cancelable) e.preventDefault()
    }

    const onEnd = () => {
      if (!active.current) return
      active.current = false
      startY.current = null

      setPull((current) => {
        if (current >= THRESHOLD) {
          setRefreshing(true)
          startTransition(() => router.refresh())
          setTimeout(() => {
            setRefreshing(false)
            setPull(0)
          }, 900)
          return THRESHOLD
        }
        return 0
      })
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [refreshing, router])

  if (pull <= 0 && !refreshing) return null

  const progress = Math.min(1, pull / THRESHOLD)

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-100 flex justify-center"
      style={{
        transform: `translateY(${Math.max(pull, refreshing ? THRESHOLD : 0) - 34}px)`,
        transition: active.current ? 'none' : 'transform .3s cubic-bezier(.22,1,.36,1)',
      }}
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full bg-cream shadow-card"
        style={{ opacity: refreshing ? 1 : progress }}
      >
        <span
          className="block h-4 w-4 bg-ink"
          style={{
            WebkitMaskImage: "url('/brand/mark.png')",
            maskImage: "url('/brand/mark.png')",
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
            transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
            animation: refreshing ? 'spin 1s linear infinite' : undefined,
          }}
        />
      </div>
    </div>
  )
}
