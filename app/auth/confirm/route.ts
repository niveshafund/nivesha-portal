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
  const response = NextResponse.redirect(new URL('/', request.url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            const o = { ...options, path: '/' };
            cookieStore.set(name, value, o);
            response.cookies.set(name, value, o);
          });
        },
      },
    }
  );

  // ── Path A: token_hash present — verify OTP ourselves ──────
  if (token_hash && type) {
    const { data: { user }, error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (error || !user) {
      console.error('[confirm] verifyOtp error:', error?.message);
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error?.message ?? 'unknown')}`, request.url)
      );
    }

    console.log(`[confirm] OTP verified (type=${type}), user=${user.id}`);

    // For invite links: hydrate role from pending_invites
    if (type === 'invite' && user.email) {
      await hydrateRoleFromPendingInvite(user.id, user.email);
    }

    // For any login (magic link, invite): mark user as active
    if (user.email) {
      await activateUser(user.id, user.email);
    }

    const destination = next ?? await resolveRoleRedirect(user.id);
    response.headers.set('location', new URL(destination, request.url).toString());
    return response;
  }

  // ── Path B: Supabase already verified — session in cookies ─
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.error('[confirm] Path B: no user found');
    return NextResponse.redirect(new URL('/login?error=no_session', request.url));
  }

  console.log(`[confirm] Path B: session set by Supabase, user=${user.id}`);

  if (type === 'invite' && user.email) {
    await hydrateRoleFromPendingInvite(user.id, user.email);
  }

  // Mark active on every login
  if (user.email) {
    await activateUser(user.id, user.email);
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

/**
 * Resolves where to send the user after login.
 * Does NOT filter by is_active — that's the middleware's job.
 * If no role found, returns '/' and middleware will handle the no_role case.
 */
async function resolveRoleRedirect(userId: string): Promise<string> {
  const { data } = await adminClient()
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (data?.role === 'LP') return '/lp/dashboard';
  if (data?.role === 'GP') return '/dashboard';
  return '/';
}

/**
 * Sets is_active = true on the user_roles row when a user logs in.
 * This is how Pending → Active transition happens.
 */
async function activateUser(userId: string, email: string) {
  const admin = adminClient();
  const normalizedEmail = email.trim().toLowerCase();

  const { error } = await admin
    .from('user_roles')
    .update({ is_active: true })
    .eq('user_id', userId);

  if (error) {
    console.error('[confirm] Failed to activate user:', error.message);
  } else {
    console.log(`[confirm] Activated user ${userId}`);
  }

  // Clean up any pending_invites row regardless of login type
  await admin.from('pending_invites').delete().eq('email', normalizedEmail);
}

/**
 * Copies pending_invites → user_roles on first invite login.
 * Sets is_active: false — activateUser() handles flipping it to true.
 */
async function hydrateRoleFromPendingInvite(userId: string, email: string) {
  const admin = adminClient();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: invite, error: fetchErr } = await admin
    .from('pending_invites')
    .select('role, full_name, invited_by')
    .eq('email', normalizedEmail)
    .single();

  if (fetchErr || !invite) {
    console.warn(`[confirm] No pending invite for ${normalizedEmail} — role may already be set`);
    return;
  }

  const { error: upsertErr } = await admin.from('user_roles').upsert(
    {
      user_id:    userId,
      role:       invite.role,
      full_name:  invite.full_name ?? null,
      email:      normalizedEmail,
      is_active:  false,          // activateUser() sets this to true right after
      invited_by: invite.invited_by ?? null,
    },
    { onConflict: 'user_id' }
  );

  if (upsertErr) {
    console.error('[confirm] Failed to write user_roles:', upsertErr.message);
    return;
  }

  await admin.from('pending_invites').delete().eq('email', normalizedEmail);
  console.log(`[confirm] Role '${invite.role}' hydrated for ${userId}`);
}
