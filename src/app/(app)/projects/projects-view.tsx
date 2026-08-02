'use client'

import { useEffect, useState, useTransition } from 'react'
import { useApp } from '@/components/app-context'
import { useLang, useT } from '@/components/lang-provider'
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
  Stepper,
  SubmitButton,
  useToast,
} from '@/components/ui'
import { Icon } from '@/components/icons'
import { PERMISSIONS } from '@/lib/permissions'
import { egp, formatDate, usd } from '@/lib/format'
import { deleteProject, logDelivery, saveProject } from '@/server/projects'
import type { Client, ProjectDelivery, ProjectProgress, TeamMember } from '@/lib/types'

export function ProjectsView({
  projects,
  deliveries,
  members,
  clients,
}: {
  projects: ProjectProgress[]
  deliveries: ProjectDelivery[]
  members: TeamMember[]
  clients: Client[]
}) {
  const t = useT()
  const { lang } = useLang()
  const toast = useToast()
  const { can, settings } = useApp()
  const [pending, start] = useTransition()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectProgress | null>(null)
  const [deliverFor, setDeliverFor] = useState<ProjectProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [clientName, setClientName] = useState('')
  const [clientId, setClientId] = useState('')
  const [title, setTitle] = useState('')
  const [value, setValue] = useState(0)
  const [totalVideos, setTotalVideos] = useState(10)
  const [deadline, setDeadline] = useState('')

  const [memberId, setMemberId] = useState('')
  const [count, setCount] = useState(1)

  useEffect(() => {
    if (deliverFor && members.length && !memberId) setMemberId(members[0].id)
  }, [deliverFor, members, memberId])

  const openForm = (project?: ProjectProgress) => {
    setError(null)
    setEditing(project ?? null)
    setClientName(project?.client_name ?? '')
    setClientId(project?.client_id ?? '')
    setTitle(project?.title ?? '')
    setValue(Number(project?.value ?? 0))
    setTotalVideos(project?.total_videos ?? 10)
    setDeadline(project?.deadline ?? '')
    setFormOpen(true)
  }

  const submit = () => {
    setError(null)
    start(async () => {
      const result = await saveProject({
        id: editing?.id,
        clientId: clientId || null,
        clientName,
        title,
        value,
        totalVideos,
        deadline: deadline || null,
      })
      if (result.ok) {
        toast(result.message ?? t('toast.saved'))
        setFormOpen(false)
      } else {
        setError(result.error ?? t('toast.error'))
      }
    })
  }

  const submitDelivery = () => {
    if (!deliverFor) return
    setError(null)
    start(async () => {
      const result = await logDelivery({ projectId: deliverFor.id, memberId, count })
      if (result.ok) {
        toast(result.message ?? t('toast.saved'))
        setDeliverFor(null)
        setCount(1)
      } else {
        setError(result.error ?? t('toast.error'))
      }
    })
  }

  const totals = {
    active: projects.filter((p) => p.delivered < p.total_videos).length,
    delivered: projects.reduce((sum, p) => sum + p.delivered, 0),
    due: projects.reduce((sum, p) => sum + p.total_videos, 0),
    value: projects.reduce((sum, p) => sum + Number(p.value), 0),
  }

  const editorsFor = (projectId: string) => {
    const map = new Map<string, number>()
    for (const d of deliveries.filter((x) => x.project_id === projectId)) {
      const key = d.member_name ?? '—'
      map.set(key, (map.get(key) ?? 0) + d.count)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }

  return (
    <>
      <PageHeader
        title={t('projects.title')}
        subtitle={t('projects.sub')}
        actions={
          can(PERMISSIONS.projectsCreate) && (
            <button type="button" onClick={() => openForm()} className="ob-btn ob-btn-primary">
              <Icon name="plus" size={15} />
              {t('projects.new')}
            </button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('dash.activeProjects')} value={totals.active} sub={`${projects.length} total`} icon="folder" />
        <StatCard
          label={t('projects.delivered')}
          value={`${totals.delivered}/${totals.due}`}
          sub={totals.due ? `${Math.round((totals.delivered / totals.due) * 100)}%` : '0%'}
        />
        <StatCard
          label={t('projects.contractValue')}
          value={egp(totals.value)}
          sub={usd(totals.value, settings.studio.usd_rate)}
        />
        <StatCard
          label={t('dash.videosDue')}
          value={Math.max(0, totals.due - totals.delivered)}
          sub={t('projects.videos')}
          tone={totals.due - totals.delivered > 0 ? 'warn' : 'good'}
        />
      </div>

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon="folder"
            title={t('projects.empty')}
            action={
              can(PERMISSIONS.projectsCreate) ? (
                <button type="button" onClick={() => openForm()} className="ob-btn ob-btn-primary">
                  {t('projects.new')}
                </button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3.5">
          {projects.map((p) => {
            const pct = p.pct
            const tone = pct >= 100 ? 'ink' : pct >= 50 ? 'neutral' : 'warn'
            const label =
              pct >= 100 ? t('projects.complete') : pct >= 50 ? t('projects.onTrack') : t('projects.behind')
            return (
              <Card key={p.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[17px] font-extrabold tracking-[-0.3px]">
                        {p.client_name}
                      </span>
                      <Badge tone={tone}>{label}</Badge>
                    </div>
                    <div className="mt-0.5 text-[12.5px] font-medium text-ink/55">{p.title}</div>
                    {p.deadline && (
                      <div className="mt-1 text-[11.5px] font-semibold text-ink/45">
                        {t('projects.deadline')}{' '}
                        <span className="ob-ltr">{formatDate(p.deadline, lang, 'short')}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-end">
                    <div className="ob-ltr text-[18px] font-extrabold tracking-[-0.3px]">
                      {egp(p.value)}
                    </div>
                    <div className="ob-ltr text-[11.5px] font-semibold text-ink/45">
                      {egp(Number(p.value) / p.total_videos)} / {t('projects.perVideo')}
                    </div>
                  </div>
                </div>

                <div className="mb-2 mt-4 flex items-baseline justify-between">
                  <span className="text-[13.5px] font-bold">
                    <span className="ob-ltr">
                      {p.delivered} / {p.total_videos}
                    </span>{' '}
                    {t('projects.videos')}
                  </span>
                  <span className="ob-ltr text-[13.5px] font-extrabold">{pct}%</span>
                </div>
                <ProgressBar pct={pct} />

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {editorsFor(p.id).map(([name, n]) => (
                      <div key={name} className="flex items-center gap-2">
                        <Avatar name={name} size={26} />
                        <span className="text-[12.5px] font-semibold text-ink/70">
                          {name.split(' ')[0]} · <span className="ob-ltr">{n}</span>
                        </span>
                      </div>
                    ))}
                    {editorsFor(p.id).length === 0 && (
                      <span className="text-[12px] font-medium text-ink/40">{t('common.none')}</span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {can(PERMISSIONS.projectsEdit) && (
                      <button
                        type="button"
                        onClick={() => openForm(p)}
                        className="ob-btn ob-btn-ghost h-9 px-3.5 text-[12.5px]"
                      >
                        <Icon name="edit" size={14} />
                      </button>
                    )}
                    {can(PERMISSIONS.projectsDelete) && (
                      <ConfirmButton
                        onConfirm={() =>
                          start(async () => {
                            const result = await deleteProject(p.id)
                            toast(
                              result.ok
                                ? (result.message ?? t('toast.deleted'))
                                : (result.error ?? t('toast.error')),
                              result.ok ? 'ok' : 'error',
                            )
                          })
                        }
                        className="h-9 px-3.5 text-[12.5px]"
                      >
                        <Icon name="trash" size={14} />
                      </ConfirmButton>
                    )}
                    {can(PERMISSIONS.projectsDeliver) && p.delivered < p.total_videos && (
                      <button
                        type="button"
                        onClick={() => {
                          setError(null)
                          setCount(1)
                          setDeliverFor(p)
                        }}
                        className="ob-btn ob-btn-ghost h-9 px-3.5 text-[12.5px]"
                      >
                        <Icon name="plus" size={14} />
                        {t('projects.logDelivery')}
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ------------------------------ project form ------------------------------ */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? t('common.edit') : t('projects.new')}
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
              disabled={!clientName.trim() || !title.trim()}
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
          <Field label={t('common.client')}>
            <input
              className="ob-input"
              value={clientName}
              onChange={(e) => {
                setClientName(e.target.value)
                setClientId('')
              }}
            />
            {clients.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {clients.slice(0, 5).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setClientName(c.name)
                      setClientId(c.id)
                    }}
                    data-on={clientId === c.id}
                    className="ob-chip h-8 text-[11.5px]"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </Field>
          <Field label={t('common.name')}>
            <input
              className="ob-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('projects.titlePh')}
            />
          </Field>
          <div className="flex gap-3">
            <Field label={t('projects.contractValue')} className="flex-1">
              <input
                className="ob-input"
                type="number"
                inputMode="numeric"
                value={value}
                onChange={(e) => setValue(Number(e.target.value) || 0)}
                dir="ltr"
              />
            </Field>
            <Field label={t('projects.videos')} className="flex-1">
              <Stepper value={totalVideos} onChange={setTotalVideos} min={1} max={500} />
            </Field>
          </div>
          <Field label={t('projects.deadline')} hint={t('common.optional')}>
            <input
              className="ob-input"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </Field>
        </div>
      </Modal>

      {/* ------------------------------ log delivery ------------------------------ */}
      <Modal
        open={Boolean(deliverFor)}
        onClose={() => setDeliverFor(null)}
        title={t('projects.logDelivery')}
        subtitle={deliverFor ? `${deliverFor.client_name} · ${deliverFor.title}` : undefined}
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeliverFor(null)}
              className="ob-btn ob-btn-ghost flex-1"
            >
              {t('common.cancel')}
            </button>
            <SubmitButton
              type="button"
              onClick={submitDelivery}
              pending={pending}
              disabled={!memberId}
              className="flex-[1.6]"
            >
              {t('common.confirm')}
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
          <Field label={t('projects.editor')}>
            {members.length === 0 ? (
              <p className="text-[12.5px] font-semibold text-clay">{t('team.empty')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMemberId(m.id)}
                    data-on={memberId === m.id}
                    className="ob-chip h-9"
                  >
                    <Avatar name={m.name} size={20} />
                    {m.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            )}
          </Field>

          <Field label={t('projects.videosDone')}>
            <Stepper
              value={count}
              onChange={setCount}
              min={1}
              max={deliverFor ? Math.max(1, deliverFor.total_videos - deliverFor.delivered) : 99}
            />
          </Field>

          {deliverFor && (
            <div className="flex items-center justify-between rounded-[14px] bg-ink/6 px-4 py-3.5">
              <span className="text-[12.5px] font-semibold text-ink/65">
                {t('projects.afterThis')}
              </span>
              <b className="ob-ltr text-[15px]">
                {Math.min(deliverFor.total_videos, deliverFor.delivered + count)} /{' '}
                {deliverFor.total_videos}
              </b>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
