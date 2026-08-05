'use client'

import clsx from 'clsx'
import { createPortal } from 'react-dom'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  useTransition,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { Icon, type IconName } from './icons'
import { useT } from './lang-provider'

/* ==========================================================================
   Layout blocks
   ========================================================================== */

export function Card({
  children,
  className,
  padded = true,
  ...rest
}: { children: ReactNode; className?: string; padded?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('ob-card', padded && 'p-5 sm:p-6', className)} {...rest}>
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[23px] font-extrabold tracking-[-0.5px]">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-[12.5px] font-medium text-ink/55">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  sub,
  tone = 'default',
  icon,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'dark'
  icon?: IconName
}) {
  return (
    <div
      className={clsx(
        'rounded-[18px] border p-4 sm:p-[18px]',
        tone === 'dark'
          ? 'border-transparent bg-ink text-sand shadow-[0_18px_44px_-26px_rgba(6,57,48,.7)]'
          : 'border-ink/8 bg-paper/86 shadow-soft',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={clsx(
            'text-[11.5px] font-semibold',
            tone === 'dark' ? 'text-sand/70' : 'text-ink/50',
          )}
        >
          {label}
        </div>
        {icon && (
          <Icon
            name={icon}
            size={16}
            className={tone === 'dark' ? 'text-sand/50' : 'text-ink/25'}
          />
        )}
      </div>
      <div className="mt-1.5 text-[24px] font-extrabold tracking-[-0.6px]">
        <span className="ob-ltr">{value}</span>
      </div>
      {sub !== undefined && sub !== null && sub !== '' && (
        <div
          className={clsx(
            'mt-0.5 text-[11.5px] font-semibold',
            tone === 'good'
              ? 'text-moss'
              : tone === 'warn'
                ? 'text-clay'
                : tone === 'dark'
                  ? 'text-sand/60'
                  : 'text-ink/45',
          )}
        >
          <span className="ob-ltr">{sub}</span>
        </div>
      )}
    </div>
  )
}

export function EmptyState({
  icon = 'folder',
  title,
  body,
  action,
}: {
  icon?: IconName
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink/6">
        <Icon name={icon} size={24} className="text-ink/35" />
      </div>
      <div>
        <div className="text-[15px] font-extrabold">{title}</div>
        {body && <div className="mt-1 max-w-xs text-[12.5px] font-medium text-ink/50">{body}</div>}
      </div>
      {action}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'ink' | 'good' | 'warn' | 'bad' | 'gold'
  className?: string
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-ink/8 text-ink/70',
    ink: 'bg-ink text-sand',
    good: 'bg-moss/12 text-moss',
    warn: 'bg-clay/12 text-clay',
    bad: 'bg-clay text-bone',
    gold: 'bg-gold/18 text-olive',
  }
  return <span className={clsx('ob-badge', tones[tone], className)}>{children}</span>
}

export function Avatar({
  name,
  size = 38,
  tone = 'default',
}: {
  name: string | null | undefined
  size?: number
  tone?: 'default' | 'dark'
}) {
  const parts = String(name ?? '').trim().split(/\s+/)
  const text = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
  return (
    <span
      className={clsx(
        'inline-flex flex-shrink-0 items-center justify-center rounded-full font-extrabold',
        tone === 'dark' ? 'bg-sand/20 text-bone' : 'bg-ink/10 text-ink',
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {text}
    </span>
  )
}

export function ProgressBar({
  pct,
  height = 11,
  tone = 'ink',
}: {
  pct: number
  height?: number
  tone?: 'ink' | 'gold' | 'clay'
}) {
  const clamped = Math.max(0, Math.min(100, pct))
  const colors = { ink: 'bg-ink', gold: 'bg-gold', clay: 'bg-clay' }
  return (
    <div
      className="overflow-hidden rounded-full bg-ink/8"
      style={{ height }}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={clsx('h-full rounded-full transition-[width] duration-500', colors[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

/* ==========================================================================
   Form pieces
   ========================================================================== */

export function Field({
  label,
  children,
  hint,
  error,
  className,
}: {
  label?: string
  children: ReactNode
  hint?: string
  error?: string
  className?: string
}) {
  return (
    <div className={clsx('min-w-0', className)}>
      {label && <label className="ob-label mb-1.5 block">{label}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-[11.5px] text-ink/45">{hint}</p>}
      {error && <p className="mt-1 text-[11.5px] font-semibold text-clay">{error}</p>}
    </div>
  )
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  suffix,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  suffix?: string
}) {
  return (
    <div className="flex h-11 items-center justify-between rounded-xl border border-ink/16 bg-paper/70 px-1.5">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink/7 text-lg leading-none disabled:opacity-40"
        aria-label="decrease"
      >
        −
      </button>
      <span className="ob-ltr px-2 text-[15px] font-extrabold">
        {value}
        {suffix ? ` ${suffix}` : ''}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink/7 text-lg leading-none disabled:opacity-40"
        aria-label="increase"
      >
        +
      </button>
    </div>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={clsx('inline-flex gap-1 rounded-xl bg-ink/6 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'h-8 rounded-lg px-3 text-[12.5px] font-bold transition-colors',
            value === o.value ? 'bg-paper text-ink shadow-sm' : 'text-ink/50 hover:text-ink/75',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SubmitButton({
  children,
  pending,
  className,
  variant = 'primary',
  ...rest
}: {
  children: ReactNode
  pending?: boolean
  variant?: 'primary' | 'ghost' | 'danger'
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const t = useT()
  return (
    <button
      type="submit"
      disabled={pending || rest.disabled}
      className={clsx(
        'ob-btn',
        variant === 'primary' && 'ob-btn-primary',
        variant === 'ghost' && 'ob-btn-ghost',
        variant === 'danger' && 'ob-btn-danger',
        className,
      )}
      {...rest}
    >
      {pending ? t('common.saving') : children}
    </button>
  )
}

/* ==========================================================================
   Overlays
   ========================================================================== */

/**
 * Renders overlays into <body>.
 *
 * The app shell puts page content inside a `relative z-10` column and the phone
 * tab bar in a `z-40` sibling. That z-10 makes a stacking context, so anything
 * rendered inside a page — however high its own z-index — paints *below* the
 * tab bar. That is what hid the Confirm button at the bottom of every dialog.
 * Escaping to the body sidesteps the whole question.
 */
function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(children, document.body)
}

/**
 * Holds the page still while a dialog is open.
 *
 * `overflow: hidden` alone does not stop iOS pulling to refresh. A dialog's
 * scroller sitting at its top passes the rest of a downward drag on to the
 * document, and the page reloads — taking a half-typed invoice with it. The
 * chain has to be cut at the root as well as inside the dialog.
 */
function useLockBody(open: boolean) {
  useEffect(() => {
    if (!open) return
    const root = document.documentElement
    const prev = {
      overflow: document.body.style.overflow,
      rootOverscroll: root.style.overscrollBehaviorY,
      bodyOverscroll: document.body.style.overscrollBehaviorY,
    }
    document.body.style.overflow = 'hidden'
    root.style.overscrollBehaviorY = 'none'
    document.body.style.overscrollBehaviorY = 'none'
    return () => {
      document.body.style.overflow = prev.overflow
      root.style.overscrollBehaviorY = prev.rootOverscroll
      document.body.style.overscrollBehaviorY = prev.bodyOverscroll
    }
  }, [open])
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])
}

/**
 * Centred dialog on desktop, bottom sheet on phones — the pattern used
 * throughout the Obscura app design.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 460,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  const titleId = useId()
  useLockBody(open)
  useEscape(open, onClose)
  if (!open) return null

  return (
    <Portal>
    <div
      className="fixed inset-0 z-70 flex items-end justify-center bg-ink/35 p-0 animate-[fadeIn_.18s_ease] sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* dvh, not vh: on iOS vh ignores the browser chrome and the sheet ends
          up taller than the screen, pushing the buttons out of reach. */}
      <div
        className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[24px] bg-cream shadow-float animate-[sheetUp_.28s_cubic-bezier(.22,1,.36,1)] sm:max-h-[90dvh] sm:rounded-[22px] sm:animate-[popIn_.24s_cubic-bezier(.22,1,.36,1)]"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-start justify-between gap-3 px-6 pt-6 pb-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[19px] font-extrabold tracking-[-0.3px]">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-[12.5px] font-semibold text-ink/55">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-ink/14"
            aria-label="close"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-2">{children}</div>

        {footer && (
          <div className="flex flex-shrink-0 gap-2.5 border-t border-ink/8 bg-cream px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
    </Portal>
  )
}

/** Right-hand drawer for record details. Slides up from the bottom on phones. */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const titleId = useId()
  useLockBody(open)
  useEscape(open, onClose)
  if (!open) return null

  return (
    <Portal>
    <div
      className="fixed inset-0 z-60 flex items-end justify-end bg-ink/30 animate-[fadeIn_.2s_ease] sm:items-stretch"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="flex max-h-[88dvh] w-full flex-col rounded-t-[24px] bg-cream shadow-[-24px_0_60px_-24px_rgba(6,57,48,.5)] animate-[sheetUp_.28s_cubic-bezier(.22,1,.36,1)] sm:max-h-none sm:w-[400px] sm:rounded-none sm:animate-[slideIn_.28s_cubic-bezier(.22,1,.36,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between gap-3 px-6 pt-6 pb-3">
          <h2 id={titleId} className="text-[18px] font-extrabold tracking-[-0.3px]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/14"
            aria-label="close"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">{children}</div>
        {footer && (
          <div className="flex flex-shrink-0 gap-2.5 border-t border-ink/8 bg-cream px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
    </Portal>
  )
}

/* ==========================================================================
   Toasts
   ========================================================================== */

type Toast = { id: number; message: string; tone: 'ok' | 'error' }
type ToastContextValue = {
  toast: (message: string, tone?: 'ok' | 'error') => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const router = useRouter()
  const [, startRefresh] = useTransition()

  /**
   * A success toast also re-fetches the page.
   *
   * Every one of these follows a server action that changed something.
   * `revalidatePath` marks the server's cache stale, but the client router
   * keeps the copy it already has until it is told to go back — so a save
   * would land in the database and the screen would carry on showing what was
   * there before. It looked exactly like nothing had saved, on every page in
   * the app, not only invoices. Refreshing here means it can never be
   * forgotten at a call site again.
   */
  const toast = useCallback(
    (message: string, tone: 'ok' | 'error' = 'ok') => {
      const id = Date.now() + Math.random()
      setItems((prev) => [...prev, { id, message, tone }])
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 2600)
      if (tone === 'ok') startRefresh(() => router.refresh())
    },
    [router],
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[max(5.5rem,calc(5.5rem+env(safe-area-inset-bottom)))] z-90 flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className={clsx(
              'pointer-events-auto flex items-center gap-2.5 rounded-full px-5 py-3 text-[13px] font-bold shadow-float animate-[popIn_.2s_ease]',
              item.tone === 'error' ? 'bg-clay text-bone' : 'bg-ink text-bone',
            )}
          >
            <Icon name={item.tone === 'error' ? 'alert' : 'check'} size={15} />
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext).toast
}

/* ==========================================================================
   Misc
   ========================================================================== */

export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel,
  className,
  disabled,
}: {
  onConfirm: () => void
  children: ReactNode
  confirmLabel?: string
  className?: string
  disabled?: boolean
}) {
  const t = useT()
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const id = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(id)
  }, [armed])

  return (
    <button
      type="button"
      disabled={disabled}
      className={clsx('ob-btn', armed ? 'ob-btn-primary bg-clay' : 'ob-btn-danger', className)}
      onClick={() => {
        if (armed) {
          onConfirm()
          setArmed(false)
        } else {
          setArmed(true)
        }
      }}
    >
      {armed ? (confirmLabel ?? t('common.confirm')) : children}
    </button>
  )
}

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('mb-4 flex flex-wrap items-center gap-2', className)}>{children}</div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const t = useT()
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <Icon
        name="search"
        size={16}
        className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink/35 ltr:left-3 rtl:right-3"
      />
      <input
        className="ob-input ltr:pl-9 rtl:pr-9"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t('common.search')}
        type="search"
      />
    </div>
  )
}

export function DataTable({
  head,
  children,
  className,
}: {
  head: ReactNode[]
  children: ReactNode
  className?: string
}) {
  return (
    <div className={clsx('ob-scroll-x -mx-1 px-1', className)}>
      <table className="w-full min-w-[600px] border-collapse text-start">
        <thead>
          <tr className="border-b border-ink/8">
            {head.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2.5 text-start text-[10.5px] font-bold uppercase tracking-[0.6px] text-ink/45"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function Row({
  children,
  onClick,
  className,
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <tr
      onClick={onClick}
      className={clsx(
        'border-b border-ink/6 last:border-0',
        onClick && 'cursor-pointer transition-colors hover:bg-ink/4',
        className,
      )}
    >
      {children}
    </tr>
  )
}

export function Cell({
  children,
  className,
  bold,
}: {
  children: ReactNode
  className?: string
  bold?: boolean
}) {
  return (
    <td className={clsx('px-3 py-3 text-[13px]', bold ? 'font-bold' : 'font-medium', className)}>
      {children}
    </td>
  )
}
