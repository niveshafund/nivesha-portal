// proxy.ts (project root)
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ✅ Named function export matching the filename for Next.js Turbopack
export async function proxy(request: NextRequest) {
  // 1. Setup the default response passing along request headers
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const pathname = request.nextUrl.pathname;

  // 2. Early return to prevent running auth checks on auth or login routes
  if (pathname.startsWith('/login') || pathname.startsWith('/auth')) {
    return response;
  }

  // 3. Initialize Supabase SSR client for proxy token management
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Sync cookies to both the incoming request and outgoing response
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // 4. Validate user token securely
  const { data: { user } } = await supabase.auth.getUser();

  // 5. Protected Route Enforcement
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}

export const config = {
  // Protect all pages while completely ignoring assets, APIs, and the callback
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|api/).*)',
  ],
};