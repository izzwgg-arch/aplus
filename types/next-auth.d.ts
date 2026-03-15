import NextAuth from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      role: 'SUPER_ADMIN' | 'ADMIN' | 'USER' | 'CUSTOM'
    }
  }

  interface User {
    role: 'SUPER_ADMIN' | 'ADMIN' | 'USER' | 'CUSTOM'
    id: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role: 'SUPER_ADMIN' | 'ADMIN' | 'USER' | 'CUSTOM'
    id: string
  }
}
