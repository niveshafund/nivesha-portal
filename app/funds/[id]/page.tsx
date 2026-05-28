'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import ImportModal from '@/components/ImportModal';
import { getFundById, getCompaniesByFund, getLPsByFund, getTransactionsByFund, getExpensesByFund, getFundMembers, getValuationsByFund, createFundMember, updateFundMember, deleteFundMember, DbFund, DbCompany, DbLP, DbTransaction, DbExpense, DbFundMember, FundMemberRole, DbValuation } from '@/lib/db';

type Tab = 'overview' | 'portfolio' | 'lps' | 'invested' | 'expenses' | 'members';

const fmt = (n: number): string => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
};
const fmtFull = (n: number | undefined | null): string => n == null ? '$0' : `$${n.toLocaleString()}`;
const fmtPct  = (n: number): string => `${n.toFixed(1)}%`;

const moicColor = (m: number) => m >= 3 ? 'text-green-600 font-semibold' : m >= 1.2 ? 'text-amber-600 font-semibold' : m > 0 && m < 1 ? 'text-red-600 font-semibold' : 'text-gray-400';
const irrColor  = (i: number) => i > 0 ? 'text-green-600' : i < 0 ? 'text-red-600' : 'text-gray-400';
const statusBadge = (s: string) => s === 'Active' ? 'bg-green-50 text-green-700' : s === 'Fundraising' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500';

const coColor = (name: string): string => {
  const palette = ['#2d5be3','#16a34a','#d97706','#7c3aed','#dc2626','#0891b2','#be185d','#059669'];
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return palette[Math.abs(hash) % palette.length];
};

// ── Option A: One row per company, round pills inline ────────
type GroupedTxnProps = {
  txns: any[];
  fundId: string;
  onImport: () => void;
};

