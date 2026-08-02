'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLang, useT } from '@/components/lang-provider'
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  PageHeader,
  SearchInput,
  Segmented,
  StatCard,
  Toolbar,
} from '@/components/ui'
import { Icon } from '@/components/icons'
import { createClient } from '@/lib/supabase/client'
import { deviceFromUserAgent, formatDateTime, timeAgo, toCsv } from '@/lib/format'
import type { AuditEntry, PresenceRow } from '@/lib/types'

type Filter = 'all' | 'logins' | 'changes' | 'deletes' | 'access'

const ENTITY_LABELS: Record<string, string> = {
  sessions: 'Orders',
  session_addons: 'Order add-ons',
  rentals: 'Rentals',
  gear: 'Gear',
  projects: 'Projects',
  project_deliveries: 'Deliveries',
  clients: 'Clients',
  team_members: 'Team',
  ledger_entries: 'Finance',
  payroll: 'Payroll',
  profiles: 'Users',
  role_permissions: 'Roles',
  user_permissions: 'Permissions',
  app_settings: 'Settings',
  auth: 'Authentication',
  app: 'System',
  keepalive: 'System',
}

function actionIcon(action: string): 'plus' | 'edit' | 'trash' | 'logout' | 'shield' | 'activity' {
  if (action === 'insert') return 'plus'
  if (action === 'update') return 'edit'
  if (action === 'delete') return 'trash'
  if (action.startsWith('auth.')) return 'logout'
  if (action.startsWith('users.') || action.startsWith('roles.') || action === 'access.denied')
    return 'shield'
  return 'activity'
}

