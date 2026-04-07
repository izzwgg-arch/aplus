'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { 
  Home, 
  LogOut,
  ArrowLeft
} from 'lucide-react'
import { NotificationBell } from '@/components/notifications/NotificationBell'

const APLUS_CENTER_URL = 'https://app.apluscenterinc.org/aplus'

export function DashboardNav({ userRole }: { userRole: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const isActive = pathname === '/dashboard' || pathname.startsWith('/dashboard/')
  const showBackButton = !isActive && pathname !== '/login' && pathname !== '/'

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <nav className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link href="/dashboard" className="flex items-center space-x-2">
              <span className="text-xl font-bold text-white">Smart Steps</span>
            </Link>
            
            {showBackButton && (
              <button
                onClick={handleBack}
                className="flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            )}
            
            <Link
              href="/dashboard"
              className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
              style={isActive ? { backgroundColor: '#0066cc' } : undefined}
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </Link>

            <a
              href={APLUS_CENTER_URL}
              className="flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>A+ Center</span>
            </a>
          </div>

          <div className="flex items-center space-x-4">
            <NotificationBell />
            <button
              onClick={async () => {
                await signOut({ 
                  callbackUrl: window.location.origin + '/login',
                  redirect: true 
                })
              }}
              className="flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
