import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/login',
  '/auth',
  '/api/keepalive',
  '/manifest.webmanifest',
  '/sw.js',
  '/offline',
  // Shared invoice links. The token in the URL is the only credential, and the
  // database exposes exactly one function to anonymous callers.
  '/i',
]

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

/**
 * Refreshes the Supabase session on every request and bounces signed-out
 * visitors to the login page. Page-level permission checks happen in the
 * app layout; the database enforces them for real.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  let response = NextResponse.next({ request })

  // If Supabase isn't configured yet, let the setup screen explain what to do.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    if (pathname === '/setup') return response
    return NextResponse.redirect(new URL('/setup', request.url))
  }

  // A client opening an invoice link has no session and should never be asked
  // for one, so skip the auth round trip entirely. /login is excluded because
  // it still needs to know whether to bounce an already-signed-in user onward.
  if (isPublic(pathname) && !pathname.startsWith('/login')) return response

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && !isPublic(pathname) && pathname !== '/setup') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Remember where they were headed so login can send them back.
    if (pathname !== '/') url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files.
     */
    '/((?!_next/static|_next/image|favicon.ico|icons/|screenshots/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2)$).*)',
  ],
}
