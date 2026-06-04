// proxy.ts  (project root — Next.js 16 uses "proxy" instead of "middleware")
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const pathname = request.nextUrl.pathname;

  // ── Always allow auth / login routes through ──────────────
  // This must come BEFORE the Supabase client is used so that
  // /auth/callback can set session cookies without being redirected.
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth')
  ) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // getUser() makes a server-side call — more reliable than getSession()
  const { data: { user } } = await supabase.auth.getUser();

  // Not logged in — redirect to login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Fetch role for this user
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  const role = roleData?.role ?? null;

  // ── LP portal routes (/lp/*) ──────────────────────────────
  if (pathname.startsWith('/lp/')) {
    if (role !== 'LP') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return response;
  }

  // ── GP portal routes (everything else) ───────────────────
  if (role === 'LP') {
    return NextResponse.redirect(new URL('/lp/dashboard', request.url));
  }

  // Invited user whose role hasn't been assigned yet
  if (!role) {
    return NextResponse.redirect(new URL('/login?error=no_role', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match everything except:
     *  - _next/static  (static files)
     *  - _next/image   (image optimisation)
     *  - favicon.ico
     *  - /auth/*       (callback + session pages — must be exempt so
     *                   Supabase can land the user and set cookies)
     *  - /api/*        (API routes handle their own auth)
     */
    '/((?!_next/static|_next/image|favicon.ico|auth/|api/).*)',
  ],
};
