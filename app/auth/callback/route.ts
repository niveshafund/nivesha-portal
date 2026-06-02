// app/auth/callback/route.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code       = requestUrl.searchParams.get('code');
  const token_hash = requestUrl.searchParams.get('token_hash') ?? requestUrl.searchParams.get('token');
  const type       = requestUrl.searchParams.get('type') as EmailOtpType | null;
  const next       = requestUrl.searchParams.get('next') ?? '/';

  // ── Path A: PKCE magic link (code exchange) ──────────────
  if (code) {
    const cookieStore = await cookies();
    const response = NextResponse.redirect(new URL(next, requestUrl.origin));

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
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
    if (!error) return response;

    console.error('[callback] exchange error:', error.message);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin)
    );
  }

  // ── Path B: Invite / OTP token (token_hash + type) ───────
  // Handles: type=invite, type=magiclink, type=recovery etc.
  if (token_hash && type) {
    const cookieStore = await cookies();
    const response = NextResponse.redirect(new URL('/', requestUrl.origin));

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
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

    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (!error) {
      console.log(`[callback] OTP verified (type=${type}), redirecting...`);
      return response;
    }

    console.error('[callback] OTP error:', error.message);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin)
    );
  }

  return NextResponse.redirect(
    new URL('/login?error=no_code', requestUrl.origin)
  );
}
