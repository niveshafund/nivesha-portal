// middleware.ts  (project root, next to package.json)
// Redirects unauthenticated users to /login.
// Redirects authenticated users away from /login to /.

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  const isLoginPage    = req.nextUrl.pathname.startsWith('/login');
  const isAuthCallback = req.nextUrl.pathname.startsWith('/auth/callback');

  // Always allow the auth callback through
  if (isAuthCallback) return res;

  // Not signed in → redirect to login
  if (!session && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Signed in + on login page → redirect to home
  if (session && isLoginPage) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/).*)',
  ],
};
