import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import AuthGuard from '@/components/AuthGuard'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Agro Industrias RYB',
  description: 'Sistema administrativo Agro Industrias RYB',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  )
}
