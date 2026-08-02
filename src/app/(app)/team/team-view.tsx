'use client'

import { useState, useTransition } from 'react'
import { useApp } from '@/components/app-context'
import { useT } from '@/components/lang-provider'
import {
  Avatar,
  Badge,
  Card,
  ConfirmButton,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  ProgressBar,
  StatCard,
  SubmitButton,
  useToast,
} from '@/components/ui'
import { Icon } from '@/components/icons'
import { PERMISSIONS, ROLE_ORDER } from '@/lib/permissions'
import { egp, monthPeriod } from '@/lib/format'
import { deleteMember, paySalary, saveMember } from '@/server/team'
import { createAccountForMember } from '@/server/users'
import type { MemberOutput, PayrollRow, Profile } from '@/lib/types'

export function TeamView({
  members,
  payroll,
  profiles,
  canManageUsers,
  serviceRoleAvailable,
}: {
  members: MemberOutput[]
  payroll: PayrollRow[]
  profiles: Profile[]
  canManageUsers: boolean
  serviceRoleAvailable: boolean
}) {
  const t = useT()
  const toast = useToast()
  const { can } = useApp()
  const [pending, start] = useTransition()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<MemberOutput | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [roleTitle, setRoleTitle] = useState('')
  const [salary, setSalary] = useState(6000)
  const [perVideo, setPerVideo] = useState(200)
  const [phone, setPhone] = useState('')
  const [profileId, setProfileId] = useState('')

  const [accountFor, setAccountFor] = useState<MemberOutput | null>(null)
  const [accountEmail, setAccountEmail] = useState('')
  const [accountRole, setAccountRole] = useState('editor')
  const [accountPassword, setAccountPassword] = useState('')

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    const bytes = new Uint32Array(14)
    crypto.getRandomValues(bytes)
    setAccountPassword([...bytes].map((b) => chars[b % chars.length]).join(''))
  }

  const profileFor = (member: MemberOutput) =>
    member.profile_id ? profiles.find((p) => p.id === member.profile_id) : undefined

  const period = monthPeriod()
  const paidThisMonth = new Set(
    payroll.filter((p) => p.period === period && p.paid_at).map((p) => p.member_id),
  )

  const totalSalary = members.reduce((sum, m) => sum + Number(m.salary), 0)
  const paidSalary = members
    .filter((m) => paidThisMonth.has(m.id))
    .reduce((sum, m) => sum + Number(m.salary), 0)
  const totalDelivered = members.reduce((sum, m) => sum + m.delivered, 0)

  const openForm = (member?: MemberOutput) => {
    setError(null)
    setEditing(member ?? null)
    setName(member?.name ?? '')
    setRoleTitle(member?.role_title ?? '')
    setSalary(Number(member?.salary ?? 6000))
    setPerVideo(Number(member?.per_video ?? 200))
    setPhone(member?.phone ?? '')
    setProfileId(member?.profile_id ?? '')
    setFormOpen(true)
  }

  const submit = () => {
    setError(null)
    start(async () => {
      const result = await saveMember({
        id: editing?.id,
        name,
        roleTitle,
        salary,
        perVideo,
        phone,
        profileId: profileId || null,
      })
      if (result.ok) {
        toast(result.message ?? t('toast.saved'))
        setFormOpen(false)
      } else {
        setError(result.error ?? t('toast.error'))
      }
    })
  }

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const result = await fn()
      toast(
        result.ok ? (result.message ?? t('toast.saved')) : (result.error ?? t('toast.error')),
        result.ok ? 'ok' : 'error',
      )
    })

  return (
    <>
      <PageHeader
        title={t('team.title')}
        subtitle={t('team.sub')}
        actions={
          can(PERMISSIONS.teamCreate) && (
            <button type="button" onClick={() => openForm()} className="ob-btn ob-btn-primary">
              <Icon name="plus" size={15} />
              {t('team.new')}
            </button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('team.title')} value={members.length} icon="team" />
        <StatCard label={t('team.delivered')} value={totalDelivered} sub={t('projects.videos')} />
        <StatCard label={t('team.payrollMonth')} value={egp(totalSalary)} icon="wallet" />
        <StatCard
          label={t('team.paid')}
          value={egp(paidSalary)}
          sub={`${Math.round(totalSalary ? (paidSalary / totalSalary) * 100 : 0)}%`}
          tone={paidSalary >= totalSalary && totalSalary > 0 ? 'good' : 'warn'}
        />
      </div>

      {members.length === 0 ? (
        <Card>
          <EmptyState
            icon="team"
            title={t('team.empty')}
            action={
              can(PERMISSIONS.teamCreate) ? (
                <button type="button" onClick={() => openForm()} className="ob-btn ob-btn-primary">
                  {t('team.new')}
                </button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {members.map((m) => {
            const paid = paidThisMonth.has(m.id)
            const maxDelivered = Math.max(1, ...members.map((x) => x.delivered))
            return (
              <Card key={m.id}>
                <div className="flex items-center gap-3">
                  <Avatar name={m.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-extrabold tracking-[-0.2px]">
                      {m.name}
                    </div>
                    <div className="truncate text-[12px] font-semibold text-ink/55">
                      {m.role_title}
                    </div>
                  </div>
                  <Badge tone={paid ? 'ink' : 'warn'}>{paid ? t('team.paid') : t('team.unpaid')}</Badge>
                </div>

                {(() => {
                  const account = profileFor(m)
                  if (account) {
                    return (
                      <div className="mt-3 flex items-center gap-2 rounded-xl bg-ink/4 px-3 py-2">
                        <Icon name="shield" size={14} className="flex-shrink-0 text-ink/40" />
                        <span className="ob-ltr min-w-0 flex-1 truncate text-[11.5px] font-semibold text-ink/55">
                          {account.email}
                        </span>
                        <Badge
                          tone={
                            account.status === 'suspended'
                              ? 'bad'
                              : account.is_active
                                ? 'good'
                                : 'warn'
                          }
                        >
                          {account.status === 'suspended'
                            ? t('users.suspended')
                            : account.is_active
                              ? t('users.active')
                              : t('users.pending')}
                        </Badge>
                      </div>
                    )
                  }
                  if (!canManageUsers) return null
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null)
                        setAccountEmail('')
                        setAccountRole('editor')
                        generatePassword()
                        setAccountFor(m)
                      }}
                      className="mt-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-ink/20 px-3 py-2 text-[11.5px] font-bold text-ink/50 transition-colors hover:border-ink/35 hover:text-ink"
                    >
                      <Icon name="plus" size={13} />
                      {t('users.createAccount')}
                    </button>
                  )
                })()}

                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <div className="ob-tile px-3.5 py-3">
                    <div className="ob-label">{t('team.delivered')}</div>
                    <div className="ob-ltr mt-0.5 text-[19px] font-extrabold">{m.delivered}</div>
                  </div>
                  <div className="ob-tile px-3.5 py-3">
                    <div className="ob-label">{t('team.salary')}</div>
                    <div className="ob-ltr mt-0.5 text-[19px] font-extrabold">{egp(m.salary)}</div>
                  </div>
                </div>

                <div className="mt-3.5">
                  <div className="mb-1.5 flex justify-between text-[11.5px] font-semibold text-ink/55">
                    <span>{t('team.payout')}</span>
                    <span className="ob-ltr font-extrabold text-ink">
                      {egp(m.video_payout)}
                    </span>
                  </div>
                  <ProgressBar pct={(m.delivered / maxDelivered) * 100} height={7} tone="gold" />
                </div>

                <div className="mt-4 flex gap-2">
                  {can(PERMISSIONS.teamPayroll) && (
                    <button
                      type="button"
                      disabled={pending || paid}
                      onClick={() => run(() => paySalary(m.id))}
                      className={`ob-btn h-10 flex-1 text-[12.5px] ${
                        paid ? 'bg-ink/6 text-ink/40' : 'ob-btn-primary'
                      }`}
                    >
                      {paid ? t('team.paid') : t('team.paySalary')}
                    </button>
                  )}
                  {can(PERMISSIONS.teamEdit) && (
                    <button
                      type="button"
                      onClick={() => openForm(m)}
                      className="ob-btn ob-btn-ghost h-10 w-10 px-0"
                      aria-label="edit"
                    >
                      <Icon name="edit" size={15} />
                    </button>
                  )}
                  {can(PERMISSIONS.teamDelete) && (
                    <ConfirmButton
                      onConfirm={() => run(() => deleteMember(m.id))}
                      disabled={pending}
                      className="h-10 w-10 px-0"
                    >
                      <Icon name="trash" size={15} />
                    </ConfirmButton>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ------------------------- create a login ------------------------- */}
      <Modal
        open={Boolean(accountFor)}
        onClose={() => setAccountFor(null)}
        title={t('users.createAccount')}
        subtitle={accountFor?.name}
        footer={
          <>
            <button
              type="button"
              onClick={() => setAccountFor(null)}
              className="ob-btn ob-btn-ghost flex-1"
            >
              {t('common.cancel')}
            </button>
            <SubmitButton
              type="button"
              pending={pending}
              disabled={!accountEmail.trim() || accountPassword.length < 8}
              onClick={() => {
                if (!accountFor) return
                setError(null)
                start(async () => {
                  const result = await createAccountForMember({
                    memberId: accountFor.id,
                    email: accountEmail,
                    roleKey: accountRole,
                    password: accountPassword,
                  })
                  if (result.ok) {
                    toast(t('users.inviteSent'))
                    setAccountFor(null)
                  } else {
                    setError(result.error ?? t('toast.error'))
                  }
                })
              }}
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
              Add <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> to create logins from
              here. Until then they can sign up on the login page and you approve them.
            </div>
          )}
          {error && (
            <div className="rounded-xl bg-clay/10 px-4 py-3 text-[12.5px] font-semibold text-clay">
              {error}
            </div>
          )}
          <Field label={t('common.email')}>
            <input
              className="ob-input"
              type="email"
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
              dir="ltr"
            />
          </Field>
          <Field label={t('users.role')}>
            <select
              className="ob-input"
              value={accountRole}
              onChange={(e) => setAccountRole(e.target.value)}
            >
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {r}
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
                value={accountPassword}
                onChange={(e) => setAccountPassword(e.target.value)}
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

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? t('common.edit') : t('team.new')}
        footer={
          <>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="ob-btn ob-btn-ghost flex-1"
            >
              {t('common.cancel')}
            </button>
            <SubmitButton
              type="button"
              onClick={submit}
              pending={pending}
              disabled={!name.trim()}
              className="flex-[1.6]"
            >
              {t('common.save')}
            </SubmitButton>
          </>
        }
      >
        <div className="flex flex-col gap-4 pb-4">
          {error && (
            <div className="rounded-xl bg-clay/10 px-4 py-3 text-[12.5px] font-semibold text-clay">
              {error}
            </div>
          )}
          <Field label={t('common.name')}>
            <input className="ob-input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('team.roleTitle')}>
            <input
              className="ob-input"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder={t('team.rolePh')}
            />
          </Field>
          <div className="flex gap-3">
            <Field label={t('team.salary')} className="flex-1">
              <input
                className="ob-input"
                type="number"
                inputMode="numeric"
                value={salary}
                onChange={(e) => setSalary(Number(e.target.value) || 0)}
                dir="ltr"
              />
            </Field>
            <Field label={t('team.perVideo')} className="flex-1">
              <input
                className="ob-input"
                type="number"
                inputMode="numeric"
                value={perVideo}
                onChange={(e) => setPerVideo(Number(e.target.value) || 0)}
                dir="ltr"
              />
            </Field>
          </div>
          <Field label={t('common.phone')} hint={t('common.optional')}>
            <input
              className="ob-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              dir="ltr"
            />
          </Field>
          {profiles.length > 0 && (
            <Field
              label={t('team.linkAccount')}
              hint="Connects this person to their login account."
            >
              <select
                className="ob-input"
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
              >
                <option value="">—</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name ?? p.email}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </Modal>
    </>
  )
}
