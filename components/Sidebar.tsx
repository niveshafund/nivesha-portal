'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const mainNav = [
  { href: '/dashboard',       label: 'Dashboard',          icon: 'grid' },
  { href: '/funds',           label: 'Funds',              icon: 'briefcase' },
  { href: '/portfolio',       label: 'Portfolio',          icon: 'package' },
  { href: '/transactions',    label: 'Transactions',       icon: 'activity' },
  { href: '/valuations',      label: 'Valuations',         icon: 'trending-up' },
  { href: '/metrics',         label: 'Metrics Data',       icon: 'bar-chart' },
  { href: '/analytics',       label: 'Analytics',          icon: 'globe' },
  { href: '/reports',         label: 'Reports',            icon: 'file-text' },
];

const adminNav = [
  { href: '/users',           label: 'Users & Permissions', icon: 'users' },
  { href: '/contacts',        label: 'Contacts & LPs',      icon: 'user' },
  { href: '/fund-operations', label: 'Fund Operations',     icon: 'monitor' },
  { href: '/settings',        label: 'Settings',            icon: 'settings' },
];

const icons: Record<string, React.ReactElement> = {
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  briefcase: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>,
  package: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  activity: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  'trending-up': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  'bar-chart': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  globe: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  'file-text': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  monitor: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
};

export default function Sidebar() {
  const pathname = usePathname();

  const NavItem = ({ href, label, icon }: { href: string; label: string; icon: string }) => {
    const active = pathname === href || pathname.startsWith(href + '/');
    return (
      <Link
        href={href}
        className={`flex items-center gap-2.5 px-[18px] py-[7px] text-[13px] border-l-[3px] transition-all duration-100 ${
          active
            ? 'border-[#2d5be3] bg-[#eef2fd] text-[#2d5be3] font-medium'
            : 'border-transparent text-[#6b6860] hover:text-[#1a1917] hover:bg-[#f9f8f5]'
        }`}
      >
        <span className={active ? 'opacity-100' : 'opacity-65'}>{icons[icon]}</span>
        {label}
      </Link>
    );
  };

  return (
    <aside className="w-[222px] bg-white border-r border-[#e8e6df] flex flex-col sticky top-0 h-screen overflow-y-auto flex-shrink-0">
      {/* Logo */}
      <div className="px-[18px] py-[15px] flex items-center gap-2.5 border-b border-[#e8e6df]">
        <div className="w-7 h-7 bg-[#2d5be3] rounded-[7px] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          NV
        </div>
        <span className="text-[14.5px] font-semibold tracking-tight">
          Nivesha<span className="text-[#2d5be3]">VC</span>
        </span>
      </div>

      {/* Main nav */}
      <nav className="py-1.5">
        {mainNav.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>

      {/* Admin nav */}
      <nav className="py-1.5">
        <div className="px-[18px] py-1.5 text-[9.5px] font-medium tracking-[0.08em] text-[#9b9890] uppercase">
          Administration
        </div>
        {adminNav.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>

      {/* Footer */}
      <div className="mt-auto px-[18px] py-3 border-t border-[#e8e6df] flex items-center gap-2.5">
        <div className="w-[29px] h-[29px] bg-[#2d5be3] rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
          KM
        </div>
        <div>
          <div className="text-xs font-medium">Kishore Mokada</div>
          <div className="text-[10.5px] text-[#9b9890]">GP · Enterprise Plan</div>
        </div>
      </div>
    </aside>
  );
}
