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

  if (code) {
    const cookieStore = await cookies();

    // 1. Initialize an array to track cookie mutations manually
    const cookiesToWrite: Array<{ name: string; value: string; options: any }> = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              // Store them securely for our response headers later
              cookiesToWrite.push({ name, value, options });
              // Mutate the active server cookie store context
              cookieStore.set(name, value, { ...options, path: '/' });
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // 2. NOW build the redirect object after the tokens have been extracted successfully
      const response = NextResponse.redirect(new URL(next, requestUrl.origin));
      
      // 3. Inject the finalized auth cookies right into the outgoing header payload
      cookiesToWrite.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, { ...options, path: '/' });
      });

      console.log('[callback] Handshake successful, redirecting to dashboard...');
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