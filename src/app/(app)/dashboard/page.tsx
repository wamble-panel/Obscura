import type { Metadata } from 'next'
import Link from 'next/link'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getSettings } from '@/lib/settings'
import { getT } from '@/lib/lang-server'
import { PERMISSIONS, can } from '@/lib/permissions'
import { getViewer } from '@/lib/auth'
import { egp, formatDate, formatHour, todayKey, usd } from '@/lib/format'
import { Card, StatCard } from '@/components/ui'
import { Icon } from '@/components/icons'
import type { FinanceSummary, Rental, StudioSession } from '@/lib/types'

export const metadata: Metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  await requirePermission(PERMISSIONS.dashboardView)
  const viewer = (await getViewer())!
  const { t, lang } = await getT()
  const { studio } = await getSettings()

  const supabase = await createClient()
  const today = todayKey()
  const now = new Date()

  const allowed = (permission: string) =>
    can(viewer.permissions, permission, viewer.profile.role_key)

  const [todayRes, upcomingRes, rentalsRes, projectsRes, meRes, summaryRes] = await Promise.all([
    allowed(PERMISSIONS.ordersView)
      ? supabase.from('sessions').select('*').eq('date', today).order('start_hour')
      : Promise.resolve({ data: [] }),
    allowed(PERMISSIONS.ordersView)
      ? supabase
          .from('sessions')
          .select('*')
          .gt('date', today)
          .neq('status', 'cancelled')
          .order('date')
          .limit(5)
      : Promise.resolve({ data: [] }),
    allowed(PERMISSIONS.rentalsView)
      ? supabase.from('rentals').select('*').in('status', ['active', 'overdue']).order('due_date')
      : Promise.resolve({ data: [] }),
    allowed(PERMISSIONS.projectsView)
      ? supabase.from('v_project_progress').select('*').neq('status', 'archived')
      : Promise.resolve({ data: [] }),
    supabase.from('team_members').select('id').eq('profile_id', viewer.profile.id).maybeSingle(),
    allowed(PERMISSIONS.financeView)
      ? supabase.rpc('finance_summary', {
          p_year: now.getFullYear(),
          p_month: now.getMonth() + 1,
        })
      : Promise.resolve({ data: null }),
  ])

  const todaySessions = (todayRes.data ?? []) as StudioSession[]
  const upcoming = (upcomingRes.data ?? []) as StudioSession[]
  const rentals = (rentalsRes.data ?? []) as Rental[]
  const projects = (projectsRes.data ?? []) as {
    id: string
    client_name: string
    title: string
    total_videos: number
    delivered: number
    pct: number
    status: string
    assignee_member_id: string | null
  }[]
  const myMemberId = (meRes.data as { id: string } | null)?.id ?? null
  const myProjects = myMemberId
    ? projects.filter((p) => p.assignee_member_id === myMemberId && p.delivered < p.total_videos)
    : []
  const summary = (Array.isArray(summaryRes.data) ? summaryRes.data[0] : summaryRes.data) as
    | FinanceSummary
    | null

  const overdue = rentals.filter((r) => r.due_date < today)
  const income = summary ? Number(summary.income) + Number(summary.session_revenue) : 0
  const net = summary ? income - Number(summary.expenses) : 0
  const videosDue = projects.reduce(
    (sum, p) => sum + Math.max(0, p.total_videos - (p.delivered ?? 0)),
    0,
  )

  const greeting = viewer.profile.full_name?.split(' ')[0] ?? viewer.profile.email

  const quickActions = [
    { href: '/calendar', label: t('orders.book'), icon: 'plus' as const, permission: PERMISSIONS.ordersCreate },
    { href: '/rentals', label: t('rentals.new'), icon: 'truck' as const, permission: PERMISSIONS.rentalsCreate },
    { href: '/finance', label: t('finance.new'), icon: 'wallet' as const, permission: PERMISSIONS.financeCreate },
    { href: '/gear', label: t('gear.new'), icon: 'camera' as const, permission: PERMISSIONS.gearCreate },
  ].filter((a) => allowed(a.permission))

  return (
    <>
      <div className="mb-5">
        <h1 className="text-[23px] font-extrabold tracking-[-0.5px]">
          {t('dash.title')} · {greeting}
        </h1>
        <p className="mt-0.5 text-[12.5px] font-medium text-ink/55">
          {studio.branch} · {formatDate(today, lang)}
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {allowed(PERMISSIONS.financeView) && (
          <StatCard
            label={t('dash.netProfit')}
            value={egp(net)}
            sub={usd(net, studio.usd_rate)}
            tone="dark"
            icon="wallet"
          />
        )}
        {allowed(PERMISSIONS.ordersView) && (
          <StatCard
            label={t('dash.todaySessions')}
            value={todaySessions.length}
            sub={`${todaySessions.reduce((s, x) => s + x.hours, 0)}h`}
            icon="calendar"
          />
        )}
        {allowed(PERMISSIONS.rentalsView) && (
          <StatCard
            label={t('dash.gearOut')}
            value={rentals.length}
            sub={overdue.length ? `${overdue.length} ${t('rentals.overdue').toLowerCase()}` : undefined}
            tone={overdue.length ? 'warn' : 'default'}
            icon="truck"
          />
        )}
        {allowed(PERMISSIONS.projectsView) && (
          <StatCard
            label={t('dash.videosDue')}
            value={videosDue}
            sub={`${projects.filter((p) => p.status === 'active').length} ${t('dash.activeProjects').toLowerCase()}`}
            icon="folder"
          />
        )}
      </div>

      {quickActions.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {quickActions.map((a) => (
            <Link key={a.href} href={a.href} className="ob-btn ob-btn-ghost bg-paper/60">
              <Icon name={a.icon} size={15} />
              {a.label}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {allowed(PERMISSIONS.ordersView) && (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-extrabold">{t('dash.todaySessions')}</h2>
              <Link href="/calendar" className="text-[12px] font-bold text-ink/50 hover:text-ink">
                {t('common.view')} →
              </Link>
            </div>
            {todaySessions.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] font-medium text-ink/40">
                {t('dash.noSessionsToday')}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {todaySessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-[14px] border border-ink/8 px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-extrabold">{s.client_name}</div>
                      <div className="ob-ltr mt-0.5 text-[11.5px] font-semibold text-ink/50">
                        {formatHour(s.start_hour)} – {formatHour(s.start_hour + s.hours)}
                      </div>
                    </div>
                    <span className="ob-ltr flex-shrink-0 text-[13px] font-extrabold">
                      {egp(s.total_amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {allowed(PERMISSIONS.ordersView) && (
          <Card className="bg-ink text-sand">
            <h2 className="text-[14px] font-extrabold opacity-80">{t('dash.upcoming')}</h2>
            {upcoming.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] font-medium opacity-50">
                {t('orders.empty')}
              </p>
            ) : (
              <div className="mt-3.5 flex flex-col gap-3">
                {upcoming.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-bold">{s.client_name}</div>
                      <div className="ob-ltr text-[11px] opacity-65">
                        {formatDate(s.date, lang, 'short')} · {formatHour(s.start_hour)}
                      </div>
                    </div>
                    <span className="ob-ltr flex-shrink-0 text-[12px] font-bold opacity-90">
                      {egp(s.total_amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {myProjects.length > 0 && (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-extrabold">{t('projects.yourProjects')}</h2>
              <Link href="/projects" className="text-[12px] font-bold text-ink/50 hover:text-ink">
                {t('common.view')} →
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {myProjects.map((p) => (
                <Link
                  key={p.id}
                  href="/projects"
                  className="flex items-center justify-between gap-3 rounded-[14px] border border-ink/8 px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-extrabold">{p.client_name}</div>
                    <div className="truncate text-[11.5px] font-semibold text-ink/50">
                      {p.title}
                    </div>
                  </div>
                  <span className="ob-ltr flex-shrink-0 text-[12.5px] font-extrabold">
                    {p.delivered}/{p.total_videos}
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        )}

        {allowed(PERMISSIONS.rentalsView) && rentals.length > 0 && (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-extrabold">{t('dash.gearOut')}</h2>
              <Link href="/rentals" className="text-[12px] font-bold text-ink/50 hover:text-ink">
                {t('common.view')} →
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {rentals.slice(0, 6).map((r) => {
                const late = r.due_date < today
                return (
                  <div
                    key={r.id}
                    className={`flex items-center justify-between gap-3 rounded-[14px] border px-3.5 py-3 ${
                      late ? 'border-clay/25 bg-clay/6' : 'border-ink/8'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-bold">{r.gear_name}</div>
                      <div className="truncate text-[11.5px] font-semibold text-ink/50">
                        {r.renter_name}
                      </div>
                    </div>
                    <span
                      className={`ob-ltr flex-shrink-0 text-[11.5px] font-bold ${
                        late ? 'text-clay' : 'text-ink/50'
                      }`}
                    >
                      {formatDate(r.due_date, lang, 'short')}
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {allowed(PERMISSIONS.financeView) && summary && (
          <Card>
            <h2 className="mb-3 text-[14px] font-extrabold">{t('dash.monthRevenue')}</h2>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-ink/60">{t('dash.income')}</span>
                <span className="ob-ltr text-[13.5px] font-extrabold text-moss">{egp(income)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-ink/60">
                  {t('dash.expenses')}
                </span>
                <span className="ob-ltr text-[13.5px] font-extrabold text-clay">
                  {egp(summary.expenses)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-ink/8 pt-2.5">
                <span className="text-[13px] font-bold">{t('finance.net')}</span>
                <span
                  className={`ob-ltr text-[16px] font-extrabold ${net >= 0 ? 'text-moss' : 'text-clay'}`}
                >
                  {egp(net)}
                </span>
              </div>
            </div>
          </Card>
        )}
      </div>
    </>
  )
}
