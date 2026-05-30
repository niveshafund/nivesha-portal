'use client';
// app/auth/confirm/page.tsx
// Handles PKCE exchange client-side when server doesn't have the verifier cookie
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuthConfirmPage() {
  const [status, setStatus] = useState('Completing sign in…');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const next = params.get('next') ?? '/';

    if (!code) {
      window.location.href = '/login?error=auth';
      return;
    }

    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setStatus('Error: ' + error.message);
        setTimeout(() => { window.location.href = '/login?error=auth'; }, 2000);
      } else {
        window.location.href = next;
      }
    });
  }, []);

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
