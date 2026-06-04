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
  const next       = searchParams.get('next');

  const cookieStore = await cookies();

  // Placeholder redirect — location header will be overwritten below
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
            cookieStore.set(name, value, cookieOptions);
            response.cookies.set(name, value, cookieOptions);
          });
        },
      },
    }
  );

  // ── Path A: token_hash present — we verify the OTP ourselves ──
  // This is the standard magic-link flow where Supabase passes the
  // token to us rather than verifying it on their server first.
  if (token_hash && type) {
    const { data: { user }, error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (error || !user) {
      console.error('[confirm] verifyOtp error:', error?.message);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error?.message ?? 'unknown')}`, request.url)
      );
    }

    console.log(`[confirm] OTP verified (type=${type}), user=${user.id}`);

    if (type === 'invite' && user.email) {
      await hydratRoleFromPendingInvite(user.id, user.email);
    }

    const destination = next ?? await resolveRoleRedirect(user.id);
    response.headers.set('location', new URL(destination, request.url).toString());
    return response;
  }

  // ── Path B: no token_hash — Supabase already verified on their end ──
  // The invite link format is:
  //   supabase.co/auth/v1/verify?token=...&type=invite&redirect_to=.../auth/confirm
  // Supabase verifies the token, sets the session cookie, then redirects here.
  // By this point the user is already authenticated — just read the session.
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.error('[confirm] Path B: no user found after Supabase redirect');
    return NextResponse.redirect(new URL('/login?error=no_session', request.url));
  }

  console.log(`[confirm] Path B: session already set by Supabase, user=${user.id}`);

  // Still need to hydrate role — type param is present in the redirect URL
  // even in Path B, so we can detect invite links
  if (type === 'invite' && user.email) {
    await hydratRoleFromPendingInvite(user.id, user.email);
  }

  const destination = next ?? await resolveRoleRedirect(user.id);
  response.headers.set('location', new URL(destination, request.url).toString());
  return response;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

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

async function hydratRoleFromPendingInvite(userId: string, email: string) {
  const admin = adminClient();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: invite, error: fetchErr } = await admin
    .from('pending_invites')
    .select('role, full_name, invited_by')
    .eq('email', normalizedEmail)
    .single();

  if (fetchErr || !invite) {
    console.warn(`[confirm] No pending invite found for ${normalizedEmail} — role may already be set`);
    return;
  }

  const { error: upsertErr } = await admin.from('user_roles').upsert(
    {
      user_id:    userId,
      role:       invite.role,
      full_name:  invite.full_name ?? null,
      email:      normalizedEmail,
      is_active:  true,
      invited_by: invite.invited_by ?? null,
    },
    { onConflict: 'user_id' }
  );

  if (upsertErr) {
    console.error('[confirm] Failed to write user_roles:', upsertErr.message);
    return;
  }

  await admin.from('pending_invites').delete().eq('email', normalizedEmail);
  console.log(`[confirm] Role '${invite.role}' assigned to ${userId}`);
}
