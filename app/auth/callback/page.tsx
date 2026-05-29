'use client';
// app/auth/callback/page.tsx

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState('Signing you in…');

  useEffect(() => {
    const handleCallback = async () => {
      const hash = window.location.hash.substring(1);
      const hashParams = new URLSearchParams(hash);

      const accessToken  = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const hashError    = hashParams.get('error');
      const errorDesc    = hashParams.get('error_description');

      // Hash has error
      if (hashError) {
        setStatus(errorDesc || hashError);
        setTimeout(() => router.replace('/login?error=auth'), 2000);
        return;
      }

      // Hash has tokens — set session directly
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error) {
          router.replace('/');
          return;
        }
        setStatus('Session error: ' + error.message);
        setTimeout(() => router.replace('/login?error=auth'), 2000);
        return;
      }

      // Query param — token or code
      const params = new URLSearchParams(window.location.search);
      const token  = params.get('token_hash') || params.get('token');
      const type   = params.get('type') as any;
      const code   = params.get('code');

      if (token && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: token, type });
        if (!error) { router.replace('/'); return; }
        setStatus('OTP error — requesting new session…');
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) { router.replace('/'); return; }
      }

      // Last resort — wait for onAuthStateChange
      setStatus('Waiting for session…');
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
          subscription.unsubscribe();
          router.replace('/');
        }
      });

      setTimeout(() => {
        subscription.unsubscribe();
        supabase.auth.getSession().then(({ data: { session } }) => {
          router.replace(session ? '/' : '/login?error=auth');
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
        <p className="text-[13px] text-[#6b6860]">{status}</p>
      </div>
    </div>
  );
}
