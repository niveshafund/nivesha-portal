// app/auth/callback/route.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/';

  const response = NextResponse.redirect(new URL(next, requestUrl.origin));

  if (code) {
    const cookieStore = await cookies();

    console.log('[callback] cookies received:', cookieStore.getAll().map(c => c.name));
    console.log('[callback] code prefix:', code.slice(0, 10));

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => {
            const currentCookies = cookieStore.getAll();
            console.log('[callback] getAll called, returning:', currentCookies.map(c => c.name));
            return currentCookies;
          },
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              const cookieOptions = { ...options, path: '/' };
              cookieStore.set(name, value, cookieOptions);
              response.cookies.set(name, value, cookieOptions);
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      console.log('[callback] success!');
      return response;
    }

    console.error('[callback] exchange error:', error.message);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin)
    );
  }

  return NextResponse.redirect(
    new URL('/login?error=no_code', requestUrl.origin)
  );
}
