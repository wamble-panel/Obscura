'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from './lang-provider'
import { Icon } from './icons'
import type { Client } from '@/lib/types'

/**
 * Type-ahead over the client list.
 *
 * Picking an existing client links the record properly (so their history and
 * statement stay in one place) and fills the phone in; typing a new name is
 * still allowed, because the front desk should never be blocked by admin.
 */
export function ClientPicker({
  clients,
  value,
  clientId,
  onChange,
  placeholder,
  autoFocus,
}: {
  clients: Client[]
  value: string
  clientId: string
  onChange: (next: { name: string; clientId: string; client?: Client }) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase()
    const pool = clients.filter((c) => !c.is_archived)
    if (!q) return pool.slice(0, 6)
    return pool
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.company ?? '').toLowerCase().includes(q) ||
          (c.phone ?? '').replace(/\s/g, '').includes(q.replace(/\s/g, '')),
      )
      .slice(0, 6)
  }, [clients, value])

  // An exact match means they picked from the list even if they typed it out.
  const exact = matches.find((c) => c.name.toLowerCase() === value.trim().toLowerCase())

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  useEffect(() => setHighlight(0), [value])

  const pick = (client: Client) => {
    onChange({ name: client.name, clientId: client.id, client })
    setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <input
          className="ob-input ltr:pr-9 rtl:pl-9"
          value={value}
          autoFocus={autoFocus}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChange({ name: e.target.value, clientId: '' })
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (!open || matches.length === 0) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHighlight((h) => (h + 1) % matches.length)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHighlight((h) => (h - 1 + matches.length) % matches.length)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              pick(matches[highlight])
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 ltr:right-3 rtl:left-3">
          {clientId ? (
            <Icon name="check" size={15} className="text-moss" />
          ) : (
            <Icon name="search" size={15} className="text-ink/30" />
          )}
        </span>
      </div>

      {clientId && exact && (exact.company || exact.phone) && (
        <p className="mt-1.5 text-[11.5px] font-semibold text-ink/45">
          {[exact.company, exact.phone].filter(Boolean).join(' · ')}
        </p>
      )}

      {!clientId && value.trim() && (
        <p className="mt-1.5 text-[11.5px] font-semibold text-gold">{t('clients.willCreate')}</p>
      )}

      {open && matches.length > 0 && (
        <ul
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-64 overflow-y-auto rounded-[14px] border border-ink/12 bg-paper py-1.5 shadow-float"
        >
          {matches.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(c)}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-start transition-colors ${
                  i === highlight ? 'bg-ink/6' : ''
                }`}
              >
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-ink/8 text-[10px] font-extrabold">
                  {c.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold">{c.name}</span>
                  {(c.company || c.phone) && (
                    <span className="block truncate text-[11px] font-semibold text-ink/45">
                      {[c.company, c.phone].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
