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

  // 1. Initialize the redirect response object right away
  const response = NextResponse.redirect(new URL(next, requestUrl.origin));

  if (code) {
    const cookieStore = await cookies();

    // 2. Initialize the Supabase Client with direct response mutation access
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              // Ensure path scopes are bound globally across all tabs
              const cookieOptions = { ...options, path: '/' };
              
              // Synchronize the token securely to both contexts simultaneously
              cookieStore.set(name, value, cookieOptions);
              response.cookies.set(name, value, cookieOptions);
            });
          },
        },
      }
    );

    // 3. Complete the single-use token handshake
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      console.log('[callback] Handshake successful! Redirecting to secure home...');
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