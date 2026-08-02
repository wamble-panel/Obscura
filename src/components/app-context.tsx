'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { AppSettings } from '@/lib/settings'
import type { Viewer } from '@/lib/types'
import { can, type Permission } from '@/lib/permissions'

type AppContextValue = {
  viewer: Viewer
  settings: AppSettings
  can: (permission: Permission | string) => boolean
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({
  viewer,
  settings,
  children,
}: {
  viewer: Viewer
  settings: AppSettings
  children: ReactNode
}) {
  const value: AppContextValue = {
    viewer,
    settings,
    can: (permission) => can(viewer.permissions, permission, viewer.profile.role_key),
  }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}

/** Renders children only when the signed-in user holds the permission. */
export function Gate({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission | string
  children: ReactNode
  fallback?: ReactNode
}) {
  const { can: allowed } = useApp()
  return <>{allowed(permission) ? children : fallback}</>
}
