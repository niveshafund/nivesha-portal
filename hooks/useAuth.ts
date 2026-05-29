'use client';
// hooks/useAuth.ts
// Drop-in hook for any component that needs the current user + role.
//
// Usage:
//   const { user, role, loading } = useAuth();
//   if (can.uploadDocument(role)) { ... }

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { AppRole } from '@/lib/rbac';

export type AuthState = {
  user:    User | null;
  role:    AppRole | null;
  loading: boolean;
  fullName: string | null;
};

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null, role: null, loading: true, fullName: null,
  });

  useEffect(() => {
    // Initial session load
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchRole(session.user);
      } else {
        setState({ user: null, role: null, loading: false, fullName: null });
      }
    });

    // Listen for sign-in / sign-out
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchRole(session.user);
      } else {
        setState({ user: null, role: null, loading: false, fullName: null });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchRole(user: User) {
    const { data } = await supabase
      .from('user_roles')
      .select('role, full_name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    setState({
      user,
      role:     (data?.role as AppRole) ?? null,
      fullName: data?.full_name ?? user.email ?? null,
      loading:  false,
    });
  }

  return state;
}
