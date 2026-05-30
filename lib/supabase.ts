// lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr';

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookieOptions: {
      name: 'sb',
      sameSite: 'lax',
      secure: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  }
);
