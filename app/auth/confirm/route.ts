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

  const safeNext = next && /^\/(?!\/)/.test(next) ? next : null;

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

    if (user.email) {
      await hydrateRoleFromPendingInvite(user.id, user.email);
      await activateUser(user.id, user.email);
      await linkLpRecord(user.id, user.email);
    }

    const destination = safeNext ?? await resolveRoleRedirect(user.id);
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

  if (user.email) {
    await hydrateRoleFromPendingInvite(user.id, user.email);
    await activateUser(user.id, user.email);
    await linkLpRecord(user.id, user.email);
  }

  const destination = safeNext ?? await resolveRoleRedirect(user.id);
  response.headers.set('location', new URL(destination, request.url).toString());
  return response;
}

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
    .single();

  if (data?.role === 'LP') return '/lp/dashboard';
  if (data?.role === 'GP') return '/dashboard';
  return '/';
}

async function activateUser(userId: string, email: string) {
  const admin = adminClient();
  const normalizedEmail = email.trim().toLowerCase();

  // Check current is_active — but ONLY skip reactivation if the user
  // already has a user_roles row AND was explicitly deactivated (no pending invite).
  const { data: existing } = await admin
    .from('user_roles')
    .select('is_active')
    .eq('user_id', userId)
    .single();

  // Check if there's still a pending invite — if so, this is first-time onboarding,
  // always activate regardless of is_active value.
  const { data: pendingInvite } = await admin
    .from('pending_invites')
    .select('email')
    .eq('email', normalizedEmail)
    .single();

  const isFirstTimeOnboarding = !!pendingInvite;

  if (existing && existing.is_active === false && !isFirstTimeOnboarding) {
    // GP explicitly deactivated this user (no pending invite) — do not reactivate
    console.warn(`[confirm] User ${userId} is deactivated by GP — skipping activation`);
    return;
  }

  await admin.from('user_roles').update({ is_active: true }).eq('user_id', userId);
  await admin.from('pending_invites').delete().eq('email', normalizedEmail);
  console.log(`[confirm] Activated user ${userId}`);
}

const ALLOWED_INVITE_ROLES = ['LP', 'Associate', 'Analyst', 'Finance', 'LP Manager', 'Viewer'];

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

  if (!ALLOWED_INVITE_ROLES.includes(invite.role)) {
    console.error(`[confirm] Blocked invalid role '${invite.role}' in pending_invites for ${normalizedEmail}`);
    return;
  }

  // NOTE: Do NOT set is_active here — let activateUser() handle activation.
  // Setting is_active: false here caused a bug where activateUser() would
  // think the GP had deactivated the user and skip activation.
  const { error: upsertErr } = await admin.from('user_roles').upsert(
    {
      user_id:    userId,
      role:       invite.role,
      full_name:  invite.full_name ?? null,
      email:      normalizedEmail,
      invited_by: invite.invited_by ?? null,
    },
    { onConflict: 'user_id' }
  );

  if (upsertErr) {
    console.error('[confirm] Failed to write user_roles:', upsertErr.message);
    return;
  }

  console.log(`[confirm] Role '${invite.role}' hydrated for ${userId}`);
}

async function linkLpRecord(userId: string, email: string) {
  const admin = adminClient();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: roleData } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (roleData?.role !== 'LP') return;

  const { data: lpData } = await admin
    .from('lps')
    .select('id, user_id')
    .eq('email', normalizedEmail)
    .single();

  if (!lpData) {
    console.warn(`[confirm] No lps record found for ${normalizedEmail}`);
    return;
  }

  if (lpData.user_id === userId) return;

  const { error } = await admin
    .from('lps')
    .update({ user_id: userId })
    .eq('id', lpData.id);

  if (error) {
    console.error('[confirm] Failed to link lps.user_id:', error.message);
  } else {
    console.log(`[confirm] Linked lps record ${lpData.id} to user ${userId}`);
  }
}