function InvestedCapitalGrouped({ txns, fundId, onImport }: GroupedTxnProps) {
  // Group transactions by company
  const groups = React.useMemo(() => {
    const map = new Map<string, { company_name: string; company_id: string | null; txns: any[] }>();
    txns.forEach(t => {
      const key = t.company_name;
      if (!map.has(key)) map.set(key, { company_name: t.company_name, company_id: t.company_id, txns: [] });
      map.get(key)!.txns.push(t);
    });
    // Sort groups by most recent transaction date descending
    return Array.from(map.values()).sort((a, b) => {
      const aDate = [...a.txns].sort((x, y) => y.date.localeCompare(x.date))[0]?.date ?? '';
      const bDate = [...b.txns].sort((x, y) => y.date.localeCompare(x.date))[0]?.date ?? '';
      return bDate.localeCompare(aDate);
    });
  }, [txns]);

  const totalInvested = txns.filter(t => t.type === 'Investment').reduce((s, t) => s + t.amount, 0);
  const totalDistrib  = txns.filter(t => t.type === 'Distribution').reduce((s, t) => s + t.amount, 0);

  const fmtFull = (n: number) => `$${n.toLocaleString()}`;
  const fmtShort = (n: number) => n >= 1_000_000 ? `$${(n/1_000_000).toFixed(1)}m` : n >= 1_000 ? `$${(n/1_000).toFixed(0)}k` : `$${n.toLocaleString()}`;

  return (
    <div>
      <div className="mb-4">
        <p className="text-[12.5px] text-[#6b6860]">One row per company — all rounds visible inline.</p>
        <p className="text-[12px] text-[#9b9890] mt-1">
          💡 <strong>New company?</strong> Use "+ New Company Investment" &nbsp;·&nbsp;
          <strong>Follow-on?</strong> Click company name → Transactions → + Add Transaction
        </p>
      </div>
      <div className="bg-white border border-[#e8e6df] rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6df]">
          <div className="text-[13.5px] font-semibold">
            Invested Capital
            <span className="text-[#9b9890] font-normal text-[12px] ml-2">
              {groups.length} compan{groups.length !== 1 ? 'ies' : 'y'} · {txns.length} transaction{txns.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex gap-2">
            <button onClick={onImport} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">↑ Import</button>
            <a href={`/funds/${fundId}/investments/new`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">+ New Company Investment</a>
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="px-4 py-10 text-center text-[12.5px] text-[#9b9890]">
            No transactions yet. Click "+ New Company Investment" to record your first investment.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Company', 'Rounds', 'Discount %', 'Valuation Cap', 'Total Invested', 'Latest Date'].map(h => (
                  <th key={h} className="text-[11px] font-medium text-[#6b6860] text-left px-4 py-2.5 border-b border-[#e8e6df] bg-[#f9f8f5] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(g => {
                const investments = g.txns.filter(t => t.type === 'Investment');
                const totalInv    = investments.reduce((s, t) => s + t.amount, 0);
                // Sort txns newest-first for pill display
                const sortedTxns  = [...g.txns].sort((a, b) => b.date.localeCompare(a.date));
                const latestDate  = sortedTxns[0]?.date || '—';
                // Build round pills: "Instrument · $Xk · YYYY"
                const roundPills  = investments
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map(t => ({
                    label: `${t.instrument || 'Investment'} · ${fmtShort(t.amount)} · ${t.date?.slice(0, 4) ?? ''}`,
                    id: t.id,
                  }));

                // Aggregate discount % and valuation cap across all investment rounds
                // For multi-round: show latest round's terms; for single: show directly
                const latestInv = investments.sort((a, b) => b.date.localeCompare(a.date))[0];
                const discountPct  = latestInv?.discount_pct  ?? null;
                const valuationCap = latestInv?.valuation_cap ?? null;

                return (
                  <tr key={g.company_name} className="hover:bg-[#f9f8f5] transition-colors">
                    {/* Company name + avatar */}
                    <td className="px-4 py-3 border-b border-[#e8e6df]">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-[5px] flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                          style={{ background: coColor(g.company_name) }}
                        >
                          {g.company_name.slice(0, 2).toUpperCase()}
                        </div>
                        {g.company_id ? (
                          <a
                            href={`/funds/${fundId}/companies/${g.company_id}?from=invested`}
                            className="font-medium text-[13px] text-[#2d5be3] hover:underline"
                          >
                            {g.company_name}
                          </a>
                        ) : (
                          <span className="font-medium text-[13px]">{g.company_name}</span>
                        )}
                      </div>
                    </td>

                    {/* Round pills */}
                    <td className="px-4 py-3 border-b border-[#e8e6df]">
                      <div className="flex flex-wrap gap-1.5">
                        {roundPills.map(p => (
                          <span
                            key={p.id}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#f9f8f5] text-[#6b6860] border border-[#e8e6df] whitespace-nowrap"
                          >
                            {p.label}
                          </span>
                        ))}
                        {g.txns.filter(t => t.type === 'Distribution').map(t => (
                          <span
                            key={t.id}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-50 text-green-700 border border-green-100 whitespace-nowrap"
                          >
                            Distribution · {fmtShort(t.amount)} · {t.date?.slice(0, 4) ?? ''}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Discount % */}
                    <td className="px-4 py-3 border-b border-[#e8e6df] text-[12px] whitespace-nowrap">
                      {discountPct != null
                        ? <span className="font-medium text-amber-700">{discountPct}%</span>
                        : <span className="text-[#9b9890]">—</span>}
                    </td>

                    {/* Valuation Cap */}
                    <td className="px-4 py-3 border-b border-[#e8e6df] text-[12px] font-mono whitespace-nowrap">
                      {valuationCap != null
                        ? <span className="text-[#1a1917]">{fmtShort(valuationCap)}</span>
                        : <span className="text-[#9b9890]">—</span>}
                    </td>

                    {/* Total invested */}
                    <td className="px-4 py-3 border-b border-[#e8e6df] font-mono text-[13px] font-semibold text-red-600 whitespace-nowrap">
                      -{fmtShort(totalInv)}
                    </td>

                    {/* Latest date */}
                    <td className="px-4 py-3 border-b border-[#e8e6df] text-[12px] text-[#6b6860] whitespace-nowrap">
                      {latestDate}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {txns.length > 0 && (
          <div className="px-5 py-3 border-t border-[#e8e6df] bg-[#f9f8f5] flex gap-8 text-[12px]">
            <div><span className="text-[#6b6860]">Total Invested: </span><span className="font-mono font-semibold text-red-600">-{fmtFull(totalInvested)}</span></div>
            <div><span className="text-[#6b6860]">Total Distributions: </span><span className="font-mono font-semibold text-green-600">+{fmtFull(totalDistrib)}</span></div>
            <div><span className="text-[#6b6860]">Companies: </span><span className="font-semibold">{groups.length}</span></div>
          </div>
        )}
      </div>
    </div>
  );
}



// ── Role badge colors ─────────────────────────────────────────
const ROLE_COLORS: Record<FundMemberRole, string> = {
  'GP':         'bg-purple-100 text-purple-700',
  'Associate':  'bg-blue-100 text-blue-700',
  'Analyst':    'bg-cyan-100 text-cyan-700',
  'Finance':    'bg-amber-100 text-amber-700',
  'LP Manager': 'bg-green-100 text-green-700',
  'Viewer':     'bg-gray-100 text-gray-600',
};

const ROLES: FundMemberRole[] = ['GP','Associate','Analyst','Finance','LP Manager','Viewer'];

function MemberRow({
  member, onUpdate, onDelete,
}: {
  member: DbFundMember;
  onUpdate: (u: Partial<Pick<DbFundMember, 'name'|'email'|'role'|'title'|'is_active'>>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [form, setForm]       = React.useState({ name: member.name, email: member.email ?? '', role: member.role, title: member.title ?? '' });
  const [saving, setSaving]   = React.useState(false);

  if (editing) {
    return (
      <tr className="bg-[#f5f7ff]">
        <td className="px-4 py-2.5 border-b border-[#e8e6df]">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full px-2 py-1 rounded border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3]" />
        </td>
        <td className="px-4 py-2.5 border-b border-[#e8e6df]">
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as FundMemberRole }))}
            className="w-full px-2 py-1 rounded border border-[#e8e6df] text-[12px] outline-none focus:border-[#2d5be3] bg-white">
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </td>
        <td className="px-4 py-2.5 border-b border-[#e8e6df]">
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Title"
            className="w-full px-2 py-1 rounded border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3]" />
        </td>
        <td className="px-4 py-2.5 border-b border-[#e8e6df]">
          <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="email@company.com"
            className="w-full px-2 py-1 rounded border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3]" />
        </td>
        <td className="px-4 py-2.5 border-b border-[#e8e6df]">
          <div className="flex gap-2">
            <button disabled={saving} onClick={async () => {
              setSaving(true);
              await onUpdate({ name: form.name, email: form.email || undefined, role: form.role, title: form.title || undefined });
              setSaving(false); setEditing(false);
            }} className="text-[11.5px] text-[#2d5be3] hover:underline disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} className="text-[11.5px] text-[#9b9890] hover:underline">Cancel</button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-[#f9f8f5] transition-colors">
      <td className="px-4 py-2.5 border-b border-[#e8e6df]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
            style={{ background: coColor(member.name) }}>
            {member.name.slice(0,2).toUpperCase()}
          </div>
          <span className="font-medium text-[12.5px]">{member.name}</span>
        </div>
      </td>
      <td className="px-4 py-2.5 border-b border-[#e8e6df]">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${ROLE_COLORS[member.role]}`}>
          {member.role}
        </span>
      </td>
      <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860]">{member.title || '—'}</td>
      <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860]">{member.email || '—'}</td>
      <td className="px-4 py-2.5 border-b border-[#e8e6df]">
        <div className="flex gap-3">
          <button onClick={() => setEditing(true)} className="text-[11.5px] text-[#2d5be3] hover:underline">Edit</button>
          <button onClick={async () => {
            if (confirm(`Remove ${member.name} from this fund?`)) await onDelete();
          }} className="text-[11.5px] text-red-500 hover:underline">Remove</button>
        </div>
      </td>
    </tr>
  );
}

function FundDetailInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'overview');
  const [importModal, setImportModal] = useState<'lps' | 'companies' | 'investments' | null>(null);
  const [fund, setFund] = useState<DbFund | null>(null);
  const [companies, setCompanies] = useState<DbCompany[]>([]);
  const [lps, setLPs] = useState<DbLP[]>([]);
  const [txns, setTxns] = useState<DbTransaction[]>([]);
  const [expenses, setExpenses] = useState<DbExpense[]>([]);
  const [valuations, setValuations] = useState<DbValuation[]>([]);
  const [members, setMembers] = useState<DbFundMember[]>([]);
  const [memberForm, setMemberForm] = useState<{ name: string; email: string; role: FundMemberRole; title: string } | null>(null);
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [lpSearch, setLpSearch] = useState('');
  const [lpSort, setLpSort] = useState<'name-az' | 'name-za' | 'commitment-desc' | 'commitment-asc' | 'called-desc'>('name-az');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [f, cos, lpsData, txnsData, expsData, membersData, valsData] = await Promise.all([
          getFundById(id),
          getCompaniesByFund(id),
          getLPsByFund(id),
          getTransactionsByFund(id),
          getExpensesByFund(id),
          getFundMembers(id),
          getValuationsByFund(id),
        ]);
        setFund(f);
        setCompanies(cos);
        setLPs(lpsData);
        setTxns(txnsData);
        setExpenses(expsData);
        setMembers(membersData);
        setValuations(valsData);
      } finally {
        setLoading(false);
      }

    }
    load();
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-[#6b6860]">
      <svg className="animate-spin w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      Loading fund...
    </div>
  );

  if (!fund) return (
    <div className="p-8 text-center">
      <p className="text-[#9b9890] mb-3">Fund not found.</p>
      <Link href="/funds" className="text-[#2d5be3] hover:underline">← Back to Funds</Link>
    </div>
  );

  // Derived metrics
  const totalCommitted    = lps.reduce((s, lp) => s + lp.commitment, 0) || fund.committed;
  const totalCalled       = lps.reduce((s, lp) => s + lp.called, 0)    || fund.called;
  // Always derive from live transactions — fund.invested is written at creation and goes stale
  const totalInvested     = txns.filter(t => t.type === 'Investment').reduce((s, t) => s + t.amount, 0);
  const totalExpenses     = expenses.reduce((s, e) => s + e.amount, 0);
  const availCash         = totalCalled - totalInvested;
  const outstandingCap    = totalCommitted - totalCalled; // committed but not yet called

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview',  label: 'Overview' },
    { key: 'portfolio', label: 'Portfolio' },
    { key: 'lps',       label: 'Limited Partners' },
    { key: 'invested',  label: 'Invested Capital' },
    { key: 'expenses',  label: 'Expenses' },
    { key: 'members',   label: 'Members' },
  ];

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="flex items-center gap-2 text-[12.5px] text-[#6b6860] mb-2">
            <Link href="/funds" className="hover:text-[#2d5be3] transition-colors">← Funds</Link>
          </div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-[20px] font-semibold tracking-tight">{fund.name}</h1>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusBadge(fund.status)}`}>{fund.status}</span>
          </div>
          <div className="flex items-center gap-2 text-[12.5px] text-[#6b6860]">
            <span>Vintage {fund.vintage}</span>
            <span>·</span>
            <span>{fmtFull(fund.committed)}</span>
            <span>·</span>
            <span className="text-[#2d5be3]">Active</span>
          </div>
        </div>
        <Link href={`/funds/${id}/edit`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
          ✏️ Edit Fund
        </Link>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-[#e8e6df] mb-5 mt-4">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-all ${
              tab === t.key ? 'border-[#2d5be3] text-[#2d5be3]' : 'border-transparent text-[#6b6860] hover:text-[#1a1917]'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW ══ */}
      {tab === 'overview' && (
        <div>
          <p className="text-[12.5px] text-[#6b6860] mb-5">
            Comprehensive snapshot of your fund's performance and key metrics.
          </p>

          {/* 5 KPI tiles */}
          <div className="grid grid-cols-5 gap-3 mb-5">
            {[
              { label: 'Committed Capital',    value: fmt(totalCommitted), sub: 'Total LP commitments',         color: '' },
              { label: 'Invested Capital',     value: fmt(totalInvested),  sub: 'Deployed into companies',      color: '' },
              { label: 'Available Cash',       value: fmt(availCash),      sub: 'Called but not yet invested',  color: availCash >= 0 ? 'text-green-600' : 'text-red-600' },
              { label: 'Admin Fee Disbursed',  value: fmt(totalExpenses),  sub: 'Total expenses paid out',      color: 'text-amber-600' },
              { label: 'Outstanding Capital',  value: fmt(outstandingCap), sub: 'Committed but not yet called', color: 'text-[#6b6860]' },
            ].map(k => (
              <div key={k.label} className="bg-white border border-[#e8e6df] rounded-xl p-4">
                <label className="text-[11px] text-[#6b6860] block mb-1.5">{k.label}</label>
                <div className={`text-[18px] font-semibold font-mono mb-1 ${k.color}`}>{k.value}</div>
                <div className="text-[10.5px] text-[#9b9890]">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Performance metrics */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'Net IRR',  value: fund.irr  !== 0 ? `${fund.irr.toFixed(1)}%`   : '—', cls: irrColor(fund.irr) },
              { label: 'MOIC',    value: fund.moic  > 0   ? `${fund.moic.toFixed(2)}x`  : '—', cls: moicColor(fund.moic) },
              { label: 'DPI',     value: `${fund.dpi.toFixed(2)}x`,                             cls: 'text-[#9b9890]' },
            ].map(k => (
              <div key={k.label} className="bg-white border border-[#e8e6df] rounded-xl p-4">
                <label className="text-[11px] text-[#6b6860] block mb-1.5">{k.label}</label>
                <div className={`text-[24px] font-semibold font-mono ${k.cls}`}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Capital deployment bar */}
          <div className="bg-white border border-[#e8e6df] rounded-xl p-5 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[13.5px] font-semibold">Capital Deployment</div>
              <span className="text-[12px] text-[#6b6860]">
                {totalCommitted > 0 ? `${((totalCalled / totalCommitted) * 100).toFixed(0)}% called` : '0% called'}
              </span>
            </div>
            <div className="h-2 bg-[#f0f0ed] rounded-full mb-3">
              <div className="h-2 bg-[#2d5be3] rounded-full transition-all"
                style={{ width: `${totalCommitted > 0 ? Math.min(100, (totalCalled / totalCommitted) * 100) : 0}%` }} />
            </div>
            <div className="grid grid-cols-4 gap-4 text-[12px]">
              <div><span className="text-[#6b6860]">Committed: </span><span className="font-mono font-medium">{fmtFull(totalCommitted)}</span></div>
              <div><span className="text-[#6b6860]">Called: </span><span className="font-mono font-medium">{fmtFull(totalCalled)}</span></div>
              <div><span className="text-[#6b6860]">Invested: </span><span className="font-mono font-medium">{fmtFull(totalInvested)}</span></div>
              <div><span className="text-[#6b6860]">Outstanding: </span><span className="font-mono font-medium text-[#6b6860]">{fmtFull(outstandingCap)}</span></div>
            </div>
          </div>

          {/* Fund details */}
          <div className="bg-white border border-[#e8e6df] rounded-xl p-5">
            <div className="text-[13.5px] font-semibold mb-4">Fund Details</div>
            <div className="grid grid-cols-2 gap-x-12 gap-y-4">
              {[
                { label: 'Fund Name',          value: fund.name },
                { label: 'Commitment Amount',   value: fmtFull(fund.committed) },
                { label: 'Vintage Year',        value: String(fund.vintage) },
                { label: 'Currency',            value: fund.currency || 'USD' },
                { label: 'Status',              value: fund.status },
                { label: 'Target Fund Size',    value: fund.target_size ? fmt(fund.target_size) : '—' },
                { label: 'Management Fee',      value: `${fund.management_fee}%` },
                { label: 'Carried Interest',    value: `${fund.carried_interest}%` },
                { label: 'Hurdle Rate',         value: `${fund.hurdle_rate}%` },
                { label: 'Fund Life',           value: `${fund.fund_life} years` },
                { label: 'Investment Focus',    value: (fund.focus ?? []).join(', ') || '—' },
                { label: 'Description',         value: fund.description || '—' },
              ].map(row => (
                <div key={row.label} className="border-b border-[#f0f0ed] pb-3">
                  <div className="text-[11.5px] text-[#9b9890] mb-0.5">{row.label}</div>
                  <div className="text-[13px] font-medium">{row.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ PORTFOLIO ══ */}
      {tab === 'portfolio' && (() => {
        // Build transaction-level rows — one row per Investment transaction
        // MOIC = Current Valuation / Entry Valuation (valuation_cap at time of investment)
        // DPI  = Distributions / Invested (realised returns only)
        // IRR  = shown as — (requires XIRR; avoided to prevent wrong numbers)

        // Build lookup maps from live txns
        const investmentTxns = txns
          .filter(t => t.type === 'Investment' && t.company_id)
          .sort((a, b) => a.date.localeCompare(b.date)); // oldest first

        const distribByCompany = txns
          .filter(t => t.type === 'Distribution' && t.company_id)
          .reduce<Record<string, number>>((acc, t) => {
            acc[t.company_id!] = (acc[t.company_id!] || 0) + t.amount;
            return acc;
          }, {});

        // Company lookup by id
        const companyMap = Object.fromEntries(companies.map(c => [c.id, c]));

        // Build latest valuation lookup per company
        // valuations are sorted newest-first from DB
        const latestValByCompany = valuations.reduce<Record<string, DbValuation>>((acc, v) => {
          if (v.company_id && !acc[v.company_id]) acc[v.company_id] = v;
          return acc;
        }, {});

        // Build one row per investment transaction
        const rows = investmentTxns.map(t => {
          const co         = companyMap[t.company_id!];
          const entryVal   = t.valuation_cap ?? null;   // company valuation when we invested
          const latestVal  = t.company_id ? latestValByCompany[t.company_id] : null;
          // currentInvValue = investment value from latest valuation entry
          // Falls back to invested amount if no valuation recorded yet
          const currentInvValue = latestVal?.value ?? t.amount;
          // currentCoVal = total company valuation (stored in companies.valuation or entry val if no update)
          const currentCoVal = co?.valuation ?? entryVal ?? 0;
          const distribAmt = distribByCompany[t.company_id!] ?? 0;
          // MOIC = current investment value / amount invested
          const moic = (currentInvValue > 0 && t.amount > 0)
            ? currentInvValue / t.amount
            : null;
          // DPI = total distributions / amount invested
          const dpi = t.amount > 0 && distribAmt > 0 ? distribAmt / t.amount : null;
          // IRR (CAGR) = (currentInvValue / invested) ^ (1/years) - 1
          const investDate = t.date ? new Date(t.date) : null;
          const today      = new Date();
          const years      = investDate
            ? (today.getTime() - investDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
            : 0;
          const irr = (years > 0.01 && currentInvValue > 0 && t.amount > 0)
            ? ((currentInvValue / t.amount) ** (1 / years) - 1) * 100
            : null;
          return { t, co, entryVal, currentInvValue, currentCoVal, distribAmt, moic, dpi, irr };
        });

        // Footer totals
        const totalInvested      = rows.reduce((s, r) => s + r.t.amount, 0);
        const totalCurrentInvVal = rows.reduce((s, r) => s + (r.currentInvValue || 0), 0);
        const totalDistrib       = Object.values(distribByCompany).reduce((s, v) => s + v, 0);

        return (
          <div>
            <p className="text-[12.5px] text-[#6b6860] mb-4">
              One row per investment transaction. MOIC = Current Investment Value ÷ Amount Invested.
            </p>
            <div className="bg-white border border-[#e8e6df] rounded-xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6df]">
                <div className="text-[13.5px] font-semibold">
                  Portfolio Companies
                  <span className="text-[#9b9890] font-normal text-[12px] ml-2">
                    ({companies.length} compan{companies.length !== 1 ? 'ies' : 'y'} · {rows.length} investment{rows.length !== 1 ? 's' : ''})
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setImportModal('companies')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">↑ Import</button>
                  <Link href={`/funds/${id}/investments/new`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">+ Add Company</Link>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {['Company','Sector','Date','Instrument','Invested','Entry Valuation','Current Inv. Value','Current Co. Valuation','Distributions','MOIC','IRR','DPI','Status'].map(h => (
                        <th key={h} className="text-[11px] font-medium text-[#6b6860] text-left px-4 py-2.5 border-b border-[#e8e6df] bg-[#f9f8f5] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={13} className="px-4 py-10 text-center text-[12.5px] text-[#9b9890]">
                        No investments yet. Click "+ Add Company" to record your first investment.
                      </td></tr>
                    ) : rows.map(({ t, co, entryVal, currentInvValue, currentCoVal, distribAmt, moic, dpi, irr }) => (
                      <tr key={t.id} className="hover:bg-[#f9f8f5] transition-colors">
                        {/* Company */}
                        <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-[5px] flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                              style={{ background: coColor(t.company_name) }}>
                              {t.company_name.slice(0, 2).toUpperCase()}
                            </div>
                            {co ? (
                              <a href={`/funds/${id}/companies/${co.id}?from=portfolio`}
                                className="font-medium text-[12.5px] text-[#2d5be3] hover:underline">
                                {t.company_name}
                              </a>
                            ) : (
                              <span className="font-medium text-[12.5px]">{t.company_name}</span>
                            )}
                          </div>
                        </td>
                        {/* Sector */}
                        <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860]">
                          {co?.sector || '—'}
                        </td>
                        {/* Date */}
                        <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860] whitespace-nowrap">
                          {t.date}
                        </td>
                        {/* Instrument */}
                        <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#f9f8f5] text-[#6b6860] border border-[#e8e6df] whitespace-nowrap">
                            {t.instrument}
                          </span>
                        </td>
                        {/* Invested */}
                        <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">
                          {fmtFull(t.amount)}
                        </td>
                        {/* Entry Valuation — company valuation at investment */}
                        <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">
                          {entryVal ? fmtFull(entryVal) : '—'}
                        </td>
                        {/* Current Investment Value — your stake's worth from latest valuation */}
                        <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px] text-green-700">
                          {currentInvValue > 0 ? fmtFull(currentInvValue) : '—'}
                        </td>
                        {/* Current Company Valuation */}
                        <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px] text-[#6b6860]">
                          {currentCoVal > 0 ? fmtFull(currentCoVal) : '—'}
                        </td>
                        {/* Distributions */}
                        <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">
                          {distribAmt > 0
                            ? <span className="text-green-600">{fmtFull(distribAmt)}</span>
                            : '—'}
                        </td>
                        {/* MOIC = Current Inv Value / Invested */}
                        <td className={`px-4 py-2.5 border-b border-[#e8e6df] text-[12.5px] ${moic != null ? moicColor(moic) : 'text-[#9b9890]'}`}>
                          {moic != null ? `${moic.toFixed(2)}x` : '—'}
                        </td>
                        {/* IRR */}
                        <td className={`px-4 py-2.5 border-b border-[#e8e6df] text-[12px] ${irr != null && irr > 0 ? 'text-green-600' : irr != null && irr < 0 ? 'text-red-600' : 'text-[#9b9890]'}`}>
                          {irr != null ? `${irr.toFixed(1)}%` : '—'}
                        </td>
                        {/* DPI = Distributions / Invested */}
                        <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860]">
                          {dpi != null ? `${dpi.toFixed(2)}x` : '—'}
                        </td>
                        {/* Status */}
                        <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            co?.status === 'Active'  ? 'bg-green-50 text-green-700' :
                            co?.status === 'Exited'  ? 'bg-blue-50 text-blue-700'  :
                                                       'bg-red-50 text-red-700'
                          }`}>{co?.status ?? 'Active'}</span>
                        </td>
                      </tr>
                    ))}
                    {/* ── Footer totals row ── */}
                    {rows.length > 0 && (
                      <tr className="bg-[#f9f8f5] text-[12px] font-medium border-t-2 border-[#e8e6df]">
                        {/* Company count */}
                        <td className="px-4 py-3 text-[#6b6860]" colSpan={4}>
                          {companies.length} compan{companies.length !== 1 ? 'ies' : 'y'} · {rows.length} investment{rows.length !== 1 ? 's' : ''}
                        </td>
                        {/* Total Invested */}
                        <td className="px-4 py-3 font-mono font-semibold">{fmtFull(totalInvested)}</td>
                        {/* Entry Valuation — no total */}
                        <td className="px-4 py-3 text-[#9b9890]">—</td>
                        {/* Total Current Investment Value */}
                        <td className="px-4 py-3 font-mono font-semibold text-green-700">
                          {totalCurrentInvVal > 0 ? fmtFull(totalCurrentInvVal) : '—'}
                        </td>
                        {/* Current Co. Valuation — no total */}
                        <td className="px-4 py-3 text-[#9b9890]">—</td>
                        {/* Total Distributions */}
                        <td className="px-4 py-3 font-mono font-semibold text-green-600">
                          {totalDistrib > 0 ? fmtFull(totalDistrib) : '—'}
                        </td>
                        {/* Blended MOIC */}
                        <td className="px-4 py-3">
                          {(() => {
                            const blended = totalInvested > 0 && totalCurrentInvVal > 0 ? totalCurrentInvVal / totalInvested : null;
                            return blended != null
                              ? <span className={moicColor(blended)}>{blended.toFixed(2)}x</span>
                              : '—';
                          })()}
                        </td>
                        {/* IRR — no total */}
                        <td className="px-4 py-3 text-[#9b9890]">—</td>
                        {/* DPI total */}
                        <td className="px-4 py-3 text-[#6b6860]">
                          {totalInvested > 0 && totalDistrib > 0 ? `${(totalDistrib / totalInvested).toFixed(2)}x` : '—'}
                        </td>
                        <td className="px-4 py-3" />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ LIMITED PARTNERS ══ */}
      {tab === 'lps' && (() => {
        // Filter + sort
        const filtered = lps
          .filter(lp =>
            lp.name.toLowerCase().includes(lpSearch.toLowerCase()) ||
            (lp.email || '').toLowerCase().includes(lpSearch.toLowerCase()) ||
            (lp.gp_contact || '').toLowerCase().includes(lpSearch.toLowerCase())
          )
          .sort((a, b) => {
            if (lpSort === 'name-az')         return a.name.localeCompare(b.name);
            if (lpSort === 'name-za')         return b.name.localeCompare(a.name);
            if (lpSort === 'commitment-desc') return b.commitment - a.commitment;
            if (lpSort === 'commitment-asc')  return a.commitment - b.commitment;
            if (lpSort === 'called-desc')     return b.called - a.called;
            return 0;
          });

        return (
          <div>
            {lps.length === 0 && (
              <div className="bg-[#eef2fd] border border-[#c7d7f9] rounded-xl p-5 mb-5">
                <div className="font-semibold text-[#2d5be3] mb-2">Getting Started</div>
                <div className="space-y-2 text-[12.5px]">
                  <div className="flex gap-2"><span className="w-5 h-5 rounded-full bg-[#2d5be3] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">1</span><div><strong>Add your Limited Partners</strong> — LP is an investor in your fund with their commitment and capital call details.</div></div>
                  <div className="flex gap-2"><span className="w-5 h-5 rounded-full bg-[#2d5be3] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">2</span><div><strong>Record capital calls</strong> — Track each installment payment from LPs as they wire funds to the fund.</div></div>
                </div>
              </div>
            )}
            <div className="bg-white border border-[#e8e6df] rounded-xl">
              {/* Header row */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6df]">
                <div className="text-[13.5px] font-semibold">
                  Limited Partners
                  <span className="text-[#9b9890] font-normal text-[12px] ml-2">
                    {filtered.length}{filtered.length !== lps.length ? ` of ${lps.length}` : ''}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => {
                    const headers = ['Investor Name*','Investing As','Commitment Amount*','Currency*','Called Capital','Distributions','Commitment Date','Email','Phone','GP Contact','Address Line 1','Address Line 2','City','State','ZIP Code','Country','Notes'];
                    const rows = lps.map(lp => [lp.name,'',lp.commitment,'USD',lp.called,lp.distributions,lp.join_date||'',lp.email||'',lp.phone||'',lp.gp_contact||'',lp.address_line1||'',lp.address_line2||'',lp.city||'',lp.state||'',lp.zip||'',lp.country||'',lp.notes||'']);
                    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))].join('\n');
                    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download = 'limited_partners.csv'; a.click();
                  }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">↓ Export</button>
                  <button onClick={() => setImportModal('lps')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">↑ Import</button>
                  <Link href={`/funds/${id}/lps/new`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">+ Add Limited Partner</Link>
                </div>
              </div>

              {/* Search + Sort toolbar */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-[#e8e6df] bg-[#fafaf8]">
                <div className="relative flex-1 max-w-xs">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9b9890]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                  <input
                    type="text"
                    value={lpSearch}
                    onChange={e => setLpSearch(e.target.value)}
                    placeholder="Search by name, email, GP…"
                    className="w-full pl-8 pr-3 py-1.5 rounded-[7px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3] bg-white"
                  />
                  {lpSearch && (
                    <button onClick={() => setLpSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9b9890] hover:text-[#1a1917] text-[14px]">×</button>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11.5px] text-[#9b9890]">Sort:</span>
                  <select
                    value={lpSort}
                    onChange={e => setLpSort(e.target.value as any)}
                    className="px-2 py-1.5 rounded-[7px] border border-[#e8e6df] text-[12px] outline-none focus:border-[#2d5be3] bg-white"
                  >
                    <option value="name-az">Name (A–Z)</option>
                    <option value="name-za">Name (Z–A)</option>
                    <option value="commitment-desc">Commitment (High–Low)</option>
                    <option value="commitment-asc">Commitment (Low–High)</option>
                    <option value="called-desc">Called (High–Low)</option>
                  </select>
                </div>
                {lpSearch && (
                  <span className="text-[11.5px] text-[#9b9890]">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead><tr>
                    {[
                      { key: 'name',       label: 'Investor' },
                      { key: 'type',       label: 'Type' },
                      { key: 'commitment', label: 'Commitment' },
                      { key: 'called',     label: 'Called' },
                      { key: 'distrib',    label: 'Distributions' },
                      { key: 'pct',        label: '% of Fund' },
                      { key: 'gp',         label: 'GP Contact' },
                    ].map(h => (
                      <th key={h.key}
                        onClick={() => {
                          if (h.key === 'name')       setLpSort(s => s === 'name-az' ? 'name-za' : 'name-az');
                          if (h.key === 'commitment') setLpSort(s => s === 'commitment-desc' ? 'commitment-asc' : 'commitment-desc');
                          if (h.key === 'called')     setLpSort('called-desc');
                        }}
                        className={`text-[11px] font-medium text-[#6b6860] text-left px-4 py-2.5 border-b border-[#e8e6df] bg-[#f9f8f5] whitespace-nowrap ${['name','commitment','called'].includes(h.key) ? 'cursor-pointer hover:text-[#1a1917] select-none' : ''}`}
                      >
                        {h.label}
                        {h.key === 'name'       && <span className="ml-1 text-[10px]">{lpSort === 'name-az' ? '↑' : lpSort === 'name-za' ? '↓' : ''}</span>}
                        {h.key === 'commitment' && <span className="ml-1 text-[10px]">{lpSort === 'commitment-desc' ? '↓' : lpSort === 'commitment-asc' ? '↑' : ''}</span>}
                        {h.key === 'called'     && <span className="ml-1 text-[10px]">{lpSort === 'called-desc' ? '↓' : ''}</span>}
                      </th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-10 text-center text-[12.5px] text-[#9b9890]">
                        {lps.length === 0 ? 'No LPs yet. Click "Add Limited Partner" to add your first investor.' : `No results for "${lpSearch}"`}
                      </td></tr>
                    ) : filtered.map(lp => (
                      <tr key={lp.id} className="hover:bg-[#f9f8f5] transition-colors cursor-pointer" onClick={() => window.location.href = `/funds/${id}/lps/${lp.id}`}>
                        <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                          <div className="font-medium text-[12.5px] text-[#2d5be3] hover:underline">{lp.name}</div>
                          <div className="text-[11px] text-[#9b9890]">{lp.email}</div>
                        </td>
                        <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#eef2fd] text-[#2d5be3] font-medium">{lp.type}</span>
                        </td>
                        <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">{fmtFull(lp.commitment)}</td>
                        <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">{fmtFull(lp.called)}</td>
                        <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">{lp.distributions > 0 ? fmtFull(lp.distributions) : '—'}</td>
                        <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px]">{fmtPct(lp.ownership_pct)}</td>
                        <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860]">
                          {lp.gp_contact
                            ? <span className="inline-flex items-center gap-1"><span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[7px] font-bold flex-shrink-0" style={{ background: coColor(lp.gp_contact) }}>{lp.gp_contact.slice(0,1)}</span>{lp.gp_contact}</span>
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  {/* ── Footer totals row — inside same table for column alignment ── */}
                  {lps.length > 0 && (
                    <tr className="text-[12px] border-t border-[#e8e6df] bg-[#f9f8f5]">
                      <td className="px-4 py-3 text-[#6b6860] font-medium">
                        {lps.length} LP{lps.length !== 1 ? 's' : ''}
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 font-mono font-semibold">
                        {fmtFull(lps.reduce((s, lp) => s + lp.commitment, 0))}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold">
                        {fmtFull(lps.reduce((s, lp) => s + lp.called, 0))}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold">
                        {lps.reduce((s, lp) => s + lp.distributions, 0) > 0
                          ? fmtFull(lps.reduce((s, lp) => s + lp.distributions, 0))
                          : <span className="text-[#9b9890]">—</span>}
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                    </tr>
                  )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ INVESTED CAPITAL ══ */}
      {tab === 'invested' && (
        <InvestedCapitalGrouped
          txns={txns}
          fundId={id}
          onImport={() => setImportModal('investments')}
        />
      )}


      {/* ══ EXPENSES ══ */}
      {tab === 'expenses' && (
        <div>
          <p className="text-[12.5px] text-[#6b6860] mb-4">Quarterly management fees and other fund expenses.</p>
          <div className="bg-white border border-[#e8e6df] rounded-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6df]">
              <div className="text-[13.5px] font-semibold">Expenses <span className="text-[#9b9890] font-normal text-[12px]">({expenses.length} entries)</span></div>
              <Link href={`/funds/${id}/expenses/new`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">+ Add Expense</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead><tr>
                  {['Date','Quarter','Type','Amount','Description'].map(h => (
                    <th key={h} className="text-[11px] font-medium text-[#6b6860] text-left px-4 py-2.5 border-b border-[#e8e6df] bg-[#f9f8f5] whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {expenses.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-[12.5px] text-[#9b9890]">
                      No expenses recorded. Click "Add Expense" to record a management fee or other expense.
                    </td></tr>
                  ) : expenses.map(e => (
                    <tr key={e.id} className="hover:bg-[#f9f8f5] transition-colors">
                      <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860] whitespace-nowrap">{e.date}</td>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px]"><span className="px-1.5 py-0.5 rounded text-[10px] bg-[#f9f8f5] border border-[#e8e6df]">{e.quarter}</span></td>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df]"><span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700">{e.type}</span></td>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px] font-medium text-amber-600">-{fmtFull(e.amount)}</td>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860]">{e.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {expenses.length > 0 && (
              <div className="px-5 py-3 border-t border-[#e8e6df] bg-[#f9f8f5] flex gap-8 text-[12px]">
                <div><span className="text-[#6b6860]">Total Expenses: </span><span className="font-mono font-semibold text-amber-600">-{fmtFull(totalExpenses)}</span></div>
                <div><span className="text-[#6b6860]">Management Fees: </span><span className="font-mono font-semibold">-{fmtFull(expenses.filter(e=>e.type==='Management Fee').reduce((s,e)=>s+e.amount,0))}</span></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ MEMBERS ══ */}
      {tab === 'members' && (
        <div>
          <p className="text-[12.5px] text-[#6b6860] mb-4">
            Manage who has access to this fund and their roles.
          </p>

          {/* Role legend */}
          <div className="bg-white border border-[#e8e6df] rounded-xl p-4 mb-4">
            <div className="text-[12px] font-semibold text-[#6b6860] mb-3">Role Permissions</div>
            <div className="grid grid-cols-3 gap-3">
              {([
                { role: 'GP',         color: 'bg-purple-100 text-purple-700', desc: 'Full access — create funds, approve investments, manage team' },
                { role: 'Associate',  color: 'bg-blue-100 text-blue-700',     desc: 'Edit portfolio companies, add transactions, no fund creation' },
                { role: 'Analyst',    color: 'bg-cyan-100 text-cyan-700',     desc: 'Read-only on portfolio & metrics, can add company updates' },
                { role: 'Finance',    color: 'bg-amber-100 text-amber-700',   desc: 'Full LP data, capital calls, expenses & distributions' },
                { role: 'LP Manager', color: 'bg-green-100 text-green-700',   desc: 'LP communication, capital call scheduling, read-only portfolio' },
                { role: 'Viewer',     color: 'bg-gray-100 text-gray-600',     desc: 'Read-only dashboard, no sensitive LP data' },
              ] as { role: FundMemberRole; color: string; desc: string }[]).map(r => (
                <div key={r.role} className="flex gap-2 items-start">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap mt-0.5 ${r.color}`}>{r.role}</span>
                  <span className="text-[11.5px] text-[#6b6860]">{r.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-[#e8e6df] rounded-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6df]">
              <div className="text-[13.5px] font-semibold">
                Fund Members
                <span className="text-[#9b9890] font-normal text-[12px] ml-2">({members.length})</span>
              </div>
              <button
                onClick={() => { setMemberForm({ name: '', email: '', role: 'Viewer', title: '' }); setMemberError(null); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors"
              >
                + Add Member
              </button>
            </div>

            {/* Add member inline form */}
            {memberForm !== null && (
              <div className="px-5 py-4 border-b border-[#e8e6df] bg-[#f5f7ff]">
                <div className="text-[12.5px] font-semibold mb-3">New Member</div>
                {memberError && (
                  <div className="bg-red-50 border border-red-200 rounded-[7px] px-3 py-2 text-[12px] text-red-700 mb-3">⚠️ {memberError}</div>
                )}
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div>
                    <label className="block text-[11.5px] font-medium mb-1">Name <span className="text-red-500">*</span></label>
                    <input
                      type="text" value={memberForm.name} placeholder="Full name"
                      onChange={e => setMemberForm(f => f ? { ...f, name: e.target.value } : f)}
                      className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11.5px] font-medium mb-1">Email</label>
                    <input
                      type="email" value={memberForm.email} placeholder="name@company.com"
                      onChange={e => setMemberForm(f => f ? { ...f, email: e.target.value } : f)}
                      className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11.5px] font-medium mb-1">Role <span className="text-red-500">*</span></label>
                    <select
                      value={memberForm.role}
                      onChange={e => setMemberForm(f => f ? { ...f, role: e.target.value as FundMemberRole } : f)}
                      className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3] bg-white"
                    >
                      {(['GP','Associate','Analyst','Finance','LP Manager','Viewer'] as FundMemberRole[]).map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11.5px] font-medium mb-1">Title</label>
                    <input
                      type="text" value={memberForm.title} placeholder="e.g. Managing Partner"
                      onChange={e => setMemberForm(f => f ? { ...f, title: e.target.value } : f)}
                      className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3]"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!memberForm.name.trim()) { setMemberError('Name is required'); return; }
                      setMemberSaving(true); setMemberError(null);
                      try {
                        await createFundMember({
                          fund_id:   id,
                          name:      memberForm.name.trim(),
                          email:     memberForm.email || undefined,
                          role:      memberForm.role,
                          title:     memberForm.title || undefined,
                          is_active: true,
                        });
                        setMembers(await getFundMembers(id));
                        setMemberForm(null);
                      } catch (err: any) {
                        setMemberError(err.message ?? 'Failed to add member');
                      } finally {
                        setMemberSaving(false);
                      }
                    }}
                    disabled={memberSaving}
                    className="px-4 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] disabled:opacity-60 transition-colors"
                  >
                    {memberSaving ? 'Saving…' : 'Save Member'}
                  </button>
                  <button
                    onClick={() => { setMemberForm(null); setMemberError(null); }}
                    className="px-4 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <table className="w-full border-collapse">
              <thead><tr>
                {['Member','Role','Title','Email','Actions'].map(h => (
                  <th key={h} className="text-[11px] font-medium text-[#6b6860] text-left px-4 py-2.5 border-b border-[#e8e6df] bg-[#f9f8f5] whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {members.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-[12.5px] text-[#9b9890]">
                    No members yet. Click "+ Add Member" to add your first team member.
                  </td></tr>
                ) : members.map(m => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    onUpdate={async (updates) => {
                      await updateFundMember(m.id, updates);
                      setMembers(await getFundMembers(id));
                    }}
                    onDelete={async () => {
                      await deleteFundMember(m.id);
                      setMembers(await getFundMembers(id));
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {importModal && (
        <ImportModal
          type={importModal}
          fundId={id}
          onClose={() => setImportModal(null)}
          onDone={async () => {
            setImportModal(null);
            // Reload data
            const [cos, lpsData, txnsData] = await Promise.all([
              getCompaniesByFund(id),
              getLPsByFund(id),
              getTransactionsByFund(id),
            ]);
            setCompanies(cos);
            setLPs(lpsData);
            setTxns(txnsData);
          }}
        />
      )}
    </div>
  );
}

export default function FundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-[#6b6860]">Loading...</div>}>
      <FundDetailInner params={params} />
    </Suspense>
  );
}
