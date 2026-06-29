// app/api/invite/route.ts
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { email, full_name, role } = await request.json();
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  const VALID_ROLES = ['LP', 'Associate', 'Analyst', 'Finance', 'LP Manager', 'Viewer'];
  if (!role || !VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: callerRole } = await supabaseUser
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (callerRole?.role !== 'GP') {
    return NextResponse.json({ error: 'Only GPs can invite users' }, { status: 403 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const normalizedEmail = email.trim().toLowerCase();

  // Check if user already exists in auth.users
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find(u => u.email === normalizedEmail);

  if (existingUser) {
    // User exists in auth — update role and name but do NOT touch is_active.
    // is_active is managed by auth/confirm (on login) and users API (GP deactivate/reactivate).
    // Setting is_active: false here would incorrectly deactivate users on re-invite.
    const { error: upsertErr } = await supabaseAdmin.from('user_roles').upsert({
      user_id:    existingUser.id,
      role,
      full_name:  full_name?.trim() || existingUser.user_metadata?.full_name || null,
      email:      normalizedEmail,
      invited_by: user.id,
      // NOTE: is_active intentionally omitted — let auth/confirm handle activation
    }, { onConflict: 'user_id' });

    if (upsertErr) {
      console.error('[invite] Failed to upsert user_roles for existing user:', upsertErr.message);
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    // Confirm email for existing users too — magic link requires confirmed email
    if (!existingUser.email_confirmed_at) {
      await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
        email_confirm: true,
      });
      console.log('[invite] Auto-confirmed email for existing user:', normalizedEmail);
    }

    // Save to pending_invites so auth/confirm knows this is an onboarding flow
    await supabaseAdmin.from('pending_invites').upsert({
      email:      normalizedEmail,
      full_name:  full_name?.trim() || null,
      role,
      invited_by: user.id,
    }, { onConflict: 'email' });

    // Audit log
    await supabaseAdmin.from('audit_logs').insert({
      action:       'user_invited',
      actor_id:     user.id,
      actor_email:  user.email,
      target_email: normalizedEmail,
      details:      JSON.stringify({ role, full_name: full_name?.trim() || null, existing_user: true }),
    });

    return NextResponse.json({ success: true, existing_user: true });
  }

  // New user — save to pending_invites and send Supabase invite email
  await supabaseAdmin.from('pending_invites').upsert({
    email:      normalizedEmail,
    full_name:  full_name?.trim() || null,
    role,
    invited_by: user.id,
  }, { onConflict: 'email' });

  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    data: { full_name: full_name?.trim() || null },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Auto-confirm email so magic link works immediately.
  // Portal is invite-only — GP verified the email by typing it manually.
  // Magic link proves email ownership on every login anyway.
  const { data: newUsers } = await supabaseAdmin.auth.admin.listUsers();
  const newUser = newUsers?.users?.find(u => u.email === normalizedEmail);
  if (newUser) {
    await supabaseAdmin.auth.admin.updateUserById(newUser.id, {
      email_confirm: true,
    });
    console.log('[invite] Auto-confirmed email for new user:', normalizedEmail);
  }

  // Audit log
  await supabaseAdmin.from('audit_logs').insert({
    action:       'user_invited',
    actor_id:     user.id,
    actor_email:  user.email,
    target_email: normalizedEmail,
    details:      JSON.stringify({ role, full_name: full_name?.trim() || null }),
  });

  return NextResponse.json({ success: true });
}