export function AuditView({
  entries: initialEntries,
  presence: initialPresence,
  totalToday,
}: {
  entries: AuditEntry[]
  presence: PresenceRow[]
  totalToday: number
}) {
  const t = useT()
  const { lang } = useLang()
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [entries, setEntries] = useState(initialEntries)
  const [presence, setPresence] = useState(initialPresence)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [live, setLive] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [exhausted, setExhausted] = useState(initialEntries.length < 60)

  const seen = useRef(new Set(initialEntries.map((e) => e.id)))

  useEffect(() => {
    setEntries(initialEntries)
    seen.current = new Set(initialEntries.map((e) => e.id))
  }, [initialEntries])

  useEffect(() => {
    setPresence(initialPresence)
  }, [initialPresence])

  // Live feed straight from Postgres.
  useEffect(() => {
    if (!live) return
    const supabase = createClient()

    const channel = supabase
      .channel('obscura-audit')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_log' },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as unknown as AuditEntry
          if (seen.current.has(row.id)) return
          seen.current.add(row.id)
          setEntries((prev) => [row, ...prev].slice(0, 400))
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence' }, () => {
        startTransition(() => router.refresh())
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [live, router])

  // Belt and braces: refresh every 45s so presence stays truthful even if the
  // realtime socket drops.
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => startTransition(() => router.refresh()), 45_000)
    return () => clearInterval(id)
  }, [live, router])

  // Recompute "is online" on the client so the dots never go stale between refreshes.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 20_000)
    return () => clearInterval(id)
  }, [])

  const isOnline = useCallback(
    (row: PresenceRow) =>
      Boolean(row.last_seen_at) &&
      Date.now() - new Date(row.last_seen_at!).getTime() < 2 * 60 * 1000,
    // tick forces a re-evaluation on a timer
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  )

  const online = presence.filter(isOnline)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries
      .filter((e) => {
        if (filter === 'logins') return e.action.startsWith('auth.')
        if (filter === 'changes') return e.action === 'insert' || e.action === 'update'
        if (filter === 'deletes') return e.action === 'delete'
        if (filter === 'access')
          return (
            e.action === 'access.denied' ||
            e.action.startsWith('users.') ||
            e.action.startsWith('roles.')
          )
        return true
      })
      .filter((e) =>
        q
          ? (e.actor_name ?? '').toLowerCase().includes(q) ||
            (e.actor_email ?? '').toLowerCase().includes(q) ||
            (e.entity_label ?? '').toLowerCase().includes(q) ||
            (e.summary ?? '').toLowerCase().includes(q) ||
            e.entity.toLowerCase().includes(q) ||
            e.action.toLowerCase().includes(q)
          : true,
      )
  }, [entries, filter, query])

  const loadMore = async () => {
    setLoadingMore(true)
    const supabase = createClient()
    const oldest = entries[entries.length - 1]?.id
    const { data } = await supabase
      .from('audit_log')
      .select('*')
      .lt('id', oldest ?? Number.MAX_SAFE_INTEGER)
      .order('id', { ascending: false })
      .limit(60)

    const rows = (data ?? []) as AuditEntry[]
    rows.forEach((r) => seen.current.add(r.id))
    setEntries((prev) => [...prev, ...rows])
    setExhausted(rows.length < 60)
    setLoadingMore(false)
  }

  const exportCsv = () => {
    const csv = toCsv(
      filtered.map((e) => ({
        when: e.created_at,
        who: e.actor_name ?? e.actor_email ?? 'system',
        action: e.action,
        entity: e.entity,
        record: e.entity_label ?? e.entity_id ?? '',
        summary: e.summary ?? '',
        changed: (e.changed_keys ?? []).join(' '),
        severity: e.severity,
        ip: e.ip ?? '',
      })),
    )
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `obscura-audit-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const describe = (e: AuditEntry) => {
    if (e.summary) return e.summary
    const verb = t(`audit.action.${e.action}`, e.action)
    const where = ENTITY_LABELS[e.entity] ?? e.entity
    return `${verb} ${where}${e.entity_label ? ` · ${e.entity_label}` : ''}`
  }

  return (
    <>
      <PageHeader
        title={t('audit.title')}
        subtitle={t('audit.sub')}
        actions={
          <>
            <button
              type="button"
              onClick={() => setLive((v) => !v)}
              className={`ob-btn ${live ? 'ob-btn-primary' : 'ob-btn-ghost'}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${live ? 'animate-pulse-soft bg-bone' : 'bg-ink/30'}`}
              />
              {t('audit.live')}
            </button>
            <button type="button" onClick={exportCsv} className="ob-btn ob-btn-ghost">
              <Icon name="download" size={15} />
              <span className="hidden sm:inline">{t('common.export')}</span>
            </button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('audit.onlineNow')}
          value={online.length}
          tone={online.length ? 'good' : 'default'}
          icon="activity"
        />
        <StatCard label={t('users.title')} value={presence.length} icon="users" />
        <StatCard label={t('common.today')} value={totalToday} icon="receipt" />
        <StatCard
          label={t('audit.filterDeletes')}
          value={entries.filter((e) => e.action === 'delete').length}
          tone={entries.some((e) => e.action === 'delete') ? 'warn' : 'default'}
          icon="trash"
        />
      </div>

      {/* ------------------------------ who is online ------------------------------ */}
      <Card className="mb-4">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="text-[14px] font-extrabold">{t('audit.onlineNow')}</h2>
          <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-ink/45">
            <span className="h-2 w-2 animate-pulse-soft rounded-full bg-moss" />
            <span className="ob-ltr">{online.length}</span>
          </span>
        </div>

        {online.length === 0 ? (
          <p className="py-5 text-center text-[12.5px] font-medium text-ink/40">
            {t('audit.nobodyOnline')}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {online.map((p) => (
              <div
                key={p.user_id}
                className="flex items-center gap-3 rounded-[14px] border border-moss/22 bg-moss/6 px-3.5 py-3"
              >
                <div className="relative flex-shrink-0">
                  <Avatar name={p.full_name ?? p.email} size={38} />
                  <span className="absolute -bottom-0.5 h-3 w-3 rounded-full border-2 border-paper bg-moss ltr:-right-0.5 rtl:-left-0.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-extrabold">
                    {p.full_name ?? p.email.split('@')[0]}
                  </div>
                  <div className="truncate text-[11px] font-semibold text-ink/50">
                    {t('audit.viewing')}{' '}
                    <span className="ob-ltr font-mono">{p.current_path ?? '—'}</span>
                  </div>
                  <div className="truncate text-[10.5px] font-semibold text-ink/40">
                    {p.device ?? deviceFromUserAgent(null)} · {t('audit.since')}{' '}
                    {timeAgo(p.online_since, lang)}
                  </div>
                </div>
                <Badge tone="neutral" className="flex-shrink-0 capitalize">
                  {p.role_key}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {presence.length > online.length && (
          <div className="mt-4 border-t border-ink/8 pt-3.5">
            <div className="ob-label mb-2">{t('users.offline')}</div>
            <div className="flex flex-wrap gap-2">
              {presence
                .filter((p) => !isOnline(p))
                .map((p) => (
                  <div
                    key={p.user_id}
                    className="flex items-center gap-2 rounded-full border border-ink/8 bg-paper/50 py-1 ltr:pl-1 ltr:pr-3 rtl:pr-1 rtl:pl-3"
                  >
                    <Avatar name={p.full_name ?? p.email} size={24} />
                    <span className="text-[11.5px] font-bold">
                      {(p.full_name ?? p.email).split(' ')[0]}
                    </span>
                    <span className="text-[10.5px] font-semibold text-ink/40">
                      {timeAgo(p.last_seen_at ?? p.last_login_at, lang)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </Card>

      {/* ------------------------------ activity ------------------------------ */}
      <Card className="p-4 sm:p-5">
        <Toolbar>
          <SearchInput value={query} onChange={setQuery} />
          <div className="ob-scroll-x">
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: t('audit.filterAll') },
                { value: 'logins', label: t('audit.filterLogins') },
                { value: 'changes', label: t('audit.filterChanges') },
                { value: 'deletes', label: t('audit.filterDeletes') },
                { value: 'access', label: t('nav.users') },
              ]}
            />
          </div>
        </Toolbar>

        {filtered.length === 0 ? (
          <EmptyState icon="activity" title={t('audit.empty')} />
        ) : (
          <div className="flex flex-col">
            {filtered.map((e) => {
              const open = expanded === e.id
              return (
                <div key={e.id} className="border-b border-ink/6 last:border-0">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : e.id)}
                    className="flex w-full items-start gap-3 py-3 text-start transition-colors hover:bg-ink/3"
                  >
                    <span
                      className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                        e.severity === 'critical'
                          ? 'bg-clay text-bone'
                          : e.severity === 'warning'
                            ? 'bg-clay/12 text-clay'
                            : 'bg-ink/8 text-ink/60'
                      }`}
                    >
                      <Icon name={actionIcon(e.action)} size={14} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-1.5">
                        <b className="text-[13px]">
                          {e.actor_name ?? e.actor_email ?? 'System'}
                        </b>
                        <span className="text-[12.5px] font-medium text-ink/65">{describe(e)}</span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] font-semibold text-ink/40">
                        <span className="ob-ltr">{formatDateTime(e.created_at, lang)}</span>
                        <span>·</span>
                        <span>{timeAgo(e.created_at, lang)}</span>
                        {e.ip && (
                          <>
                            <span>·</span>
                            <span className="ob-ltr font-mono">{e.ip}</span>
                          </>
                        )}
                      </span>
                    </span>

                    <span className="flex flex-shrink-0 items-center gap-2">
                      <Badge tone="neutral" className="hidden sm:inline-flex">
                        {ENTITY_LABELS[e.entity] ?? e.entity}
                      </Badge>
                      <Icon
                        name="chevronDown"
                        size={14}
                        className={`text-ink/30 transition-transform ${open ? 'rotate-180' : ''}`}
                      />
                    </span>
                  </button>

                  {open && (
                    <div className="pb-4 ltr:pl-11 rtl:pr-11">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="ob-tile px-3.5 py-3">
                          <div className="ob-label">{t('audit.actor')}</div>
                          <div className="ob-ltr mt-0.5 text-[12px] font-bold">
                            {e.actor_email ?? '—'}
                          </div>
                        </div>
                        <div className="ob-tile px-3.5 py-3">
                          <div className="ob-label">{t('audit.device')}</div>
                          <div className="mt-0.5 text-[12px] font-bold">
                            {deviceFromUserAgent(e.user_agent)}
                          </div>
                        </div>
                      </div>

                      {e.changed_keys && e.changed_keys.length > 0 && (
                        <div className="mt-3">
                          <div className="ob-label mb-1.5">{t('audit.changes')}</div>
                          <div className="flex flex-col gap-1">
                            {e.changed_keys.map((key) => (
                              <div
                                key={key}
                                className="flex flex-wrap items-baseline gap-2 rounded-lg bg-ink/4 px-3 py-2 text-[11.5px]"
                              >
                                <span className="font-mono font-bold">{key}</span>
                                <span className="ob-ltr text-clay line-through">
                                  {String((e.old_data ?? {})[key] ?? '—')}
                                </span>
                                <Icon name="chevronRight" size={11} className="rtl:rotate-180" />
                                <span className="ob-ltr font-bold text-moss">
                                  {String((e.new_data ?? {})[key] ?? '—')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {e.action === 'insert' && e.new_data && (
                        <details className="mt-3">
                          <summary className="ob-label cursor-pointer">{t('audit.after')}</summary>
                          <pre className="ob-scroll-x mt-1.5 rounded-lg bg-ink/4 p-3 text-[10.5px] leading-relaxed">
                            {JSON.stringify(e.new_data, null, 2)}
                          </pre>
                        </details>
                      )}
                      {e.action === 'delete' && e.old_data && (
                        <details className="mt-3">
                          <summary className="ob-label cursor-pointer">{t('audit.before')}</summary>
                          <pre className="ob-scroll-x mt-1.5 rounded-lg bg-clay/6 p-3 text-[10.5px] leading-relaxed">
                            {JSON.stringify(e.old_data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {!exhausted && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="ob-btn ob-btn-ghost mt-4 w-full"
          >
            {loadingMore ? t('common.loading') : t('audit.loadMore')}
          </button>
        )}
      </Card>
    </>
  )
}
