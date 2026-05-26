'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import ImportModal from '@/components/ImportModal';
import { getFundById, getCompaniesByFund, getLPsByFund, getTransactionsByFund, getExpensesByFund, DbFund, DbCompany, DbLP, DbTransaction, DbExpense } from '@/lib/db';

type Tab = 'overview' | 'portfolio' | 'lps' | 'invested' | 'expenses';

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

export default function FundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [tab, setTab] = useState<Tab>('overview');
  const [importModal, setImportModal] = useState<'lps' | 'companies' | 'investments' | null>(null);
  const [fund, setFund] = useState<DbFund | null>(null);
  const [companies, setCompanies] = useState<DbCompany[]>([]);
  const [lps, setLPs] = useState<DbLP[]>([]);
  const [txns, setTxns] = useState<DbTransaction[]>([]);
  const [expenses, setExpenses] = useState<DbExpense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [f, cos, lpsData, txnsData, expsData] = await Promise.all([
          getFundById(id),
          getCompaniesByFund(id),
          getLPsByFund(id),
          getTransactionsByFund(id),
          getExpensesByFund(id),
        ]);
        setFund(f);
        setCompanies(cos);
        setLPs(lpsData);
        setTxns(txnsData);
        setExpenses(expsData);
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
  const totalInvested     = txns.filter(t => t.type === 'Investment').reduce((s, t) => s + t.amount, 0) || fund.invested;
  const totalExpenses     = expenses.reduce((s, e) => s + e.amount, 0);
  const availCash         = totalCalled - totalInvested;
  const outstandingCap    = totalCommitted - totalCalled; // committed but not yet called

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview',  label: 'Overview' },
    { key: 'portfolio', label: 'Portfolio' },
    { key: 'lps',       label: 'Limited Partners' },
    { key: 'invested',  label: 'Invested Capital' },
    { key: 'expenses',  label: 'Expenses' },
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
      {tab === 'portfolio' && (
        <div>
          <p className="text-[12.5px] text-[#6b6860] mb-4">
            Portfolio companies associated with this fund.
          </p>
          <div className="bg-white border border-[#e8e6df] rounded-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6df]">
              <div className="text-[13.5px] font-semibold">Portfolio Companies <span className="text-[#9b9890] font-normal text-[12px]">({companies.length})</span></div>
              <div className="flex gap-2">
                <button onClick={() => setImportModal('companies')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">↑ Import</button>
                <Link href={`/funds/${id}/investments/new`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">+ Add Company</Link>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead><tr>
                  {['Company','Sector','Stage','Invested','Current Value','MOIC','IRR','Status'].map(h => (
                    <th key={h} className="text-[11px] font-medium text-[#6b6860] text-left px-4 py-2.5 border-b border-[#e8e6df] bg-[#f9f8f5] whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {companies.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-[12.5px] text-[#9b9890]">
                      No companies yet. Click "Add Company" to record your first investment.
                    </td></tr>
                  ) : companies.map(co => (
                    <tr key={co.id} className="hover:bg-[#f9f8f5] transition-colors cursor-pointer">
                      <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-[5px] flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                            style={{ background: coColor(co.name) }}>
                            {co.name.slice(0,2).toUpperCase()}
                          </div>
                          <a href={`/funds/${id}/companies/${co.id}`} className="font-medium text-[12.5px] text-[#2d5be3] hover:underline">{co.name}</a>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860]">{co.sector || '—'}</td>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                        {co.stage ? <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#f9f8f5] text-[#6b6860] border border-[#e8e6df]">{co.stage}</span> : '—'}
                      </td>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">{fmtFull(co.invested)}</td>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">{co.unrealised > 0 ? fmtFull(co.unrealised) : '—'}</td>
                      <td className={`px-4 py-2.5 border-b border-[#e8e6df] text-[12.5px] ${moicColor(co.moic)}`}>{co.moic > 0 ? `${co.moic.toFixed(2)}x` : '—'}</td>
                      <td className={`px-4 py-2.5 border-b border-[#e8e6df] text-[12.5px] ${irrColor(co.irr)}`}>{co.irr !== 0 ? `${co.irr > 0 ? '+' : ''}${co.irr.toFixed(1)}%` : '—'}</td>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${co.status === 'Active' ? 'bg-green-50 text-green-700' : co.status === 'Exited' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>{co.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ LIMITED PARTNERS ══ */}
      {tab === 'lps' && (
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
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6df]">
              <div className="text-[13.5px] font-semibold">Limited Partners <span className="text-[#9b9890] font-normal text-[12px]">({lps.length})</span></div>
              <div className="flex gap-2">
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">↓ Export</button>
                <button onClick={() => setImportModal('lps')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">↑ Import</button>
                <Link href={`/funds/${id}/lps/new`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">+ Add Limited Partner</Link>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead><tr>
                  {['Investor','Type','Commitment','Called','Distributions','% of Fund','Status'].map(h => (
                    <th key={h} className="text-[11px] font-medium text-[#6b6860] text-left px-4 py-2.5 border-b border-[#e8e6df] bg-[#f9f8f5] whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {lps.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-[12.5px] text-[#9b9890]">
                      No LPs yet. Click "Add Limited Partner" to add your first investor.
                    </td></tr>
                  ) : lps.map(lp => (
                    <tr key={lp.id} className="hover:bg-[#f9f8f5] transition-colors cursor-pointer" onClick={() => window.location.href = `/funds/${id}/lps/${lp.id}`}>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                        <div className="font-medium text-[12.5px] text-[#2d5be3] hover:underline">{lp.name}</div>
                        <div className="text-[11px] text-[#9b9890]">{lp.email}</div>
                      </td>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df]"><span className="px-1.5 py-0.5 rounded text-[10px] bg-[#eef2fd] text-[#2d5be3] font-medium">{lp.type}</span></td>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">{fmtFull(lp.commitment)}</td>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">{fmtFull(lp.called)}</td>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">{lp.distributions > 0 ? fmtFull(lp.distributions) : '—'}</td>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px]">{fmtPct(lp.ownership_pct)}</td>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${lp.status === 'Active' ? 'bg-green-50 text-green-700' : lp.status === 'Pending' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{lp.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* LP summary totals */}
            {lps.length > 0 && (
              <div className="px-5 py-3 border-t border-[#e8e6df] bg-[#f9f8f5] grid grid-cols-4 gap-4 text-[12px]">
                <div><span className="text-[#6b6860]">Total Commitment: </span><span className="font-mono font-semibold">{fmtFull(lps.reduce((s,lp)=>s+lp.commitment,0))}</span></div>
                <div><span className="text-[#6b6860]">Total Called: </span><span className="font-mono font-semibold">{fmtFull(lps.reduce((s,lp)=>s+lp.called,0))}</span></div>
                <div><span className="text-[#6b6860]">Total Distributions: </span><span className="font-mono font-semibold">{fmtFull(lps.reduce((s,lp)=>s+lp.distributions,0))}</span></div>
                <div><span className="text-[#6b6860]">LP Count: </span><span className="font-semibold">{lps.length}</span></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ INVESTED CAPITAL ══ */}
      {tab === 'invested' && (
        <div>
          <p className="text-[12.5px] text-[#6b6860] mb-4">All investment transactions for this fund.</p>
          <div className="bg-white border border-[#e8e6df] rounded-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6df]">
              <div className="text-[13.5px] font-semibold">Invested Capital <span className="text-[#9b9890] font-normal text-[12px]">({txns.filter(t=>t.type==='Investment').length} investments)</span></div>
              <div className="flex gap-2">
                <button onClick={() => setImportModal('investments')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">↑ Import</button>
                <Link href={`/funds/${id}/investments/new`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">+ Create Investment</Link>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead><tr>
                  {['Date','Company','Type','Instrument','Amount','Description'].map(h => (
                    <th key={h} className="text-[11px] font-medium text-[#6b6860] text-left px-4 py-2.5 border-b border-[#e8e6df] bg-[#f9f8f5] whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {txns.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-[12.5px] text-[#9b9890]">
                      No transactions yet. Click "Create Investment" to record your first investment.
                    </td></tr>
                  ) : txns.map(t => (
                    <tr key={t.id} className="hover:bg-[#f9f8f5] transition-colors">
                      <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860] whitespace-nowrap">{t.date}</td>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                        {t.company_id ? (
                          <a href={`/funds/${id}/companies/${t.company_id}`} className="font-medium text-[12.5px] text-[#2d5be3] hover:underline">{t.company_name}</a>
                        ) : (
                          <span className="font-medium text-[12.5px]">{t.company_name}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${t.type === 'Investment' ? 'bg-red-50 text-red-600' : t.type === 'Distribution' ? 'bg-green-50 text-green-700' : t.type === 'Exit' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{t.type}</span>
                      </td>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860]">{t.instrument}</td>
                      <td className={`px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px] font-medium ${t.type === 'Investment' ? 'text-red-600' : 'text-green-600'}`}>
                        {t.type === 'Investment' ? '-' : '+'}{fmtFull(t.amount)}
                      </td>
                      <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860] max-w-[240px] truncate">{t.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {txns.length > 0 && (
              <div className="px-5 py-3 border-t border-[#e8e6df] bg-[#f9f8f5] flex gap-8 text-[12px]">
                <div><span className="text-[#6b6860]">Total Invested: </span><span className="font-mono font-semibold text-red-600">-{fmtFull(txns.filter(t=>t.type==='Investment').reduce((s,t)=>s+t.amount,0))}</span></div>
                <div><span className="text-[#6b6860]">Total Distributions: </span><span className="font-mono font-semibold text-green-600">+{fmtFull(txns.filter(t=>t.type==='Distribution').reduce((s,t)=>s+t.amount,0))}</span></div>
              </div>
            )}
          </div>
        </div>
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
