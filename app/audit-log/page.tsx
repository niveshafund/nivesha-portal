'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

type AuditLog = {
  id: string;
  action: string;
  actor_id: string;
  actor_email: string;
  target_email: string | null;
  details: string | null;
  created_at: string;
};

const ACTION_META: Record<string, { label: string; color: string; icon: React.ReactElement }> = {
  impersonate: {
    label: 'Impersonation',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  },
  user_invited: {
    label: 'User Invited',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>,
  },
  user_deleted: {
    label: 'User Deleted',
    color: 'bg-red-50 text-red-700 border-red-200',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>,
  },
  lp_deleted: {
    label: 'LP Deleted',
    color: 'bg-red-50 text-red-700 border-red-200',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  },
  fund_edited: {
    label: 'Fund Edited',
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  },
  company_added: {
    label: 'Company Added',
    color: 'bg-green-50 text-green-700 border-green-200',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
  },
  document_uploaded: {
    label: 'Document Uploaded',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>,
  },
};

const DEFAULT_META = {
  label: 'Action',
  color: 'bg-gray-50 text-gray-600 border-gray-200',
  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
};

function formatDetails(action: string, details: string | null, targetEmail: string | null): string {
  if (!details) return targetEmail ?? '';
  try {
    const d = JSON.parse(details);
    if (action === 'user_invited' || action === 'impersonate') {
      const parts = [];
      if (targetEmail) parts.push(targetEmail);
      if (d.role) parts.push(`as ${d.role}`);
      return parts.join(' ');
    }
    return Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(' · ');
  } catch {
    return details;
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const ACTION_FILTERS = [
  { value: '',                label: 'All Actions' },
  { value: 'impersonate',     label: 'Impersonation' },
  { value: 'user_invited',    label: 'User Invited' },
  { value: 'user_deleted',    label: 'User Deleted' },
  { value: 'lp_deleted',      label: 'LP Deleted' },
  { value: 'fund_edited',     label: 'Fund Edited' },
  { value: 'company_added',   label: 'Company Added' },
  { value: 'document_uploaded', label: 'Document Uploaded' },
];

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const { role } = useAuth();
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  // Redirect non-GPs
  useEffect(() => {
    if (role && role !== 'GP') router.replace('/dashboard');
  }, [role, router]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (actionFilter) q = q.eq('action', actionFilter);
    if (search.trim()) {
      const safeTerm = `%${search.trim().replace(/[,()]/g, '')}%`;
      q = q.or(`actor_email.ilike.${safeTerm},target_email.ilike.${safeTerm}`);
    }

    const { data, count, error } = await q;
    if (!error) {
      setLogs(data ?? []);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [page, actionFilter, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [actionFilter, search]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (role && role !== 'GP') return null;

  return (
    <div className="flex-1 min-h-screen bg-[#f9f8f5]">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2.5 mb-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 text-[#2d5be3]">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <h1 className="text-[22px] font-semibold tracking-tight text-[#1a1915]">Audit Log</h1>
          </div>
          <p className="text-[13px] text-[#9b9890]">
            All sensitive actions performed in the portal — visible to GPs only.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-xs">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              className="w-3.5 h-3.5 text-[#9b9890] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by email…"
              className="w-full pl-8 pr-3 py-2 text-[12.5px] border border-[#e8e6df] rounded-lg bg-white outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 transition-all"
            />
          </div>
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="px-3 py-2 text-[12.5px] border border-[#e8e6df] rounded-lg bg-white outline-none focus:border-[#2d5be3] transition-all text-[#3d3b35]"
          >
            {ACTION_FILTERS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <button onClick={fetchLogs}
            className="px-3 py-2 text-[12.5px] border border-[#e8e6df] rounded-lg bg-white hover:bg-[#f0efe9] transition-colors text-[#6b6860] flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Refresh
          </button>
          <span className="ml-auto text-[12px] text-[#9b9890]">
            {total.toLocaleString()} event{total !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <div className="bg-white border border-[#e8e6df] rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[13px] text-[#9b9890]">
              Loading audit log…
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
                className="w-10 h-10 text-[#c4c2bb] mb-3">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <p className="text-[13.5px] font-medium text-[#6b6860]">No audit events found</p>
              <p className="text-[12px] text-[#9b9890] mt-1">
                {actionFilter || search ? 'Try adjusting your filters' : 'Events will appear here as actions are performed'}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e8e6df] bg-[#f9f8f5]">
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-[#9b9890] uppercase tracking-wide">Time</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-[#9b9890] uppercase tracking-wide">Action</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-[#9b9890] uppercase tracking-wide">Actor</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-medium text-[#9b9890] uppercase tracking-wide">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const meta = ACTION_META[log.action] ?? DEFAULT_META;
                  return (
                    <tr key={log.id}
                      className={`border-b border-[#f0efe9] hover:bg-[#fafaf8] transition-colors ${i === logs.length - 1 ? 'border-0' : ''}`}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-[12px] text-[#3d3b35] font-mono">{timeAgo(log.created_at)}</div>
                        <div className="text-[10.5px] text-[#9b9890]">
                          {new Date(log.created_at).toLocaleString('en-US', {
                            month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] font-medium border ${meta.color}`}>
                          {meta.icon}
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-[12.5px] text-[#1a1915]">{log.actor_email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-[12.5px] text-[#3d3b35]">
                          {formatDetails(log.action, log.details, log.target_email)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-[12px] text-[#9b9890]">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-[12px] border border-[#e8e6df] rounded-lg bg-white hover:bg-[#f0efe9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                ← Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-[12px] border border-[#e8e6df] rounded-lg bg-white hover:bg-[#f0efe9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
