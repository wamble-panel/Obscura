'use client'

import { useMemo, useState, useTransition } from 'react'
import { useApp } from '@/components/app-context'
import { useLang, useT } from '@/components/lang-provider'
import {
  Avatar,
  Badge,
  Card,
  ConfirmButton,
  Drawer,
  Field,
  Modal,
  PageHeader,
  SearchInput,
  Segmented,
  StatCard,
  SubmitButton,
  Toolbar,
  useToast,
} from '@/components/ui'
import { Icon } from '@/components/icons'
import { PERMISSIONS, ROLE_ORDER } from '@/lib/permissions'
import { timeAgo } from '@/lib/format'
import {
  clearUserOverrides,
  deleteUser,
  inviteUser,
  setRolePermission,
  setUserActive,
  setUserPermission,
  setUserRole,
  setUserSuspended,
} from '@/server/users'
import type { PermissionRow, PresenceRow, Profile, Role } from '@/lib/types'

type Tab = 'people' | 'roles'

type Override = { permission_key: string; granted: boolean }

export function UsersView({
  profiles,
  roles,
  permissions,
  rolePermissions,
  userPermissions,
  presence,
  serviceRoleAvailable,
}: {
  profiles: Profile[]
  roles: Role[]
  permissions: PermissionRow[]
  rolePermissions: { role_key: string; permission_key: string }[]
  userPermissions: { user_id: string; permission_key: string; granted: boolean }[]
  presence: PresenceRow[]
  serviceRoleAvailable: boolean
}) {
  const t = useT()
  const { lang } = useLang()
  const toast = useToast()
  const { viewer } = useApp()
  const [pending, start] = useTransition()

  const [tab, setTab] = useState<Tab>('people')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roleTab, setRoleTab] = useState<string>('manager')

  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [roleKey, setRoleKey] = useState('coordinator')
  const [password, setPassword] = useState('')
  const [suspendFor, setSuspendFor] = useState<Profile | null>(null)
  const [suspendReason, setSuspendReason] = useState('')

  const modules = useMemo(() => {
    const map = new Map<string, PermissionRow[]>()
    for (const p of [...permissions].sort((a, b) => a.sort - b.sort)) {
      const list = map.get(p.module) ?? []
      list.push(p)
      map.set(p.module, list)
    }
    return [...map.entries()]
  }, [permissions])

  const roleGrants = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const rp of rolePermissions) {
      const set = map.get(rp.role_key) ?? new Set<string>()
      set.add(rp.permission_key)
      map.set(rp.role_key, set)
    }
    return map
  }, [rolePermissions])

  const overridesFor = (userId: string): Map<string, boolean> =>
    new Map(
      userPermissions.filter((u) => u.user_id === userId).map((u) => [u.permission_key, u.granted]),
    )

  const presenceFor = (userId: string) => presence.find((p) => p.user_id === userId)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return profiles
    return profiles.filter(
      (p) => p.email.toLowerCase().includes(q) || (p.full_name ?? '').toLowerCase().includes(q),
    )
  }, [profiles, query])

  const selected = profiles.find((p) => p.id === selectedId) ?? null
  const selectedOverrides = selected ? overridesFor(selected.id) : new Map<string, boolean>()

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const result = await fn()
      if (!result.ok) {
        toast(result.error ?? t('toast.error'), 'error')
      } else if (result.message) {
        toast(result.message)
      }
    })

  const submitInvite = () => {
    setError(null)
    start(async () => {
      const result = await inviteUser({ email, fullName, roleKey, password })
      if (result.ok) {
        toast(t('users.inviteSent'))
        setInviteOpen(false)
        setEmail('')
        setFullName('')
        setPassword('')
      } else {
        setError(result.error ?? t('toast.error'))
      }
    })
  }

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    const bytes = new Uint32Array(14)
    crypto.getRandomValues(bytes)
    setPassword([...bytes].map((b) => chars[b % chars.length]).join(''))
  }

  const pendingCount = profiles.filter((p) => !p.is_active).length
  const onlineCount = presence.filter((p) => p.is_online).length

  return (
    <>
      <PageHeader
        title={t('users.title')}
        subtitle={t('users.sub')}
        actions={
          <button
            type="button"
            onClick={() => {
              setError(null)
              generatePassword()
              setInviteOpen(true)
            }}
            className="ob-btn ob-btn-primary"
          >
            <Icon name="plus" size={15} />
            {t('users.invite')}
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label={t('users.title')} value={profiles.length} icon="users" />
        <StatCard
          label={t('users.online')}
          value={onlineCount}
          tone={onlineCount ? 'good' : 'default'}
          icon="activity"
        />
        <StatCard
          label={t('users.pending')}
          value={pendingCount}
          tone={pendingCount ? 'warn' : 'default'}
          icon="clock"
        />
      </div>

      <Toolbar>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'people', label: t('users.title') },
            { value: 'roles', label: t('users.roleDefaults') },
          ]}
        />
      </Toolbar>

      {tab === 'people' ? (
        <Card className="p-4 sm:p-5">
          <Toolbar>
            <SearchInput value={query} onChange={setQuery} />
          </Toolbar>

          <div className="flex flex-col gap-2">
            {filtered.map((p) => {
              const pres = presenceFor(p.id)
              const overrides = overridesFor(p.id).size
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className="flex items-center gap-3 rounded-[14px] border border-ink/8 bg-paper/50 px-4 py-3.5 text-start transition-colors hover:bg-paper"
                >
                  <div className="relative flex-shrink-0">
                    <Avatar name={p.full_name ?? p.email} size={40} />
                    {pres?.is_online && (
                      <span className="absolute -bottom-0.5 h-3 w-3 rounded-full border-2 border-paper bg-moss ltr:-right-0.5 rtl:-left-0.5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[13.5px] font-extrabold">
                        {p.full_name ?? p.email.split('@')[0]}
                      </span>
                      {p.id === viewer.profile.id && (
                        <Badge tone="neutral">{t('common.you')}</Badge>
                      )}
                      {p.status === 'suspended' ? (
                        <Badge tone="bad">{t('users.suspended')}</Badge>
                      ) : (
                        !p.is_active && <Badge tone="warn">{t('users.pending')}</Badge>
                      )}
                      {overrides > 0 && (
                        <Badge tone="gold">
                          <span className="ob-ltr">{overrides}</span> {t('users.override')}
                        </Badge>
                      )}
                    </div>
                    <div className="ob-ltr truncate text-[11.5px] font-semibold text-ink/50">
                      {p.email}
                    </div>
                    <div className="mt-0.5 text-[11.5px] font-semibold text-ink/40">
                      {pres?.is_online
                        ? `${t('users.online')} · ${pres.current_path ?? ''}`
                        : `${t('users.lastSeen')} ${timeAgo(pres?.last_seen_at ?? p.last_login_at, lang)}`}
                    </div>
                  </div>
                  <Badge tone={p.role_key === 'admin' ? 'ink' : 'neutral'} className="flex-shrink-0">
                    {roles.find((r) => r.key === p.role_key)?.label ?? p.role_key}
                  </Badge>
                </button>
              )
            })}
          </div>
        </Card>
      ) : (
        <Card className="p-4 sm:p-5">
          <div className="ob-scroll-x mb-4">
            <div className="flex gap-1.5">
              {ROLE_ORDER.filter((r) => r !== 'admin').map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleTab(r)}
                  data-on={roleTab === r}
                  className="ob-chip"
                >
                  {roles.find((x) => x.key === r)?.label ?? r}
                </button>
              ))}
            </div>
          </div>

          <p className="mb-4 text-[12.5px] font-medium text-ink/55">
            {roles.find((r) => r.key === roleTab)?.description}
          </p>

          <div className="flex flex-col gap-4">
            {modules.map(([moduleName, perms]) => (
              <div key={moduleName}>
                <div className="ob-label mb-2">{moduleName}</div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {perms.map((perm) => {
                    const on = roleGrants.get(roleTab)?.has(perm.key) ?? false
                    return (
                      <label
                        key={perm.key}
                        className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-ink/8 px-3.5 py-2.5 transition-colors hover:bg-ink/3"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={pending}
                          onChange={(e) =>
                            run(() => setRolePermission(roleTab, perm.key, e.target.checked))
                          }
                          className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#063930]"
                        />
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-bold">{perm.label}</span>
                          <span className="block text-[11px] font-medium text-ink/45">
                            {perm.description}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ------------------------------ user detail ------------------------------ */}
      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={t('users.editPermissions')}
        footer={
          selected &&
          selected.id !== viewer.profile.id && (
            <>
              {selected.status === 'suspended' ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => setUserSuspended(selected.id, false))}
                  className="ob-btn ob-btn-primary flex-1"
                >
                  {t('users.reinstate')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setUserActive(selected.id, !selected.is_active))}
                    className={`ob-btn flex-1 ${selected.is_active ? 'ob-btn-ghost' : 'ob-btn-primary'}`}
                  >
                    {selected.is_active ? t('users.deactivate') : t('users.activate')}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setSuspendReason('')
                      setSuspendFor(selected)
                    }}
                    className="ob-btn ob-btn-danger flex-1"
                  >
                    {t('users.suspend')}
                  </button>
                </>
              )}
              <ConfirmButton
                onConfirm={() =>
                  start(async () => {
                    const result = await deleteUser(selected.id)
                    toast(
                      result.ok ? (result.message ?? t('toast.deleted')) : (result.error ?? t('toast.error')),
                      result.ok ? 'ok' : 'error',
                    )
                    if (result.ok) setSelectedId(null)
                  })
                }
                disabled={pending}
                className="flex-shrink-0 px-4"
              >
                <Icon name="trash" size={15} />
              </ConfirmButton>
            </>
          )
        }
      >
        {selected && (
          <>
            <div className="flex items-center gap-3">
              <Avatar name={selected.full_name ?? selected.email} size={48} />
              <div className="min-w-0">
                <div className="truncate text-[17px] font-extrabold">
                  {selected.full_name ?? selected.email.split('@')[0]}
                </div>
                <div className="ob-ltr truncate text-[12px] font-semibold text-ink/55">
                  {selected.email}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <div className="ob-tile px-3.5 py-3">
                <div className="ob-label">{t('users.lastLogin')}</div>
                <div className="mt-0.5 text-[12.5px] font-bold">
                  {timeAgo(selected.last_login_at, lang)}
                </div>
              </div>
              <div className="ob-tile px-3.5 py-3">
                <div className="ob-label">{t('common.status')}</div>
                <div className="mt-0.5 text-[12.5px] font-bold">
                  {selected.status === 'suspended'
                    ? t('users.suspended')
                    : selected.is_active
                      ? t('users.active')
                      : t('users.inactive')}
                </div>
              </div>
            </div>

            {selected.status === 'suspended' && (
              <div className="mt-3 rounded-xl border border-clay/25 bg-clay/8 px-4 py-3">
                <div className="ob-label text-clay">{t('users.suspendedOn')}</div>
                <div className="ob-ltr mt-0.5 text-[12.5px] font-bold">
                  {timeAgo(selected.suspended_at, lang)}
                </div>
                {selected.suspended_reason && (
                  <div className="mt-1 text-[12px] font-semibold text-ink/60">
                    {selected.suspended_reason}
                  </div>
                )}
              </div>
            )}

            {selected.id === viewer.profile.id && (
              <div className="mt-4 rounded-xl bg-gold/12 px-4 py-3 text-[12px] font-semibold text-olive">
                {t('users.cannotEditSelf')}
              </div>
            )}

            <Field label={t('users.role')} className="mt-5">
              <select
                className="ob-input"
                value={selected.role_key}
                disabled={pending || selected.id === viewer.profile.id}
                onChange={(e) => run(() => setUserRole(selected.id, e.target.value))}
              >
                {ROLE_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {roles.find((x) => x.key === r)?.label ?? r}
                  </option>
                ))}
              </select>
            </Field>

            <div className="mt-5 flex items-center justify-between">
              <div className="ob-label">{t('users.permissions')}</div>
              {selectedOverrides.size > 0 && selected.id !== viewer.profile.id && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => clearUserOverrides(selected.id))}
                  className="text-[11.5px] font-bold text-ink/55 hover:text-ink"
                >
                  {t('users.resetOverrides')}
                </button>
              )}
            </div>

            {selected.role_key === 'admin' ? (
              <div className="mt-2 rounded-xl bg-ink/6 px-4 py-3 text-[12.5px] font-semibold text-ink/60">
                Admins hold every permission.
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-4">
                {modules.map(([moduleName, perms]) => (
                  <div key={moduleName}>
                    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.6px] text-ink/35">
                      {moduleName}
                    </div>
                    <div className="flex flex-col gap-1">
                      {perms.map((perm) => {
                        const fromRole = roleGrants.get(selected.role_key)?.has(perm.key) ?? false
                        const override = selectedOverrides.get(perm.key)
                        const effective = override ?? fromRole
                        const isOverridden = override !== undefined
                        return (
                          <button
                            key={perm.key}
                            type="button"
                            disabled={pending || selected.id === viewer.profile.id}
                            onClick={() => {
                              // cycle: role default -> opposite of role -> back to default
                              const next = isOverridden ? null : !fromRole
                              run(() => setUserPermission(selected.id, perm.key, next))
                            }}
                            className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-start transition-colors disabled:opacity-60 ${
                              isOverridden
                                ? effective
                                  ? 'border-moss/35 bg-moss/8'
                                  : 'border-clay/35 bg-clay/8'
                                : 'border-ink/8 hover:bg-ink/3'
                            }`}
                          >
                            <span
                              className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md ${
                                effective ? 'bg-ink text-bone' : 'border border-ink/20'
                              }`}
                            >
                              {effective && <Icon name="check" size={12} />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[12.5px] font-bold">{perm.label}</span>
                              <span className="block text-[10.5px] font-semibold text-ink/40">
                                {isOverridden
                                  ? effective
                                    ? t('users.overrideOn')
                                    : t('users.overrideOff')
                                  : t('users.fromRole')}
                              </span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Drawer>

      {/* ------------------------------ suspend ------------------------------ */}
      <Modal
        open={Boolean(suspendFor)}
        onClose={() => setSuspendFor(null)}
        title={t('users.suspend')}
        subtitle={suspendFor?.full_name ?? suspendFor?.email}
        footer={
          <>
            <button
              type="button"
              onClick={() => setSuspendFor(null)}
              className="ob-btn ob-btn-ghost flex-1"
            >
              {t('common.cancel')}
            </button>
            <SubmitButton
              type="button"
              variant="danger"
              pending={pending}
              onClick={() => {
                if (!suspendFor) return
                start(async () => {
                  const result = await setUserSuspended(suspendFor.id, true, suspendReason)
                  toast(
                    result.ok
                      ? (result.message ?? t('toast.saved'))
                      : (result.error ?? t('toast.error')),
                    result.ok ? 'ok' : 'error',
                  )
                  if (result.ok) {
                    setSuspendFor(null)
                    setSelectedId(null)
                  }
                })
              }}
              className="flex-[1.6]"
            >
              {t('users.suspend')}
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4 pb-4">
          <div className="rounded-xl bg-clay/10 px-4 py-3 text-[12.5px] font-semibold text-clay">
            {t('users.suspendHint')}
          </div>
          <Field label={t('users.suspendReason')} hint={t('common.optional')}>
            <input
              className="ob-input"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
            />
          </Field>
        </div>
      </Modal>

      {/* ------------------------------ invite ------------------------------ */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={t('users.invite')}
        footer={
          <>
            <button
              type="button"
              onClick={() => setInviteOpen(false)}
              className="ob-btn ob-btn-ghost flex-1"
            >
              {t('common.cancel')}
            </button>
            <SubmitButton
              type="button"
              onClick={submitInvite}
              pending={pending}
              disabled={!email.trim() || password.length < 8}
              className="flex-[1.6]"
            >
              {t('common.confirm')}
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4 pb-4">
          {!serviceRoleAvailable && (
            <div className="rounded-xl bg-gold/12 px-4 py-3 text-[12px] font-semibold text-olive">
              Add <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> to create accounts
              from here. Without it, people sign up on the login page and you approve them.
            </div>
          )}
          {error && (
            <div className="rounded-xl bg-clay/10 px-4 py-3 text-[12.5px] font-semibold text-clay">
              {error}
            </div>
          )}
          <Field label={t('auth.fullName')}>
            <input
              className="ob-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </Field>
          <Field label={t('common.email')}>
            <input
              className="ob-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
            />
          </Field>
          <Field label={t('users.role')}>
            <select
              className="ob-input"
              value={roleKey}
              onChange={(e) => setRoleKey(e.target.value)}
            >
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {roles.find((x) => x.key === r)?.label ?? r}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={t('users.tempPassword')}
            hint="Share this with them — they can change it later."
          >
            <div className="flex gap-2">
              <input
                className="ob-input font-mono"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
              />
              <button
                type="button"
                onClick={generatePassword}
                className="ob-btn ob-btn-ghost h-11 w-11 flex-shrink-0 px-0"
                aria-label="regenerate"
              >
                <Icon name="refresh" size={15} />
              </button>
            </div>
          </Field>
        </div>
      </Modal>
    </>
  )
}
