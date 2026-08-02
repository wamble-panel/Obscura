import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Server-side Supabase client for Server Components, Server Actions and
 * Route Handlers. Every query still runs through row level security.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Staff should not be signed out because they left the app for a weekend.
      // The access token still rotates hourly; this only governs how long the
      // refresh cookie survives, which is what keeps a Home Screen app logged in.
      cookieOptions: {
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component — the middleware refreshes the
            // session instead, so this is safe to ignore.
          }
        },
      },
    },
  )
}
