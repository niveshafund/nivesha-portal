'use client';
// app/users/page.tsx

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { can, ALL_ROLES, ROLE_META, AppRole } from '@/lib/rbac';

type TeamMember = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: AppRole;
  is_active: boolean;
  created_at: string;
};

type PendingInvite = {
  id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  created_at: string;
};

const inputCls = 'w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 transition-all bg-white';

function ActionsMenu({
  member, isSelf, canManage,
  onChangeRole, onDeactivate, onResend, onDelete,
}: {
  member: TeamMember; isSelf: boolean; canManage: boolean;
  onChangeRole: () => void; onDeactivate: () => void;
  onResend: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  function handleOpen() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + window.scrollY + 4, right: window.innerWidth - rect.right });
    }
    setOpen(v => !v);
  }

  if (!canManage || isSelf) return (
    <span className="text-[11.5px] text-[#9b9890]">{isSelf ? 'You' : ''}</span>
  );

  const menu = open && (
    <div
      ref={menuRef}
      style={{ position: 'absolute', top: pos.top, right: pos.right, zIndex: 9999 }}
      className="bg-white border border-[#e8e6df] rounded-xl shadow-xl py-1 w-52">
      <div className="px-3 py-1.5 text-[10.5px] font-semibold text-[#9b9890] uppercase tracking-wide">Actions</div>
      <button onClick={() => { setOpen(false); setTimeout(onChangeRole, 10); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[#1a1915] hover:bg-[#f9f8f5] transition-colors">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#6b6860]">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Edit user
      </button>
      <button onClick={() => { setOpen(false); setTimeout(onResend, 10); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[#1a1915] hover:bg-[#f9f8f5] transition-colors">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#6b6860]">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <polyline points="22,6 12,13 2,6"/>
        </svg>
        Resend invitation
      </button>
      <button onClick={() => { setOpen(false); setTimeout(onDeactivate, 10); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-[#1a1915] hover:bg-[#f9f8f5] transition-colors">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#6b6860]">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        {member.is_active ? 'Deactivate user' : 'Reactivate user'}
      </button>
      <div className="border-t border-[#e8e6df] my-1"/>
      <button onClick={() => { setOpen(false); setTimeout(onDelete, 10); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-red-500 hover:bg-red-50 transition-colors">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
          <path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/>
        </svg>
        Delete user
      </button>
    </div>
  );

  return (
    <div className="relative inline-flex justify-end">
      <button ref={btnRef} onClick={handleOpen}
        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f0efe9] transition-colors text-[#6b6860]">
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
        </svg>
      </button>
      {typeof window !== 'undefined' && open && createPortal(menu, document.body)}
    </div>
  );
}

export default function UsersPage() {
  const { role: rawRole, user } = useAuth();
  const role = rawRole ?? undefined;
  const [members, setMembers]         = useState<TeamMember[]>([]);
  const [invites, setInvites]         = useState<PendingInvite[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showInvite, setShowInvite]   = useState(false);
  const [inviteForm, setInviteForm]   = useState({ email: '', full_name: '', role: 'Viewer' as AppRole });
  const [inviting, setInviting]       = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [successMsg, setSuccessMsg]   = useState('');
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editRole, setEditRole]       = useState<AppRole>('Viewer');
  const [confirmDelete, setConfirmDelete] = useState<TeamMember | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: roles }, { data: inv }] = await Promise.all([
      supabase.from('user_roles').select('*').order('created_at', { ascending: true }),
      supabase.from('pending_invites').select('*').is('accepted_at', null).order('created_at', { ascending: false }),
    ]);

    // Enrich members with email from auth.users via RPC or admin — fall back to pending_invites email match
    const inviteEmailMap: Record<string, string> = {};
    (inv ?? []).forEach((i: any) => { if (i.email) inviteEmailMap[i.email] = i.email; });

    // Try to get emails from pending_invites by matching user_id if available
    const enriched = (roles ?? []).map((r: any) => {
      // Check if there's a pending invite with matching email
      const matchedInvite = (inv ?? []).find((i: any) =>
        i.full_name === r.full_name && i.role === r.role
      );
      return { ...r, email: matchedInvite?.email ?? r.email ?? null };
    });

    setMembers(enriched as TeamMember[]);
    setInvites((inv ?? []) as PendingInvite[]);
    setLoading(false);
  }

  async function handleInvite() {
    if (!inviteForm.email.trim()) { setInviteError('Email is required'); return; }
    setInviting(true); setInviteError('');
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteForm.email.trim().toLowerCase(),
          full_name: inviteForm.full_name.trim() || null,
          role: inviteForm.role,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invite');

      setSuccessMsg(`Invitation sent to ${inviteForm.email}`);
      setInviteForm({ email: '', full_name: '', role: 'Viewer' });
      setShowInvite(false);
      await loadData();
    } catch (err: any) {
      setInviteError(err.message || 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  }

  async function handleUpdateRole(memberId: string, newRole: AppRole) {
    await supabase.from('user_roles').update({ role: newRole }).eq('id', memberId);
    setEditingId(null);
    await loadData();
  }

  async function handleDeactivate(m: TeamMember) {
    await supabase.from('user_roles').update({ is_active: !m.is_active }).eq('id', m.id);
    await loadData();
  }

  async function handleDelete(m: TeamMember) {
    try {
      const res = await fetch(`/api/users/${m.user_id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        setSuccessMsg(''); // clear any prior success
        alert(data.error || 'Failed to delete user');
        return;
      }
      setSuccessMsg(`${m.full_name ?? 'User'} has been deleted.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      alert('Failed to delete user');
    } finally {
      setConfirmDelete(null);
      await loadData();
    }
  }

  async function handleResend(email: string, role?: AppRole) {
    if (!email) { setSuccessMsg('No email found for this user — they may need to be re-invited manually.'); setTimeout(() => setSuccessMsg(''), 5000); return; }
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, full_name: null, role: role ?? 'Viewer' }),
      });
      if (res.ok) {
        setSuccessMsg(`Magic link resent to ${email}`);
        setTimeout(() => setSuccessMsg(''), 4000);
      }
    } catch {}
  }

  async function handleRevokeInvite(id: string) {
    await supabase.from('pending_invites').delete().eq('id', id);
    await loadData();
  }

  const initials = (name: string | null) =>
    (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const avatarBg = (str: string) => {
    const colors = ['#2d5be3','#7c3aed','#16a34a','#d97706','#dc2626','#0891b2','#be185d'];
    return colors[[...str].reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length];
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-[#9b9890] text-[13px]">Loading…</div>
  );

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Users & Permissions</h1>
          <p className="text-[13px] text-[#9b9890] mt-0.5">Manage users and their access to your account</p>
        </div>
        {can.inviteUser(role) && (
          <button onClick={() => { setShowInvite(true); setInviteError(''); setSuccessMsg(''); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="8.5" cy="7" r="4"/>
              <line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
            </svg>
            Invite User
          </button>
        )}
      </div>

      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-[8px] px-4 py-3 text-[12.5px] text-green-700 mb-4 flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 flex-shrink-0">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {successMsg}
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <div className="bg-white border border-[#e8e6df] rounded-xl p-5 mb-5 shadow-sm">
          <div className="text-[14px] font-semibold mb-1">Invite a Team Member</div>
          <p className="text-[12px] text-[#9b9890] mb-4">They'll receive a magic link to sign in and their role will be assigned automatically.</p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-[11.5px] font-medium mb-1">Email address *</label>
              <input type="email" value={inviteForm.email}
                onChange={e => setInviteForm(f => ({...f, email: e.target.value}))}
                placeholder="name@company.com" className={inputCls} />
            </div>
            <div>
              <label className="block text-[11.5px] font-medium mb-1">Full name</label>
              <input type="text" value={inviteForm.full_name}
                onChange={e => setInviteForm(f => ({...f, full_name: e.target.value}))}
                placeholder="Jane Smith" className={inputCls} />
            </div>
            <div>
              <label className="block text-[11.5px] font-medium mb-1">Role</label>
              <select value={inviteForm.role}
                onChange={e => setInviteForm(f => ({...f, role: e.target.value as AppRole}))}
                className={inputCls}>
                {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <p className="text-[11px] text-[#9b9890] mt-1">{ROLE_META[inviteForm.role].description}</p>
            </div>
          </div>
          {inviteError && <p className="text-[11.5px] text-red-500 mb-3">{inviteError}</p>}
          <div className="flex gap-2">
            <button onClick={handleInvite} disabled={inviting}
              className="px-4 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] disabled:opacity-60 transition-colors">
              {inviting ? 'Sending…' : 'Send Invitation'}
            </button>
            <button onClick={() => setShowInvite(false)}
              className="px-4 py-1.5 rounded-[7px] text-[12.5px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Team Members */}
      <div className="bg-white border border-[#e8e6df] rounded-xl overflow-hidden mb-5">
        <div className="px-6 py-4 border-b border-[#e8e6df]">
          <div className="text-[15px] font-semibold">Team Members</div>
          <p className="text-[12px] text-[#9b9890] mt-0.5">Manage your team members and their account permissions.</p>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e8e6df]">
              {['USER','ROLE','STATUS','ACTIONS'].map(h => (
                <th key={h} className="text-left text-[10.5px] font-semibold text-[#9b9890] tracking-wide px-6 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e8e6df]">
            {members.map(m => (
              <tr key={m.id} className="hover:bg-[#fafaf8] transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                      style={{ backgroundColor: avatarBg(m.user_id) }}>
                      {initials(m.full_name)}
                    </div>
                    <div>
                      <div className="text-[13.5px] font-medium text-[#1a1915]">{m.full_name ?? 'Unknown'}</div>
                      <div className="text-[12px] text-[#9b9890]">{m.user_id.slice(0, 8)}…</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {editingId === m.id ? (
                    <div className="flex items-center gap-2">
                      <select value={editRole} onChange={e => setEditRole(e.target.value as AppRole)}
                        className="px-2 py-1.5 rounded-[6px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3]">
                        {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <button onClick={() => handleUpdateRole(m.id, editRole)}
                        className="text-[12px] text-[#2d5be3] font-medium hover:underline">Save</button>
                      <button onClick={() => setEditingId(null)}
                        className="text-[12px] text-[#9b9890] hover:underline">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                        className="w-3.5 h-3.5 text-amber-500">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      </svg>
                      <span className="text-[13.5px] text-[#1a1915]">{m.role}</span>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium ${m.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3">
                      {m.is_active ? <polyline points="20 6 9 17 4 12"/> : <line x1="18" y1="6" x2="6" y2="18"/>}
                    </svg>
                    {m.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <ActionsMenu
                    member={m}
                    isSelf={m.user_id === user?.id}
                    canManage={!!can.manageTeam(role)}
                    onChangeRole={() => { setEditingId(m.id); setEditRole(m.role); }}
                    onDeactivate={() => handleDeactivate(m)}
                    onResend={() => handleResend(m.email ?? '', m.role)}
                    onDelete={() => setConfirmDelete(m)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div className="bg-white border border-[#e8e6df] rounded-xl overflow-hidden mb-5">
          <div className="px-6 py-4 border-b border-[#e8e6df]">
            <div className="text-[15px] font-semibold">Pending Invitations</div>
            <p className="text-[12px] text-[#9b9890] mt-0.5">{invites.length} invitation{invites.length !== 1 ? 's' : ''} awaiting acceptance</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e8e6df]">
                {['USER','ROLE','SENT','ACTIONS'].map(h => (
                  <th key={h} className={`text-left text-[10.5px] font-semibold text-[#9b9890] tracking-wide px-6 py-3 ${h === 'ACTIONS' ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e6df]">
              {invites.map(inv => (
                <tr key={inv.id} className="hover:bg-[#fafaf8] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#f0efe9] flex items-center justify-center text-[#9b9890] text-[11px] font-bold flex-shrink-0">
                        {initials(inv.full_name ?? inv.email.split('@')[0])}
                      </div>
                      <div>
                        <div className="text-[13.5px] font-medium text-[#1a1915]">{inv.full_name ?? inv.email.split('@')[0]}</div>
                        <div className="text-[12px] text-[#9b9890]">{inv.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                        className="w-3.5 h-3.5 text-amber-500">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                      </svg>
                      <span className="text-[13.5px] text-[#1a1915]">{inv.role}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[12px] text-[#9b9890]">
                    {new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => handleResend(inv.email, inv.role)}
                        className="text-[12px] text-[#2d5be3] hover:underline">Resend</button>
                      <button onClick={() => handleRevokeInvite(inv.id)}
                        className="text-[12px] text-red-500 hover:underline">Revoke</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Roles Reference */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-6">
        <div className="text-[15px] font-semibold mb-1">Roles & Permissions</div>
        <p className="text-[12px] text-[#9b9890] mb-4">Learn about the different roles and their permissions.</p>
        <div className="divide-y divide-[#e8e6df]">
          {ALL_ROLES.map(r => (
            <div key={r} className="py-4 flex items-start gap-4">
              <div className="flex items-center gap-2 w-32 flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                  className="w-4 h-4 text-amber-500 flex-shrink-0">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <span className="text-[13.5px] font-semibold">{r}</span>
              </div>
              <div className="flex-1">
                <p className="text-[12.5px] text-[#6b6860] mb-2">{ROLE_META[r].description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setConfirmDelete(null)}/>
          <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="text-[14px] font-semibold mb-2">Delete user?</div>
            <p className="text-[13px] text-[#6b6860] mb-5">
              This will permanently remove <span className="font-medium text-[#1a1915]">{confirmDelete.full_name ?? 'this user'}</span> from the portal. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-[8px] text-[12.5px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmDelete)}
                className="px-4 py-2 rounded-[8px] text-[12.5px] font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
