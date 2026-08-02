'use client'

import { useState, useTransition } from 'react'
import { useT } from '../lang-provider'
import { Icon } from '../icons'
import { useToast } from '../ui'
import { shareInvoice, unshareInvoice } from '@/server/invoices'

/**
 * Creating, copying, sending and withdrawing the client-facing link.
 *
 * The link is the only credential, so "withdraw" has to be one tap — that is
 * the undo button for sending it to the wrong person.
 */
export function SharePanel({
  invoiceId,
  invoiceNumber,
  clientName,
  isShared,
  views,
  total,
}: {
  invoiceId: string
  invoiceNumber: string
  clientName: string
  isShared: boolean
  views: number
  total: string
}) {
  const t = useT()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [url, setUrl] = useState<string | null>(null)

  const create = (regenerate = false) =>
    start(async () => {
      const result = await shareInvoice(invoiceId, { regenerate })
      if (result.ok && result.url) {
        setUrl(result.url)
        await copy(result.url, false)
        toast(regenerate ? t('inv.linkNew') : t('inv.linkCopied'))
      } else {
        toast(result.error ?? t('toast.error'), 'error')
      }
    })

  const withdraw = () =>
    start(async () => {
      const result = await unshareInvoice(invoiceId)
      if (result.ok) {
        setUrl(null)
        toast(result.message ?? t('toast.saved'))
      } else {
        toast(result.error ?? t('toast.error'), 'error')
      }
    })

  const copy = async (value: string, announce = true) => {
    try {
      await navigator.clipboard.writeText(value)
      if (announce) toast(t('inv.linkCopied'))
    } catch {
      // Clipboard is blocked outside a secure context — the field is selectable.
      if (announce) toast(t('inv.linkCopyManual'), 'error')
    }
  }

  const share = async (value: string) => {
    const message = `${clientName} — invoice ${invoiceNumber} (${total})`
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `Invoice ${invoiceNumber}`, text: message, url: value })
        return
      } catch {
        // Cancelled, or unsupported — fall through to copying.
      }
    }
    void copy(value)
  }

  return (
    <div className="mt-4 rounded-[14px] border border-ink/10 bg-paper/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="ob-label">{t('inv.clientLink')}</div>
        {isShared && views > 0 && (
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-moss">
            <Icon name="check" size={12} />
            <span className="ob-ltr">
              {views} {t('inv.opened')}
            </span>
          </span>
        )}
      </div>

      {!isShared && !url ? (
        <>
          <p className="mt-1.5 text-[11.5px] font-medium leading-relaxed text-ink/55">
            {t('inv.linkHint')}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => create(false)}
            className="ob-btn ob-btn-primary mt-3 h-10 w-full text-[12.5px]"
          >
            <Icon name="share" size={14} />
            {t('inv.createLink')}
          </button>
        </>
      ) : (
        <>
          {url ? (
            <div className="mt-2 flex gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="ob-input h-10 flex-1 font-mono text-[11px]"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => copy(url)}
                className="ob-btn ob-btn-ghost h-10 w-10 flex-shrink-0 px-0"
                aria-label={t('inv.copyLink')}
              >
                <Icon name="receipt" size={14} />
              </button>
            </div>
          ) : (
            <p className="mt-1.5 text-[11.5px] font-medium text-ink/55">{t('inv.linkLive')}</p>
          )}

          <div className="mt-2.5 flex flex-wrap gap-2">
            {url && (
              <button
                type="button"
                onClick={() => share(url)}
                className="ob-btn ob-btn-primary h-10 flex-1 text-[12.5px]"
              >
                <Icon name="share" size={14} />
                {t('inv.sendLink')}
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => create(true)}
              className="ob-btn ob-btn-ghost h-10 flex-1 text-[12.5px]"
            >
              <Icon name="refresh" size={14} />
              {url ? t('inv.newLink') : t('inv.copyLink')}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={withdraw}
              className="ob-btn ob-btn-danger h-10 flex-1 text-[12.5px]"
            >
              {t('inv.withdrawLink')}
            </button>
          </div>

          <p className="mt-2 text-[10.5px] font-medium leading-relaxed text-ink/40">
            {t('inv.linkWarning')}
          </p>
        </>
      )}
    </div>
  )
}
