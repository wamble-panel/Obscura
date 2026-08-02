import type { Metadata, Viewport } from 'next'
import { Archivo, IBM_Plex_Sans_Arabic } from 'next/font/google'
import { getLang } from '@/lib/lang-server'
import { dirFor } from '@/lib/i18n'
import { LangProvider } from '@/components/lang-provider'
import { ToastProvider } from '@/components/ui'
import { PwaRegister } from '@/components/pwa-register'
import './globals.css'

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-archivo',
  display: 'swap',
})

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Obscura Studio',
    template: '%s · Obscura',
  },
  description: 'Internal management system for studio orders, rentals, projects and team.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Obscura',
  appleWebApp: {
    capable: true,
    title: 'Obscura',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#E0DCD0',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang()

  return (
    <html lang={lang} dir={dirFor(lang)} className={`${archivo.variable} ${plexArabic.variable}`}>
      <head>
        {/*
          Next only emits the newer `mobile-web-app-capable`. iOS before 16.4
          looks for the apple-prefixed one to open from the Home Screen without
          Safari's chrome, so it is set here by hand.
        */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/*
          iOS only uses a launch image whose dimensions match the device exactly.
          Without these the app opens on a white flash; with them it opens on the
          Obscura mark, which is what makes it feel like an app rather than a tab.
        */}
        {[
          { w: 1179, h: 2556, dw: 393, dh: 852, r: 3 },
          { w: 1290, h: 2796, dw: 430, dh: 932, r: 3 },
          { w: 1170, h: 2532, dw: 390, dh: 844, r: 3 },
          { w: 1125, h: 2436, dw: 375, dh: 812, r: 3 },
          { w: 828, h: 1792, dw: 414, dh: 896, r: 2 },
          { w: 750, h: 1334, dw: 375, dh: 667, r: 2 },
        ].map((s) => (
          <link
            key={`${s.w}x${s.h}`}
            rel="apple-touch-startup-image"
            href={`/icons/splash-${s.w}x${s.h}.png`}
            media={`(device-width: ${s.dw}px) and (device-height: ${s.dh}px) and (-webkit-device-pixel-ratio: ${s.r}) and (orientation: portrait)`}
          />
        ))}
      </head>
      <body className="min-h-dvh antialiased">
        <LangProvider lang={lang}>
          <ToastProvider>{children}</ToastProvider>
        </LangProvider>
        <PwaRegister />
      </body>
    </html>
  )
}
