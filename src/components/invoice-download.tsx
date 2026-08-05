'use client'

import { useState } from 'react'
import { Icon } from './icons'
import type { buildInvoicePdf } from '@/lib/invoice-pdf'

type Payload = Parameters<typeof buildInvoicePdf>[0]

/**
 * Saves the invoice as a PDF file.
 *
 * Not the browser's print sheet: on iOS that goes through AirPrint, which
 * stamps the page address into the margin and paginates by its own rules, so a
 * one-page invoice arrived as two with a link across the top. This draws the
 * document itself and writes the file.
 *
 * jsPDF is loaded on the tap rather than with the page — a client opening
 * their invoice to read it should not pay for a library they may never use.
 */
export function InvoiceDownload({
  payload,
  filename,
  label = 'Download PDF',
}: {
  payload: Payload
  filename: string
  label?: string
}) {
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      const { downloadInvoicePdf } = await import('@/lib/invoice-pdf')
      const logo = await loadLogo()
      downloadInvoicePdf({ ...payload, studio: { ...payload.studio, logo } }, filename)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={save}
      disabled={busy}
      className="ob-btn ob-btn-primary h-10"
    >
      <Icon name="download" size={15} />
      {busy ? '…' : label}
    </button>
  )
}

/** The lockup, as a data URI, because a PDF cannot fetch a URL later. */
async function loadLogo(): Promise<string | null> {
  try {
    const response = await fetch('/brand/lockup.png')
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
