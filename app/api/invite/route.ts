// app/api/invite/route.ts
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { email, full_name, role } = await request.json();
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  // Verify the caller is a GP
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
    // User already exists — ensure their user_roles row has the correct role,
    // then send a magic link instead of an invite
    await supabaseAdmin.from('user_roles').upsert({
      user_id:   existingUser.id,
      role,
      full_name: full_name?.trim() || existingUser.user_metadata?.full_name || null,
      email:     normalizedEmail,
      is_active: true,
    }, { onConflict: 'user_id' });

    // Generate a magic link so they can access the portal
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
    });

    if (linkError || !linkData?.properties?.action_link) {
      return NextResponse.json({ error: linkError?.message ?? 'Failed to generate magic link' }, { status: 400 });
    }

    // Send email via Resend (or just return success — Supabase sends the email automatically via generateLink)
    return NextResponse.json({ success: true, existing_user: true });
  }

  // New user — save pending invite and send invite email as before
  await supabaseAdmin.from('pending_invites').upsert({
    email:       normalizedEmail,
    full_name:   full_name?.trim() || null,
    role,
    invited_by:  user.id,
  }, { onConflict: 'email' });

  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    data: { full_name: full_name?.trim() || null },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
