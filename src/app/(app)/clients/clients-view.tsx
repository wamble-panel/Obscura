'use client'

import { useMemo, useState, useTransition } from 'react'
import { useApp } from '@/components/app-context'
import { useT } from '@/components/lang-provider'
import {
  Avatar,
  Card,
  ConfirmButton,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SearchInput,
  StatCard,
  SubmitButton,
  Toolbar,
  useToast,
} from '@/components/ui'
import { Icon } from '@/components/icons'
import { PERMISSIONS } from '@/lib/permissions'
import { egp } from '@/lib/format'
import { deleteClient, saveClient } from '@/server/clients'
import type { Client } from '@/lib/types'

export type ClientStats = { clientId: string | null; sessions: number; spend: number }

export function ClientsView({
  clients,
  stats,
}: {
  clients: Client[]
  stats: Record<string, { sessions: number; spend: number }>
}) {
  const t = useT()
  const toast = useToast()
  const { can } = useApp()
  const [pending, start] = useTransition()

  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').includes(q),
    )
  }, [clients, query])

  const openForm = (client?: Client) => {
    setError(null)
    setEditing(client ?? null)
    setName(client?.name ?? '')
    setCompany(client?.company ?? '')
    setPhone(client?.phone ?? '')
    setEmail(client?.email ?? '')
    setNotes(client?.notes ?? '')
    setFormOpen(true)
  }

  const submit = () => {
    setError(null)
    start(async () => {
      const result = await saveClient({ id: editing?.id, name, company, phone, email, notes })
      if (result.ok) {
        toast(result.message ?? t('toast.saved'))
        setFormOpen(false)
      } else {
        setError(result.error ?? t('toast.error'))
      }
    })
  }

  const totalSpend = Object.values(stats).reduce((sum, s) => sum + s.spend, 0)

  return (
    <>
      <PageHeader
        title={t('clients.title')}
        subtitle={t('clients.sub')}
        actions={
          can(PERMISSIONS.clientsCreate) && (
            <button type="button" onClick={() => openForm()} className="ob-btn ob-btn-primary">
              <Icon name="plus" size={15} />
              {t('clients.new')}
            </button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatCard label={t('clients.title')} value={clients.length} icon="users" />
        <StatCard label={t('clients.spend')} value={egp(totalSpend)} icon="wallet" />
      </div>

      <Card className="p-4 sm:p-5">
        <Toolbar>
          <SearchInput value={query} onChange={setQuery} />
        </Toolbar>

        {filtered.length === 0 ? (
          <EmptyState icon="users" title={t('clients.empty')} />
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {filtered.map((c) => {
              const s = stats[c.id] ?? { sessions: 0, spend: 0 }
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-[14px] border border-ink/8 bg-paper/50 px-4 py-3.5"
                >
                  <Avatar name={c.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-extrabold">{c.name}</div>
                    <div className="truncate text-[11.5px] font-semibold text-ink/50">
                      {c.company || c.phone || c.email || '—'}
                    </div>
                    <div className="mt-0.5 text-[11.5px] font-semibold text-ink/45">
                      <span className="ob-ltr">{s.sessions}</span> {t('clients.sessions')} ·{' '}
                      <span className="ob-ltr">{egp(s.spend)}</span>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 gap-1.5">
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-ink/12"
                        aria-label="call"
                      >
                        <Icon name="phone" size={15} />
                      </a>
                    )}
                    {can(PERMISSIONS.clientsEdit) && (
                      <button
                        type="button"
                        onClick={() => openForm(c)}
                        className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-ink/12"
                        aria-label="edit"
                      >
                        <Icon name="edit" size={15} />
                      </button>
                    )}
                    {can(PERMISSIONS.clientsDelete) && (
                      <ConfirmButton
                        onConfirm={() =>
                          start(async () => {
                            const result = await deleteClient(c.id)
                            toast(
                              result.ok
                                ? (result.message ?? t('toast.deleted'))
                                : (result.error ?? t('toast.error')),
                              result.ok ? 'ok' : 'error',
                            )
                          })
                        }
                        disabled={pending}
                        className="h-9 w-9 px-0"
                      >
                        <Icon name="trash" size={15} />
                      </ConfirmButton>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? t('common.edit') : t('clients.new')}
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
          <Field label={t('clients.company')} hint={t('common.optional')}>
            <input
              className="ob-input"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </Field>
          <div className="flex gap-3">
            <Field label={t('common.phone')} className="flex-1">
              <input
                className="ob-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                dir="ltr"
              />
            </Field>
            <Field label={t('common.email')} className="flex-1">
              <input
                className="ob-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                dir="ltr"
              />
            </Field>
          </div>
          <Field label={t('common.notes')} hint={t('common.optional')}>
            <textarea
              className="ob-input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </>
  )
}
