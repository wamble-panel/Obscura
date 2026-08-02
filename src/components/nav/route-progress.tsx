'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * A thin progress bar across the very top of the app.
 *
 * The App Router streams pages in, so there is no single "navigation finished"
 * event to hook. Instead this starts on any link click or history change and
 * completes when the pathname actually settles — which is the moment the new
 * route's content (or its skeleton) is on screen.
 */
export function RouteProgress() {
  const pathname = usePathname()
  const [active, setActive] = useState(false)
  const [width, setWidth] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const settled = useRef(pathname)

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  useEffect(() => {
    const start = () => {
      if (settled.current === window.location.pathname) {
        // Same page — nothing is actually loading.
        return
      }
      clearTimers()
      setActive(true)
      setWidth(12)
      // Creep forward so it never looks stuck, but never reach the end.
      timers.current.push(setTimeout(() => setWidth(45), 120))
      timers.current.push(setTimeout(() => setWidth(68), 380))
      timers.current.push(setTimeout(() => setWidth(84), 900))
      timers.current.push(setTimeout(() => setWidth(92), 1800))
    }

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const anchor = (event.target as HTMLElement | null)?.closest('a')
      if (!anchor) return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#')) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return

      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname) return

      settled.current = window.location.pathname
      start()
    }

    document.addEventListener('click', onClick, { capture: true })
    window.addEventListener('popstate', start)
    return () => {
      document.removeEventListener('click', onClick, { capture: true })
      window.removeEventListener('popstate', start)
      clearTimers()
    }
  }, [])

  // The pathname changing is our "arrived" signal.
  useEffect(() => {
    settled.current = pathname
    if (!active) return
    clearTimers()
    setWidth(100)
    const done = setTimeout(() => {
      setActive(false)
      setWidth(0)
    }, 260)
    return () => clearTimeout(done)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-100 h-[2.5px]"
      style={{ opacity: active ? 1 : 0, transition: 'opacity .25s ease' }}
    >
      <div
        className="h-full bg-ink"
        style={{
          width: `${width}%`,
          transition: 'width .3s cubic-bezier(.22,1,.36,1)',
          boxShadow: '0 0 10px rgba(6,57,48,.45)',
        }}
      />
    </div>
  )
}
