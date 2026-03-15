import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  async function middleware(req) {
    const token = req.nextauth.token
    const pathname = req.nextUrl.pathname

    // If user must change password, redirect to set-new-password page
    // Allow access to set-new-password, logout, and API routes
    if (
      token &&
      (token as any).mustChangePassword &&
      pathname !== '/set-new-password' &&
      !pathname.startsWith('/api/auth/signout') &&
      !pathname.startsWith('/api/auth/set-new-password') &&
      !pathname.startsWith('/api/auth/log-activity')
    ) {
      return NextResponse.redirect(new URL('/set-new-password', req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
)

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (authentication routes)
     * - api/public (public API routes - NO AUTH REQUIRED)
     * - public (public pages - NO AUTH REQUIRED)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - set-new-password (to prevent redirect loops)
     * - login (to allow login)
     * - forgot-password (to allow password reset)
     * - reset-password (to allow password reset)
     */
    '/((?!api/auth|api/public|public|portal/sign|_next/static|_next/image|favicon.ico|set-new-password|login|forgot-password|reset-password|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
