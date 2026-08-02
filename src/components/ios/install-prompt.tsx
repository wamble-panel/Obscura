'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Icon } from '../icons'
import { useT } from '../lang-provider'

const DISMISSED_KEY = 'ob_install_dismissed'

/**
 * iOS gives no `beforeinstallprompt` event and no install button — the only way
 * onto the Home Screen is Share → Add to Home Screen. So on iOS Safari we show
 * the instructions once; on Android we use the real prompt when the browser
 * offers it.
 */
export function InstallPrompt() {
  const t = useT()
  const [show, setShow] = useState(false)
  const [platform, setPlatform] = useState<'ios' | 'android'>('ios')
  const [deferred, setDeferred] = useState<{ prompt: () => Promise<void> } | null>(null)

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) return

    const ua = navigator.userAgent
    const isIOS = /iphone|ipad|ipod/i.test(ua)
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua)

    if (isIOS && isSafari) {
      setPlatform('ios')
      // Let the page settle first so this never competes with the first paint.
      const id = setTimeout(() => setShow(true), 2500)
      return () => clearTimeout(id)
    }

    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as unknown as { prompt: () => Promise<void> })
      setPlatform('android')
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-90 animate-[popIn_.3s_cubic-bezier(.22,1,.36,1)] lg:inset-x-auto lg:right-6 lg:bottom-6 lg:max-w-[360px]">
      <div className="flex items-start gap-3 rounded-[18px] border border-ink/10 bg-cream p-4 shadow-float">
        <Image
          src="/icons/icon-192.png"
          alt="Obscura"
          width={44}
          height={44}
          className="h-11 w-11 flex-shrink-0 rounded-[11px]"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-extrabold">{t('install.title')}</div>
          {platform === 'ios' ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-1 text-[12px] font-medium leading-relaxed text-ink/60">
              {t('install.iosBefore')}
              <Icon name="share" size={13} className="inline text-ink/70" />
              {t('install.iosAfter')}
            </p>
          ) : (
            <p className="mt-1 text-[12px] font-medium leading-relaxed text-ink/60">
              {t('install.android')}
            </p>
          )}

          {platform === 'android' && deferred && (
            <button
              type="button"
              onClick={async () => {
                await deferred.prompt()
                dismiss()
              }}
              className="ob-btn ob-btn-primary mt-2.5 h-9 text-[12.5px]"
            >
              {t('install.action')}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-ink/40 hover:bg-ink/6"
          aria-label={t('common.close')}
        >
          <Icon name="close" size={15} />
        </button>
      </div>
    </div>
  )
}
