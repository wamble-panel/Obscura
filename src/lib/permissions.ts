/**
 * Every permission in the system, mirrored from supabase/schema.sql.
 * The database is the enforcer (row level security); this file is what the UI
 * uses to decide what to show. Keep the two in sync.
 */

export const PERMISSIONS = {
  dashboardView: 'dashboard.view',

  ordersView: 'orders.view',
  ordersCreate: 'orders.create',
  ordersEdit: 'orders.edit',
  ordersDelete: 'orders.delete',

  rentalsView: 'rentals.view',
  rentalsCreate: 'rentals.create',
  rentalsEdit: 'rentals.edit',
  rentalsDelete: 'rentals.delete',

  gearView: 'gear.view',
  gearCreate: 'gear.create',
  gearEdit: 'gear.edit',
  gearDelete: 'gear.delete',

  projectsView: 'projects.view',
  projectsCreate: 'projects.create',
  projectsEdit: 'projects.edit',
  projectsDelete: 'projects.delete',
  projectsDeliver: 'projects.deliver',

  clientsView: 'clients.view',
  clientsCreate: 'clients.create',
  clientsEdit: 'clients.edit',
  clientsDelete: 'clients.delete',

  financeView: 'finance.view',
  financeCreate: 'finance.create',
  financeEdit: 'finance.edit',
  financeDelete: 'finance.delete',

  teamView: 'team.view',
  teamCreate: 'team.create',
  teamEdit: 'team.edit',
  teamDelete: 'team.delete',
  teamPayroll: 'team.payroll',

  settingsView: 'settings.view',
  settingsEdit: 'settings.edit',

  usersView: 'users.view',
  usersManage: 'users.manage',

  auditView: 'audit.view',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const PERMISSION_MODULES = [
  'dashboard',
  'orders',
  'rentals',
  'gear',
  'projects',
  'clients',
  'finance',
  'team',
  'settings',
  'users',
  'audit',
] as const

export type PermissionModule = (typeof PERMISSION_MODULES)[number]

export type RoleKey =
  | 'admin'
  | 'manager'
  | 'coordinator'
  | 'accountant'
  | 'editor'
  | 'photographer'
  | 'viewer'

export const ROLE_ORDER: RoleKey[] = [
  'admin',
  'manager',
  'accountant',
  'coordinator',
  'editor',
  'photographer',
  'viewer',
]

/** Admins hold every permission implicitly — same rule the database applies. */
export function can(
  permissions: string[] | null | undefined,
  permission: Permission | string,
  roleKey?: string | null,
): boolean {
  if (roleKey === 'admin') return true
  if (!permissions) return false
  return permissions.includes(permission)
}

export function canAny(
  permissions: string[] | null | undefined,
  wanted: (Permission | string)[],
  roleKey?: string | null,
): boolean {
  if (roleKey === 'admin') return true
  if (!permissions) return false
  return wanted.some((p) => permissions.includes(p))
}

/* ---------------------------------------------------------------------------
 * Navigation. Each entry names the permission that unlocks it, so a page and
 * its nav link can never drift apart.
 * ------------------------------------------------------------------------- */

export type NavItem = {
  href: string
  labelKey: string
  icon: string
  permission: Permission
  group: 'studio' | 'business' | 'admin'
  mobile?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: 'gauge', permission: PERMISSIONS.dashboardView, group: 'studio', mobile: true },
  { href: '/calendar',  labelKey: 'nav.calendar',  icon: 'calendar', permission: PERMISSIONS.ordersView, group: 'studio', mobile: true },
  { href: '/orders',    labelKey: 'nav.orders',    icon: 'receipt', permission: PERMISSIONS.ordersView, group: 'studio' },
  { href: '/rentals',   labelKey: 'nav.rentals',   icon: 'truck', permission: PERMISSIONS.rentalsView, group: 'studio', mobile: true },
  { href: '/gear',      labelKey: 'nav.gear',      icon: 'camera', permission: PERMISSIONS.gearView, group: 'studio', mobile: true },
  { href: '/projects',  labelKey: 'nav.projects',  icon: 'folder', permission: PERMISSIONS.projectsView, group: 'business' },
  { href: '/clients',   labelKey: 'nav.clients',   icon: 'users', permission: PERMISSIONS.clientsView, group: 'business' },
  { href: '/finance',   labelKey: 'nav.finance',   icon: 'wallet', permission: PERMISSIONS.financeView, group: 'business', mobile: true },
  { href: '/team',      labelKey: 'nav.team',      icon: 'team', permission: PERMISSIONS.teamView, group: 'business' },
  { href: '/admin/users', labelKey: 'nav.users',   icon: 'shield', permission: PERMISSIONS.usersView, group: 'admin' },
  { href: '/admin/audit', labelKey: 'nav.audit',   icon: 'activity', permission: PERMISSIONS.auditView, group: 'admin' },
  { href: '/settings',  labelKey: 'nav.settings',  icon: 'settings', permission: PERMISSIONS.settingsView, group: 'admin' },
]

/** The permission a given URL requires — used by the layout guard. */
export function permissionForPath(pathname: string): Permission | null {
  const match = NAV_ITEMS.filter((item) => pathname.startsWith(item.href)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0]
  return match ? match.permission : null
}

/** Where to send someone after login, given what they're allowed to see. */
export function landingPath(permissions: string[], roleKey?: string | null): string {
  const allowed = NAV_ITEMS.find((item) => can(permissions, item.permission, roleKey))
  return allowed ? allowed.href : '/no-access'
}
