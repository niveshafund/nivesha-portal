'use client';
// components/ConditionalLayout.tsx
// Renders sidebar only on authenticated app pages, not on login/auth/lp routes

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const noSidebar =
    pathname === '/login' ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/lp');

  if (noSidebar) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-[26px_30px] overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
