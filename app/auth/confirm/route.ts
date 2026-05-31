// app/auth/confirm/route.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/';

  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = next;
  redirectTo.searchParams.delete('token_hash');
  redirectTo.searchParams.delete('type');

  // 1. Pre-build the redirect target container object layout
  const response = NextResponse.redirect(redirectTo);

  if (token_hash && type) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              const cookieOptions = { ...options, path: '/' };
              // ✅ FIX: Simultaneously synchronize keys to both Next.js internals AND the active outgoing redirect response headers
              cookieStore.set(name, value, cookieOptions);
              response.cookies.set(name, value, cookieOptions);
            });
          },
        },
      }
    );

    // Uses verifyOtp via token_hash parameters directly from the URL payload
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });

    if (!error) {
      // ✅ SUCCESS: Returns the response object that now carries your active auth cookies
      return response;
    }
    
    console.error('[confirm error]:', error.message);
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url));
  }

  return NextResponse.redirect(new URL('/login?error=invalid_hash', request.url));
}