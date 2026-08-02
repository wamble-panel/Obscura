import type { Metadata } from 'next'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PERMISSIONS } from '@/lib/permissions'
import { pad } from '@/lib/format'
import { FinanceView } from './finance-view'
import type { FinanceSummary, LedgerEntry, StudioSession } from '@/lib/types'

export const metadata: Metadata = { title: 'Finance' }
export const dynamic = 'force-dynamic'

const EMPTY_SUMMARY: FinanceSummary = {
  income: 0,
  expenses: 0,
  net: 0,
  session_revenue: 0,
  rental_revenue: 0,
  payroll_expense: 0,
  sessions_count: 0,
  rentals_count: 0,
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>
}) {
  await requirePermission(PERMISSIONS.financeView)
  const { y, m } = await searchParams

  const now = new Date()
  const year = Number(y) || now.getFullYear()
  const month = y || m ? Math.min(11, Math.max(0, Number(m ?? now.getMonth()))) : now.getMonth()

  const from = `${year}-${pad(month + 1)}-01`
  const to = `${month === 11 ? year + 1 : year}-${pad(month === 11 ? 1 : month + 2)}-01`

  const supabase = await createClient()
  const [entriesRes, sessionsRes, summaryRes] = await Promise.all([
    supabase
      .from('ledger_entries')
      .select('*')
      .gte('date', from)
      .lt('date', to)
      .order('date', { ascending: false }),
    supabase.from('sessions').select('*').gte('date', from).lt('date', to),
    supabase.rpc('finance_summary', { p_year: year, p_month: month + 1 }),
  ])

  const summary =
    (Array.isArray(summaryRes.data) ? summaryRes.data[0] : summaryRes.data) ?? EMPTY_SUMMARY

  return (
    <FinanceView
      entries={(entriesRes.data ?? []) as LedgerEntry[]}
      sessions={(sessionsRes.data ?? []) as StudioSession[]}
      summary={summary as FinanceSummary}
      year={year}
      month={month}
    />
  )
}
