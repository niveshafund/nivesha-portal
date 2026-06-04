'use client';
// app/login/page.tsx

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// Errors that are internal/misleading and should never be shown to users
const SUPPRESS_ERRORS = ['invalid_hash', 'no_code', 'no_session'];

function LoginForm() {
  const searchParams = useSearchParams();
  const rawError = searchParams.get('error');
  const authError = rawError && !SUPPRESS_ERRORS.includes(rawError)
    ? decodeURIComponent(rawError)
    : null;

  const [email,   setEmail]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    const baseUrl = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${baseUrl}/auth/confirm`,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <div className="bg-white border border-[#e8e6df] rounded-2xl p-7 shadow-sm">
      {sent ? (
        <div className="text-center">
          <div className="text-3xl mb-3">📬</div>
          <div className="text-[14px] font-semibold mb-1">Check your email</div>
          <p className="text-[12.5px] text-[#6b6860] mb-4">
            We sent a sign-in link to <span className="font-medium text-[#1a1915]">{email}</span>
          </p>
          <p className="text-[11.5px] text-[#9b9890]">
            Click the link in the email to sign in. You can close this tab.
          </p>
          <button onClick={() => { setSent(false); setEmail(''); }}
            className="mt-4 text-[12px] text-[#2d5be3] hover:underline">
            Use a different email
          </button>
        </div>
      ) : (
        <>
          <div className="mb-5">
            <div className="text-[15px] font-semibold mb-1">Sign in</div>
            <p className="text-[12.5px] text-[#9b9890]">
              Enter your work email and we'll send you a sign-in link.
            </p>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-[11.5px] font-medium mb-1.5">Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@niveshaventures.com"
                required
                className="w-full px-3 py-2.5 rounded-[8px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 transition-all"
              />
            </div>
            {authError && (
              <p className="text-[11.5px] text-red-500 mb-3">{authError}</p>
            )}
            {error && <p className="text-[11.5px] text-red-500 mb-3">{error}</p>}
            <button type="submit" disabled={loading || !email.trim()}
              className="w-full py-2.5 rounded-[8px] bg-[#2d5be3] text-white text-[13px] font-medium hover:bg-[#2450cc] transition-colors disabled:opacity-60">
              {loading ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#2d5be3] flex items-center justify-center">
              <span className="text-white text-[13px] font-bold">N</span>
            </div>
            <span className="text-[18px] font-semibold text-[#1a1915]">NiveshaVC</span>
          </div>
          <p className="text-[12.5px] text-[#9b9890]">Portfolio Management</p>
        </div>
        <Suspense fallback={
          <div className="bg-white border border-[#e8e6df] rounded-2xl p-7 shadow-sm flex items-center justify-center h-48">
            <svg className="animate-spin w-5 h-5 text-[#2d5be3]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
        }>
          <LoginForm />
        </Suspense>
        <p className="text-center text-[11px] text-[#9b9890] mt-5">
          Access is by invitation only. Contact your GP if you need access.
        </p>
      </div>
    </div>
  );
}
