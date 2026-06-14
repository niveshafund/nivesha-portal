// app/api/lp/[lpId]/route.ts
// Server-side LP deletion — removes lps, user_roles, and auth.users cleanly

import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ lpId: string }> }
) {
  const { lpId } = await params;

  // Verify caller is GP
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
    return NextResponse.json({ error: 'Only GPs can delete LPs' }, { status: 403 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Get LP record to find user_id
  const { data: lp } = await supabaseAdmin
    .from('lps')
    .select('id, user_id, email')
    .eq('id', lpId)
    .single();

  if (!lp) return NextResponse.json({ error: 'LP not found' }, { status: 404 });

  // 1. Delete lp_transactions first (FK constraint)
  await supabaseAdmin.from('lp_transactions').delete().eq('lp_id', lpId);

  // 2. Delete the LP record
  const { error: lpError } = await supabaseAdmin.from('lps').delete().eq('id', lpId);
  if (lpError) return NextResponse.json({ error: lpError.message }, { status: 400 });

  // 3. If LP had a linked auth user, clean up user_roles and auth.users
  if (lp.user_id) {
    await supabaseAdmin.from('user_roles').delete().eq('user_id', lp.user_id);
    await supabaseAdmin.auth.admin.deleteUser(lp.user_id);
  }

  // Audit log
  await supabaseAdmin.from('audit_logs').insert({
    action:       'lp_deleted',
    actor_id:     user.id,
    actor_email:  user.email,
    target_email: lp.email ?? null,
    details:      JSON.stringify({ lp_id: lpId, had_auth_user: !!lp.user_id }),
  }).then(({ error: auditErr }) => {
    if (auditErr) console.warn('[lp-delete] audit log failed:', auditErr.message);
  });

  return NextResponse.json({ success: true });
}
