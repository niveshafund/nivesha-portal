// app/api/users/[id]/route.ts
// Deletes a user completely: user_roles + pending_invites + auth.users
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: userId } = await params;

  // Verify caller is a GP
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
    return NextResponse.json({ error: 'Only GPs can delete users' }, { status: 403 });
  }

  // Prevent self-deletion
  if (userId === user.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Get the user's email before deleting (needed to clean pending_invites)
  const { data: roleRow } = await supabaseAdmin
    .from('user_roles')
    .select('email')
    .eq('user_id', userId)
    .single();

  // 1. Delete from user_roles
  await supabaseAdmin.from('user_roles').delete().eq('user_id', userId);

  // 2. Delete from pending_invites if email is known
  if (roleRow?.email) {
    await supabaseAdmin
      .from('pending_invites')
      .delete()
      .eq('email', roleRow.email);
  }

  // 3. Delete from auth.users — this is the critical one that was missing
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Audit log
  await supabaseAdmin.from('audit_logs').insert({
    action:       'user_deleted',
    actor_id:     user.id,
    actor_email:  user.email,
    target_email: roleRow?.email ?? null,
    details:      JSON.stringify({ deleted_user_id: userId }),
  }).then(({ error: auditErr }) => {
    if (auditErr) console.warn('[user-delete] audit log failed:', auditErr.message);
  });

  return NextResponse.json({ success: true });
}
