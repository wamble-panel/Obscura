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
      <body className="min-h-dvh antialiased">
        <LangProvider lang={lang}>
          <ToastProvider>{children}</ToastProvider>
        </LangProvider>
        <PwaRegister />
      </body>
    </html>
  )
}
