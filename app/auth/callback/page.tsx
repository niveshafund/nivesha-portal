'use client';
// app/auth/callback/page.tsx  (replace route.ts with this page.tsx)

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Supabase magic links put the token in the URL fragment (#) or query string
    // onAuthStateChange fires automatically when Supabase detects the token
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        router.replace('/');
      } else if (event === 'TOKEN_REFRESHED' && session) {
        router.replace('/');
      }
    });

    // Also try to get session directly in case it's already set
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center">
      <div className="text-center">
        <svg className="animate-spin w-6 h-6 text-[#2d5be3] mx-auto mb-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <p className="text-[13px] text-[#6b6860]">Signing you in…</p>
      </div>
    </div>
  );
}
