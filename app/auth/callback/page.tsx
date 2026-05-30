'use client';
// app/auth/callback/page.tsx
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const [status, setStatus] = useState('Signing you in…');

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        window.location.href = '/';
      }
    });

    // Supabase client auto-detects the code in URL and exchanges it
    // because detectSessionInUrl: true is set in supabase.ts
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        window.location.href = '/';
      } else {
        setStatus('Completing sign in…');
        // Give detectSessionInUrl time to process the code
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
              window.location.href = '/';
            } else {
              window.location.href = '/login?error=auth';
            }
          });
        }, 3000);
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
