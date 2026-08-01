import type { Metadata, Viewport } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'
import ServiceWorkerRegister from './components/ServiceWorkerRegister'
import ZonaHoraria from './components/ZonaHoraria'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: 'Caudal - Finanzas Personales',
  description: 'Tu dinero, en flujo',
  applicationName: 'Caudal',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Caudal',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  // Sin maximumScale ni userScalable: bloquear el pinch-zoom impide ampliar a
  // quien lo necesita para leer (WCAG 1.4.4). El zoom accidental que se quería
  // evitar ya no ocurre porque los campos usan tamaños de fuente >= 16px.
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={dmSans.variable}>
      <body className="font-sans antialiased">
        {children}
        <ZonaHoraria />
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
