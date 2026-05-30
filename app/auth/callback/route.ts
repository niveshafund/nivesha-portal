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

    // 1. Create a safe tracking array to catch cookie changes mid-flight
    const cookiesToWrite: Array<{ name: string; value: string; options: any }> = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              // Ensure path is explicitly locked to root to prevent subdomain isolation
              const cookieOptions = { ...options, path: '/' };
              
              // Push to our local tracker array
              cookiesToWrite.push({ name, value, options: cookieOptions });
              
              // Mutate the active Next.js Server cookie context
              cookieStore.set(name, value, cookieOptions);
            });
          },
        },
      }
    );

    // 2. Perform the server-side code exchange
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // 3. SUCCESS: Now construct the redirect response object *after* the tokens are set
      const response = NextResponse.redirect(new URL(next, requestUrl.origin));
      
      // 4. Inject the finalized auth cookies directly into the live outgoing headers
      cookiesToWrite.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);
      });

      console.log('[callback] Handshake successful, session cookies attached!');
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