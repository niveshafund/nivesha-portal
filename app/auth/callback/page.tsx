'use client';
// app/auth/callback/page.tsx

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      // Supabase puts tokens in the URL hash: #access_token=...&refresh_token=...
      const hash = window.location.hash;

      if (hash) {
        // Let Supabase parse the hash and set the session
        const { data, error } = await supabase.auth.getSession();
        if (data.session) {
          router.replace('/');
          return;
        }
      }

      // Also check query params (token_hash flow)
      const params = new URLSearchParams(window.location.search);
      const token_hash = params.get('token_hash') || params.get('token');
      const type = params.get('type') as any;

      if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type });
        if (!error) {
          router.replace('/');
          return;
        }
      }

      // Wait briefly for onAuthStateChange to fire
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
          subscription.unsubscribe();
          router.replace('/');
        }
      });

      // Timeout fallback — if nothing works after 5s, go to login
      setTimeout(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
            router.replace('/');
          } else {
            router.replace('/login?error=auth');
          }
        });
      }, 5000);
    };

    handleCallback();
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
