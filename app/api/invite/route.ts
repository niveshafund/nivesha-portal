// app/api/invite/route.ts
// Server-side invite using Supabase Admin API
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

  // Use Admin client to invite user (bypasses signup restriction)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Save pending invite first
  await supabaseAdmin.from('pending_invites').upsert({
    email: email.trim().toLowerCase(),
    full_name: full_name?.trim() || null,
    role,
    invited_by: user.id,
  }, { onConflict: 'email' });

  // Send invite email via admin API
  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    data: { full_name: full_name?.trim() || null },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
