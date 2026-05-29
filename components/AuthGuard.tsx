'use client';
// components/AuthGuard.tsx
// Wraps any page/section that requires a minimum role.
// Shows a spinner while loading, access-denied if role insufficient.
//
// Usage:
//   <AuthGuard require={r => can.viewLPData(r)}>
//     <LPsPage />
//   </AuthGuard>

import { useAuth } from '@/hooks/useAuth';
import type { AppRole } from '@/lib/rbac';

type Props = {
  children: React.ReactNode;
  require?: (role: AppRole | null) => boolean;
};

export function AuthGuard({ children, require }: Props) {
  const { loading, role } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <svg className="animate-spin w-5 h-5 text-[#2d5be3]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    );
  }

  if (require && !require(role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center px-6">
        <div className="text-3xl mb-3">🔒</div>
        <div className="text-[14px] font-semibold mb-1">Access restricted</div>
        <p className="text-[12.5px] text-[#9b9890]">
          You don't have permission to view this section.<br/>
          Contact your GP if you need access.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
