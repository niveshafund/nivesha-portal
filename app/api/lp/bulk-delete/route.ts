// app/api/lp/bulk-delete/route.ts
// Admin-only: bulk delete LPs, bypassing capital call check

import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { lpIds } = await request.json();
  if (!lpIds?.length) return NextResponse.json({ error: 'No LP IDs provided' }, { status: 400 });

  // Verify caller is Admin
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

  if (callerRole?.role !== 'Admin') {
    return NextResponse.json({ error: 'Admin role required for bulk delete' }, { status: 403 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Get LP records to find any linked auth users
  const { data: lps } = await supabaseAdmin
    .from('lps')
    .select('id, user_id, name')
    .in('id', lpIds);

  let deleted = 0;
  const errors: string[] = [];

  for (const lp of lps ?? []) {
    try {
      // 1. Delete lp_transactions
      await supabaseAdmin.from('lp_transactions').delete().eq('lp_id', lp.id);

      // 2. Delete LP record
      const { error } = await supabaseAdmin.from('lps').delete().eq('id', lp.id);
      if (error) throw error;

      // 3. Clean up auth user if linked
      if (lp.user_id) {
        await supabaseAdmin.from('user_roles').delete().eq('user_id', lp.user_id);
        await supabaseAdmin.auth.admin.deleteUser(lp.user_id);
      }

      deleted++;
    } catch (err: any) {
      errors.push(`${lp.name}: ${err.message}`);
    }
  }

  return NextResponse.json({ success: true, deleted, errors });
}
