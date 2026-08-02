'use client'

import { useEffect, useState } from 'react'

/**
 * Media query as state. Starts false on the server and settles on mount, so
 * layouts that differ by screen must tolerate one render at the desktop value.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const update = () => setMatches(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [query])

  return matches
}

export function useIsPhone(): boolean {
  return useMediaQuery('(max-width: 640px)')
}
