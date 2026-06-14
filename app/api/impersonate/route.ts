// app/api/impersonate/route.ts
// GP-only: generate a one-time magic link for any user so the GP can
// preview the portal as that user in a new tab.
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { email } = await request.json();
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
    return NextResponse.json({ error: 'Only GPs can impersonate users' }, { status: 403 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Generate a magic link for the target user
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: email.trim().toLowerCase(),
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/session`,
    },
  });

  if (error || !data?.properties?.action_link) {
    return NextResponse.json({ error: error?.message ?? 'Failed to generate link' }, { status: 400 });
  }

  // Audit log — record who impersonated whom (never log the link itself)
  await supabaseAdmin.from('audit_logs').insert({
    action:     'impersonate',
    actor_id:   user.id,
    actor_email: user.email,
    target_email: email.trim().toLowerCase(),
    created_at: new Date().toISOString(),
  }).then(({ error: auditErr }) => {
    if (auditErr) console.warn('[impersonate] audit log failed:', auditErr.message);
  });

  console.log(`[impersonate] GP ${user.email} generated magic link for ${email}`);

  // Return the magic link — mark response as non-cacheable and sensitive
  // so proxies, CDNs, and Vercel edge logs don't store the response body.
  return new NextResponse(JSON.stringify({ url: data.properties.action_link }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'X-Sensitive-Response': '1', // signal to any middleware to skip body logging
    },
  });
}
