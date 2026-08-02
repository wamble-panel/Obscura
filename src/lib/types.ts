import type { RoleKey } from './permissions'

export type GearStatus = 'in' | 'out' | 'maint'
export type SessionPackage = 'hourly' | 'half' | 'full'
export type SessionStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled'
export type RentalStatus = 'active' | 'returned' | 'overdue' | 'cancelled'
export type LedgerType = 'in' | 'out'

export type AccountStatus = 'active' | 'pending' | 'suspended'

export type Profile = {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  avatar_url: string | null
  role_key: RoleKey
  is_active: boolean
  status: AccountStatus
  suspended_at: string | null
  suspended_reason: string | null
  suspended_by: string | null
  title: string | null
  created_at: string
  updated_at: string
  last_login_at: string | null
}

export type Role = {
  key: string
  label: string
  description: string | null
  rank: number
  is_system: boolean
}

export type PermissionRow = {
  key: string
  module: string
  label: string
  description: string | null
  sort: number
}

export type Client = {
  id: string
  name: string
  company: string | null
  phone: string | null
  email: string | null
  notes: string | null
  is_archived: boolean
  created_at: string
}

export type Gear = {
  id: string
  name: string
  category: string
  note: string | null
  qty: number
  rate: number
  status: GearStatus
  serial: string | null
  image_url: string | null
  is_archived: boolean
  created_at: string
}

export type SessionAddon = {
  id: string
  session_id: string
  gear_id: string | null
  name: string
  price: number
}

export type StudioSession = {
  id: string
  code: string
  client_id: string | null
  client_name: string
  phone: string | null
  shoot_type: string
  date: string
  start_hour: number
  package: SessionPackage
  hours: number
  base_amount: number
  addons_amount: number
  total_amount: number
  deposit_paid: boolean
  deposit_amount: number
  status: SessionStatus
  notes: string | null
  created_by: string | null
  created_at: string
  session_addons?: SessionAddon[]
}

export type Rental = {
  id: string
  code: string
  gear_id: string
  gear_name: string
  client_id: string | null
  renter_name: string
  renter_phone: string | null
  qty: number
  start_date: string
  due_date: string
  returned_at: string | null
  fee: number
  deposit: number
  status: RentalStatus
  condition_out: string | null
  condition_in: string | null
  notes: string | null
  created_at: string
}

export type Project = {
  id: string
  client_id: string | null
  client_name: string
  title: string
  value: number
  total_videos: number
  deadline: string | null
  status: string
  notes: string | null
  created_at: string
}

export type ProjectProgress = Project & {
  delivered: number
  remaining: number
  pct: number
}

export type TeamMember = {
  id: string
  profile_id: string | null
  name: string
  role_title: string
  salary: number
  per_video: number
  phone: string | null
  is_active: boolean
  created_at: string
}

export type MemberOutput = TeamMember & {
  delivered: number
  video_payout: number
}

export type ProjectDelivery = {
  id: string
  project_id: string
  member_id: string | null
  member_name: string | null
  count: number
  note: string | null
  created_at: string
}

export type LedgerEntry = {
  id: string
  type: LedgerType
  category: string
  label: string
  amount: number
  date: string
  method: string | null
  ref_type: string | null
  ref_id: string | null
  notes: string | null
  created_at: string
}

export type PayrollRow = {
  id: string
  member_id: string
  member_name: string
  period: string
  amount: number
  bonus: number
  paid_at: string | null
  paid_by: string | null
  notes: string | null
}

export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'void'

export type InvoiceItem = {
  id: string
  invoice_id: string
  description: string
  qty: number
  unit_price: number
  amount: number
  ref_type: string | null
  ref_id: string | null
  sort: number
}

export type Invoice = {
  id: string
  number: string
  client_id: string | null
  client_name: string
  client_company: string | null
  client_phone: string | null
  client_email: string | null
  client_address: string | null
  issue_date: string
  due_date: string | null
  subtotal: number
  discount: number
  tax_rate: number
  tax_amount: number
  total: number
  status: InvoiceStatus
  notes: string | null
  terms: string | null
  share_token: string | null
  share_enabled: boolean
  share_expires_at: string | null
  share_views: number
  share_last_viewed_at: string | null
  created_at: string
  updated_at: string
}

export type InvoiceBalance = Invoice & {
  paid_amount: number
  balance: number
  item_count: number
}

export type Payment = {
  id: string
  invoice_id: string | null
  client_id: string | null
  client_name: string | null
  amount: number
  method: string
  paid_at: string
  reference: string | null
  notes: string | null
  post_to_ledger: boolean
  created_at: string
}

export type AuditEntry = {
  id: number
  created_at: string
  actor_id: string | null
  actor_email: string | null
  actor_name: string | null
  action: string
  entity: string
  entity_id: string | null
  entity_label: string | null
  summary: string | null
  changed_keys: string[] | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  severity: 'info' | 'warning' | 'critical'
  ip: string | null
  user_agent: string | null
  path: string | null
}

export type PresenceRow = {
  user_id: string
  email: string
  full_name: string | null
  role_key: RoleKey
  is_active: boolean
  last_seen_at: string | null
  online_since: string | null
  current_path: string | null
  device: string | null
  ip: string | null
  is_online: boolean
  last_login_at: string | null
}

export type StudioSettings = {
  name: string
  branch: string
  currency: string
  usd_rate: number
  open_hour: number
  close_hour: number
  timezone: string
}

export type PricingSettings = {
  hourly_rate: number
  hourly_min_hours: number
  half_day_price: number
  half_day_hours: number
  full_day_price: number
  full_day_hours: number
  deposit_pct: number
}

export type FinanceSummary = {
  income: number
  expenses: number
  net: number
  session_revenue: number
  rental_revenue: number
  payroll_expense: number
  sessions_count: number
  rentals_count: number
}

/** What every page gets about the person looking at it. */
export type Viewer = {
  profile: Profile
  permissions: string[]
  isAdmin: boolean
}

export type ActionResult = {
  ok: boolean
  error?: string
  message?: string
}
