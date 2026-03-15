import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/components/AuthProvider'
import '@/lib/server-init' // Initialize server-side services (cron jobs, etc.)

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Smart Steps - ABA Management Platform',
  description: 'ABA Timesheet, Analytics & Insurance Invoicing Platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          {children}
          <Toaster position="top-right" />
        </AuthProvider>
      </body>
    </html>
  )
}

