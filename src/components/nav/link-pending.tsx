'use client'

import { useLinkStatus } from 'next/link'
import { useEffect } from 'react'

/**
 * Placed inside a <Link>, this reports that link's own pending state.
 *
 * Next gives us `useLinkStatus`, which is true from the moment a link is
 * clicked until its route has finished streaming. Showing it on the link the
 * person actually tapped is more useful than a generic global spinner — you
 * can see *which* thing is loading.
 */
export function LinkPending({ onChange }: { onChange?: (pending: boolean) => void }) {
  const { pending } = useLinkStatus()

  useEffect(() => {
    onChange?.(pending)
  }, [pending, onChange])

  if (!pending) return null

  return (
    <span
      role="status"
      aria-label="Loading"
      className="ms-auto inline-block h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent opacity-60"
    />
  )
}

/** A slim bar across the top of the tapped item, for the bottom tab bar. */
export function LinkPendingBar() {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return (
    <span
      aria-hidden="true"
      className="absolute inset-x-3 top-0 h-0.5 overflow-hidden rounded-full bg-ink/15"
    >
      <span className="block h-full w-1/3 animate-[navSlide_.9s_ease-in-out_infinite] rounded-full bg-ink" />
    </span>
  )
}
