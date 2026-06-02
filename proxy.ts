// proxy.ts (project root)
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const pathname = request.nextUrl.pathname;

  // Always allow auth and login routes through
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
    // Only LP role may access /lp/* — anyone else goes to GP portal
    if (role !== 'LP') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return response;
  }

  // ── GP portal routes (everything else) ───────────────────
  // LP users must not access GP pages — send them to their portal
  if (role === 'LP') {
    return NextResponse.redirect(new URL('/lp/dashboard', request.url));
  }

  // No role at all (invited but user_roles not yet assigned) —
  // redirect to login with a message rather than exposing GP portal
  if (!role) {
    return NextResponse.redirect(new URL('/login?error=no_role', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|api/).*)',
  ],
};
