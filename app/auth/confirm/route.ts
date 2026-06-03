// app/auth/confirm/route.ts
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type       = searchParams.get('type') as EmailOtpType | null;
  const next       = searchParams.get('next'); // explicit override only — don't default yet

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL('/login?error=invalid_hash', request.url));
  }

  const cookieStore = await cookies();

  // Placeholder redirect — will be replaced below once we know the user's role
  const response = NextResponse.redirect(new URL('/', request.url));

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
            // Write to both Next.js internals AND the outgoing response headers
            cookieStore.set(name, value, cookieOptions);
            response.cookies.set(name, value, cookieOptions);
          });
        },
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error || !user) {
    console.error('[confirm] verifyOtp error:', error?.message);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error?.message ?? 'unknown')}`, request.url)
    );
  }

  console.log(`[confirm] OTP verified (type=${type}), user=${user.id}`);

  // For invite links: hydrate user_roles from pending_invites so the
  // middleware can route the user correctly on their very first load.
  if (type === 'invite' && user.email) {
    await hydratRoleFromPendingInvite(user.id, user.email);
  }

  // Determine where to send the user
  const destination = next ?? await resolveRoleRedirect(user.id);

  // Mutate the redirect URL on the already-cookie-carrying response object
  response.headers.set('location', new URL(destination, request.url).toString());

  return response;
}

// ─────────────────────────────────────────────────────────────
// Helpers (use service-role so RLS doesn't interfere)
// ─────────────────────────────────────────────────────────────

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Returns the correct landing path based on the user's role.
 */
async function resolveRoleRedirect(userId: string): Promise<string> {
  const { data } = await adminClient()
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (data?.role === 'LP') return '/lp/dashboard';
  if (data?.role === 'GP') return '/dashboard';
  return '/';
}

/**
 * Copies the pending_invites row into user_roles on first sign-in, then
 * deletes the pending row. Safe to call multiple times (upsert + delete).
 */
async function hydratRoleFromPendingInvite(userId: string, email: string) {
  const admin = adminClient();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: invite, error: fetchErr } = await admin
    .from('pending_invites')
    .select('role, full_name')
    .eq('email', normalizedEmail)
    .single();

  if (fetchErr || !invite) {
    console.warn(`[confirm] No pending invite found for ${normalizedEmail} — role may already be set`);
    return;
  }

  const { error: upsertErr } = await admin.from('user_roles').upsert(
    {
      user_id:   userId,
      role:      invite.role,
      full_name: invite.full_name ?? null,
      email:     normalizedEmail,
      is_active: true,
    },
    { onConflict: 'user_id' }
  );

  if (upsertErr) {
    console.error('[confirm] Failed to write user_roles:', upsertErr.message);
    return;
  }

  // Clean up so the row can't be replayed
  await admin.from('pending_invites').delete().eq('email', normalizedEmail);

  console.log(`[confirm] Role '${invite.role}' assigned to ${userId}`);
}
