'use client';
// app/auth/callback/page.tsx
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState('Signing you in…');
  const [debug, setDebug]   = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      const fullUrl = window.location.href;
      const hash    = window.location.hash;
      const search  = window.location.search;

      setDebug(`hash: ${hash || 'none'} | search: ${search || 'none'}`);

      // Parse hash
      const hashParams = new URLSearchParams(hash.substring(1));
      const accessToken  = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const hashError    = hashParams.get('error');
      const errorDesc    = hashParams.get('error_description');

      if (hashError) {
        setStatus(`Error: ${errorDesc || hashError}`);
        return; // STOP — don't redirect, show the error
      }

      if (accessToken && refreshToken) {
        setStatus('Setting session from tokens…');
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (!error) { window.location.href = '/'; return; }
        setStatus('setSession error: ' + error.message);
        return;
      }

      // Parse query params
      const params = new URLSearchParams(search);
      const token  = params.get('token_hash') || params.get('token');
      const type   = params.get('type') as any;
      const code   = params.get('code');

      if (token && type) {
        setStatus(`Verifying OTP (type: ${type})…`);
        const { error } = await supabase.auth.verifyOtp({ token_hash: token, type });
        if (!error) { window.location.href = '/'; return; }
        setStatus('verifyOtp error: ' + error.message);
        return;
      }

      if (code) {
        setStatus('Exchanging code…');
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) { window.location.href = '/'; return; }
        setStatus('exchangeCode error: ' + error.message);
        return;
      }

      setStatus('No token found in URL');
    };

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center">
      <div className="text-center max-w-sm px-4">
        <svg className="animate-spin w-6 h-6 text-[#2d5be3] mx-auto mb-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <p className="text-[13px] text-[#6b6860] mb-2">{status}</p>
        {debug && <p className="text-[11px] text-[#9b9890] break-all">{debug}</p>}
      </div>
    </div>
  );
}
