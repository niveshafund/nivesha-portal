'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

const mainNav = [
  { href: '/dashboard',       label: 'Dashboard',          icon: 'grid' },
  { href: '/funds',           label: 'Funds',              icon: 'briefcase' },
  { href: '/analytics',       label: 'Analytics',          icon: 'globe' },
  { href: '/reports',         label: 'Reports',            icon: 'file-text' },
];

const adminNav = [
  { href: '/users',           label: 'Users & Permissions', icon: 'users' },
  { href: '/contacts',        label: 'Contacts & LPs',      icon: 'user' },
  { href: '/fund-operations', label: 'Fund Operations',     icon: 'monitor' },
  { href: '/audit-log',       label: 'Audit Log',           icon: 'shield' },
];

const icons: Record<string, React.ReactElement> = {
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  briefcase: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>,
  'bar-chart': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  globe: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  'file-text': <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  monitor: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
  shield: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
};

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, fullName, role } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  const displayName = fullName || user?.email?.split('@')[0] || 'User';
  const initials = displayName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  function openProfile() {
    setProfileName(fullName ?? displayName);
    setProfileMsg('');
    setShowMenu(false);
    setShowProfile(true);
  }

  async function handleSaveProfile() {
    if (!profileName.trim() || !user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from('user_roles')
      .update({ full_name: profileName.trim() })
      .eq('user_id', user.id);
    setSavingProfile(false);
    if (error) {
      setProfileMsg('Failed to update');
    } else {
      setProfileMsg('Profile updated!');
      setTimeout(() => { setShowProfile(false); setProfileMsg(''); }, 1200);
    }
  }

  const NavItem = ({ href, label, icon, disabled }: { href: string; label: string; icon: string; disabled?: boolean }) => {
    const active = pathname === href || pathname.startsWith(href + '/');
    if (disabled) {
      return (
        <div className="flex items-center gap-2.5 px-[18px] py-[7px] text-[13px] border-l-[3px] border-transparent text-[#c4c2bb] cursor-not-allowed select-none">
          <span className="opacity-40">{icons[icon]}</span>
          {label}
          <span className="ml-auto text-[9px] font-medium bg-[#f0efe9] text-[#9b9890] px-1.5 py-0.5 rounded">Soon</span>
        </div>
      );
    }
    return (
      <Link href={href}
        className={`flex items-center gap-2.5 px-[18px] py-[7px] text-[13px] border-l-[3px] transition-all duration-100 ${
          active
            ? 'border-[#2d5be3] bg-[#eef2fd] text-[#2d5be3] font-medium'
            : 'border-transparent text-[#6b6860] hover:text-[#1a1917] hover:bg-[#f9f8f5]'
        }`}>
        <span className={active ? 'opacity-100' : 'opacity-65'}>{icons[icon]}</span>
        {label}
      </Link>
    );
  };

  return (
    <>
      <aside className="w-[222px] bg-white border-r border-[#e8e6df] flex flex-col sticky top-0 h-screen overflow-y-auto flex-shrink-0">
        {/* Logo */}
        <div className="px-[18px] py-[15px] flex items-center gap-2.5 border-b border-[#e8e6df]">
          <img src="/nivesha-icon.png" alt="Nivesha Ventures"
            className="w-7 h-7 rounded-[7px] flex-shrink-0 object-contain" />
          <span className="text-[14.5px] font-semibold tracking-tight">
            Nivesha<span className="text-[#2d5be3]">VC</span>
          </span>
        </div>

        {/* Main nav */}
        <nav className="py-1.5">
          {mainNav.map(item => <NavItem key={item.href} {...item} />)}
        </nav>

        {/* Admin nav */}
        <nav className="py-1.5">
          <div className="px-[18px] py-1.5 text-[9.5px] font-medium tracking-[0.08em] text-[#9b9890] uppercase">
            Administration
          </div>
          {adminNav.map(item => <NavItem key={item.href} {...item} />)}
        </nav>

        {/* Footer */}
        <div className="mt-auto border-t border-[#e8e6df]">
          {showMenu && (
            <div className="border-b border-[#e8e6df]">
              <button onClick={openProfile}
                className="w-full flex items-center gap-2.5 px-[18px] py-2.5 text-[12.5px] text-[#3d3b35] hover:bg-[#f9f8f5] transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-[#9b9890]">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                Edit profile
              </button>
              <button onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-[18px] py-2.5 text-[12.5px] text-red-500 hover:bg-red-50 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sign out
              </button>
            </div>
          )}
          <button onClick={() => setShowMenu(v => !v)}
            className="w-full px-[18px] py-3 flex items-center gap-2.5 hover:bg-[#f9f8f5] transition-colors text-left">
            <div className="w-[29px] h-[29px] bg-[#2d5be3] rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">{displayName}</div>
              <div className="text-[10.5px] text-[#9b9890]">{role ?? 'Loading…'}</div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              className={`w-3 h-3 text-[#9b9890] ml-auto flex-shrink-0 transition-transform ${showMenu ? 'rotate-180' : ''}`}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>
      </aside>

      {/* Edit Profile Modal */}
      {showProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowProfile(false)}/>
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="text-[15px] font-semibold mb-1">Edit Profile</div>
            <p className="text-[12.5px] text-[#9b9890] mb-5">Update your display name</p>

            <div className="mb-3">
              <label className="block text-[11.5px] font-medium mb-1">Full Name</label>
              <input
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3 py-2.5 rounded-[8px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 transition-all"
              />
            </div>

            <div className="mb-5">
              <label className="block text-[11.5px] font-medium mb-1">Email</label>
              <input
                value={user?.email ?? ''}
                disabled
                className="w-full px-3 py-2.5 rounded-[8px] border border-[#e8e6df] text-[13px] bg-[#f9f8f5] text-[#9b9890]"
              />
              <p className="text-[11px] text-[#9b9890] mt-1">Email cannot be changed</p>
            </div>

            {profileMsg && (
              <p className={`text-[12px] mb-3 ${profileMsg.includes('Failed') ? 'text-red-500' : 'text-green-600'}`}>
                {profileMsg}
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowProfile(false)}
                className="px-4 py-2 rounded-[8px] text-[12.5px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveProfile} disabled={savingProfile || !profileName.trim()}
                className="px-4 py-2 rounded-[8px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] disabled:opacity-60 transition-colors">
                {savingProfile ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
