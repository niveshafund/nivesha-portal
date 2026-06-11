'use client';
// app/reports/fund-performance/page.tsx

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  getFunds, getCompaniesByFund, getTransactionsByFund,
  getValuationsByFund, getLPsByFund,
  DbFund, DbCompany, DbTransaction, DbValuation, DbLP,
} from '@/lib/db';
import { supabase } from '@/lib/supabase';

// ── Formatters ────────────────────────────────────────────────
const fmtFull  = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtShort = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}m`
  : n >= 1_000   ? `$${(n / 1_000).toFixed(0)}k`
  : fmtFull(n);

// ── Quarter helpers ───────────────────────────────────────────
const QUARTERS = [
  'Q1 2024','Q2 2024','Q3 2024','Q4 2024',
  'Q1 2025','Q2 2025','Q3 2025','Q4 2025',
  'Q1 2026','Q2 2026','Q3 2026','Q4 2026',
];

function quarterEnd(q: string): string {
  const [qn, yr] = q.split(' ');
  const m = qn === 'Q1' ? '03-31' : qn === 'Q2' ? '06-30' : qn === 'Q3' ? '09-30' : '12-31';
  return `${yr}-${m}`;
}

function quarterLabel(q: string): string {
  const [qn, yr] = q.split(' ');
  const d = qn === 'Q1' ? '31 March' : qn === 'Q2' ? '30 June' : qn === 'Q3' ? '30 September' : '31 December';
  return `${d} ${yr}`;
}

function currentQuarter(): string {
  const now = new Date();
  const m = now.getMonth();
  const y = now.getFullYear();
  return `${m < 3 ? 'Q1' : m < 6 ? 'Q2' : m < 9 ? 'Q3' : 'Q4'} ${y}`;
}

// ── Metrics calculator ────────────────────────────────────────
function calcMetrics(
  txns: DbTransaction[],
  companies: DbCompany[],
  valuations: DbValuation[],
  lps: DbLP[],
  asOfDate: string,
) {
  const cutoff = new Date(asOfDate);
  const ft = txns.filter(t => new Date(t.date) <= cutoff);
  const invested      = ft.filter(t => t.type === 'Investment').reduce((s, t) => s + t.amount, 0);
  const distributions = ft.filter(t => t.type === 'Distribution').reduce((s, t) => s + t.amount, 0);
  const committed     = lps.reduce((s, lp) => s + lp.commitment, 0);
  const called        = lps.reduce((s, lp) => s + lp.called, 0);
  const uncalled      = Math.max(0, committed - called);

  const fv = valuations.filter(v => new Date(v.quarter_end) <= cutoff);
  const latestByCompany: Record<string, DbValuation> = {};
  for (const v of fv) {
    if (!v.company_id) continue;
    const ex = latestByCompany[v.company_id];
    if (!ex || v.quarter_end > ex.quarter_end) latestByCompany[v.company_id] = v;
  }
  const invByCompany: Record<string, number> = {};
  for (const t of ft.filter(t => t.type === 'Investment')) {
    if (t.company_id) invByCompany[t.company_id] = (invByCompany[t.company_id] ?? 0) + t.amount;
  }
  const portfolioValue = companies.reduce((s, co) => {
    const lv = latestByCompany[co.id];
    return s + (lv ? lv.value : (invByCompany[co.id] ?? 0));
  }, 0);
  const totalValue = portfolioValue + distributions;
  const moic = invested > 0 ? totalValue / invested : 1;
  const dpi  = invested > 0 ? distributions / invested : 0;

  const firstInv = ft
    .filter(t => t.type === 'Investment')
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  let irr = 0;
  if (firstInv && invested > 0 && totalValue > 0) {
    const years = (Date.now() - new Date(firstInv.date).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (years > 0.1) irr = ((totalValue / invested) ** (1 / years) - 1) * 100;
  }

  return { invested, distributions, committed, called, uncalled, portfolioValue, totalValue, moic, dpi, irr };
}

// ── Delta helpers ─────────────────────────────────────────────
function PctDelta({ curr, prev }: { curr: number; prev: number }) {
  if (prev === 0) return <span className="text-[12px] text-[#9b9890]">N/A</span>;
  const d = ((curr - prev) / prev) * 100;
  return (
    <span className={`text-[12px] font-medium ${d >= 0 ? 'text-green-600' : 'text-red-500'}`}>
      {d >= 0 ? '+' : ''}{d.toFixed(1)}%
    </span>
  );
}
function PpDelta({ curr, prev }: { curr: number; prev: number }) {
  const d = curr - prev;
  return (
    <span className={`text-[12px] font-medium ${d >= 0 ? 'text-green-600' : 'text-red-500'}`}>
      {d >= 0 ? '+' : ''}{d.toFixed(1)}pp
    </span>
  );
}

const inputCls = 'w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 bg-white';
const selectCls = 'w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] bg-white appearance-none pr-8';

const PER_PAGE = 25;

export default function FundPerformancePage() {
  const [funds, setFunds]             = useState<DbFund[]>([]);
  const [fundId, setFundId]           = useState('');
  const [quarter, setQuarter]         = useState(currentQuarter());
  const [reportName, setReportName]   = useState('');
  const [commentary, setCommentary]   = useState('');
  const [saving, setSaving]           = useState(false);
  const [saveMsg, setSaveMsg]         = useState('');

  const [companies, setCompanies]     = useState<DbCompany[]>([]);
  const [txns, setTxns]               = useState<DbTransaction[]>([]);
  const [valuations, setValuations]   = useState<DbValuation[]>([]);
  const [lps, setLps]                 = useState<DbLP[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [page, setPage]               = useState(1);

  // Load funds on mount
  useEffect(() => {
    getFunds().then(data => {
      setFunds(data);
      if (data.length > 0) setFundId(data[0].id);
    });
  }, []);

  // Auto-name report
  useEffect(() => {
    const fund = funds.find(f => f.id === fundId);
    if (fund && quarter) setReportName(`${quarter} - ${fund.name} - Fund Performance`);
  }, [fundId, quarter, funds]);

  // Load fund data when fund changes
  useEffect(() => {
    if (!fundId) return;
    setLoadingData(true);
    Promise.all([
      getCompaniesByFund(fundId),
      getTransactionsByFund(fundId),
      getValuationsByFund(fundId),
      getLPsByFund(fundId),
    ]).then(([cos, ts, vs, ls]) => {
      setCompanies(cos); setTxns(ts); setValuations(vs); setLps(ls);
    }).finally(() => setLoadingData(false));
  }, [fundId]);

  // Derived quarter boundaries
  const qEnd         = quarterEnd(quarter);
  const prevQ        = QUARTERS[QUARTERS.indexOf(quarter) - 1] ?? null;
  const yearAgoQ     = QUARTERS[QUARTERS.indexOf(quarter) - 4] ?? null;
  const fund         = funds.find(f => f.id === fundId);

  const current  = useMemo(() => calcMetrics(txns, companies, valuations, lps, qEnd),            [txns, companies, valuations, lps, qEnd]);
  const prev     = useMemo(() => prevQ    ? calcMetrics(txns, companies, valuations, lps, quarterEnd(prevQ))    : null, [txns, companies, valuations, lps, prevQ]);
  const yearAgo  = useMemo(() => yearAgoQ ? calcMetrics(txns, companies, valuations, lps, quarterEnd(yearAgoQ)) : null, [txns, companies, valuations, lps, yearAgoQ]);

  // Per-company rows for Portfolio Company Summary
  const companyRows = useMemo(() => {
    return companies.map(co => {
      const coInvTxns = txns.filter(t => t.company_id === co.id && t.type === 'Investment'
        && new Date(t.date) <= new Date(qEnd));
      const invested = coInvTxns.reduce((s, t) => s + t.amount, 0);
      const distributed = txns
        .filter(t => t.company_id === co.id && t.type === 'Distribution' && new Date(t.date) <= new Date(qEnd))
        .reduce((s, t) => s + t.amount, 0);
      const latestVal = valuations
        .filter(v => v.company_id === co.id && new Date(v.quarter_end) <= new Date(qEnd))
        .sort((a, b) => b.quarter_end.localeCompare(a.quarter_end))[0];
      const currentValue = latestVal ? latestVal.value : invested;
      const totalValue   = currentValue + distributed;
      const moic         = invested > 0 ? totalValue / invested : 1;
      const firstDate    = coInvTxns.sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? null;
      let irr = 0;
      if (firstDate && invested > 0 && totalValue > 0) {
        const yrs = (Date.now() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        if (yrs > 0.1) irr = ((totalValue / invested) ** (1 / yrs) - 1) * 100;
      }
      return { co, invested, distributed, currentValue, totalValue, moic, irr };
    }).sort((a, b) => b.invested - a.invested);
  }, [companies, txns, valuations, qEnd]);

  const totalPages   = Math.ceil(companyRows.length / PER_PAGE);
  const pagedRows    = companyRows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const totals = useMemo(() => ({
    invested:     companyRows.reduce((s, r) => s + r.invested, 0),
    distributed:  companyRows.reduce((s, r) => s + r.distributed, 0),
    currentValue: companyRows.reduce((s, r) => s + r.currentValue, 0),
    totalValue:   companyRows.reduce((s, r) => s + r.totalValue, 0),
  }), [companyRows]);

  // Save report
  async function handleSave() {
    if (!fundId || !reportName.trim()) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from('reports').insert({
        type: 'fund_performance',
        name: reportName.trim(),
        fund_id: fundId,
        quarter,
        quarter_end: qEnd,
        commentary,
        generated_at: now,
        created_at:   now,
      });
      if (error) throw error;
      setSaveMsg('Report saved!');
      setTimeout(() => setSaveMsg(''), 2500);
    } catch (e: any) {
      setSaveMsg('Failed to save');
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  function handleExportCSV() {
    const rows = [
      ['Company', 'Invested', 'Current Value', 'Distributed', 'Total Value', 'MOIC', 'IRR', 'Status'],
      ...companyRows.map(r => [
        r.co.name, r.invested, r.currentValue, r.distributed, r.totalValue,
        `${r.moic.toFixed(2)}x`, `${r.irr.toFixed(1)}%`, r.co.status,
      ]),
      ['TOTAL', totals.invested, totals.currentValue, totals.distributed, totals.totalValue,
        `${current.moic.toFixed(2)}x`, `${current.irr.toFixed(1)}%`, ''],
    ];
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${reportName || 'fund-performance'}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const today = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="max-w-5xl">

      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/reports"
            className="text-[13px] text-[#9b9890] hover:text-[#1a1915] transition-colors flex items-center gap-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Reports
          </Link>
          <span className="text-[#c4c2bb] text-[13px]">/</span>
          <span className="text-[13px] text-[#1a1915]">Fund Performance</span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight">Fund Performance Report</h1>
            <p className="text-[13px] text-[#9b9890] mt-0.5">Comprehensive fund metrics and portfolio analysis</p>
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {saveMsg && (
              <span className={`text-[12.5px] font-medium ${saveMsg.includes('Failed') ? 'text-red-500' : 'text-green-600'}`}>
                {saveMsg}
              </span>
            )}
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] border border-[#e8e6df] bg-white text-[12.5px] hover:bg-[#f9f8f5] transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Save PDF
            </button>
            <button onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] border border-[#e8e6df] bg-white text-[12.5px] hover:bg-[#f9f8f5] transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export CSV
            </button>
            <button onClick={handleSave} disabled={saving || !fundId}
              className="flex items-center gap-1.5 px-4 py-2 rounded-[8px] bg-[#2d5be3] text-white text-[12.5px] font-medium hover:bg-[#2450cc] disabled:opacity-60 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {saving ? 'Saving…' : 'Save Report'}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-5">

        {/* ── Report Configuration ── */}
        <div className="bg-white border border-[#e8e6df] rounded-xl p-6">
          <div className="text-[14px] font-semibold mb-4">Report Configuration</div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-[11.5px] font-medium text-[#6b6860] mb-1.5">Report Name</label>
              <input value={reportName} onChange={e => setReportName(e.target.value)}
                placeholder="Report name" className={inputCls} />
            </div>
            <div>
              <label className="block text-[11.5px] font-medium text-[#6b6860] mb-1.5">Fund</label>
              <div className="relative">
                <select value={fundId} onChange={e => setFundId(e.target.value)} className={selectCls}>
                  {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <svg viewBox="0 0 24 24" fill="none" stroke="#9b9890" strokeWidth={2}
                  className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
            <div>
              <label className="block text-[11.5px] font-medium text-[#6b6860] mb-1.5">Quarter End Date</label>
              <div className="relative">
                <select value={quarter} onChange={e => { setQuarter(e.target.value); setPage(1); }} className={selectCls}>
                  {[...QUARTERS].reverse().map(q => (
                    <option key={q} value={q}>{quarterLabel(q)}</option>
                  ))}
                </select>
                <svg viewBox="0 0 24 24" fill="none" stroke="#9b9890" strokeWidth={2}
                  className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[11.5px] font-medium text-[#6b6860] mb-1.5">
              Fund Commentary <span className="font-normal text-[#9b9890]">(Optional)</span>
            </label>
            <textarea value={commentary} onChange={e => setCommentary(e.target.value)} rows={4}
              placeholder="Add commentary about recent fund performance, investments, changes in valuations, or other relevant updates for LPs..."
              className="w-full px-3 py-2.5 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 bg-white resize-none placeholder:text-[#c4c2bb]"
            />
          </div>
        </div>

        {/* ── Loading state ── */}
        {loadingData ? (
          <div className="bg-white border border-[#e8e6df] rounded-xl flex items-center justify-center h-48">
            <div className="w-5 h-5 border-2 border-[#2d5be3] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !fundId ? null : (
          <>
            {/* ── Report Header ── */}
            <div className="bg-white border border-[#e8e6df] rounded-xl p-6">
              <div className="text-[20px] font-bold text-[#1a1915] mb-2">Fund Performance Report</div>
              <div className="space-y-0.5 text-[13px] text-[#6b6860]">
                <div>Fund: <span className="font-medium text-[#1a1915]">{fund?.name}</span></div>
                <div>Reporting Period: <span className="font-medium text-[#1a1915]">{quarterLabel(quarter)}</span></div>
                <div>Generated: <span className="font-medium text-[#1a1915]">{today}</span></div>
              </div>
              {commentary && (
                <div className="mt-4 pt-4 border-t border-[#e8e6df] text-[13px] text-[#3d3b35] leading-relaxed whitespace-pre-wrap">
                  {commentary}
                </div>
              )}
            </div>

            {/* ── Financial Performance Summary ── */}
            <div className="bg-white border border-[#e8e6df] rounded-xl p-6">
              {/* Section header */}
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-7 h-7 rounded-lg bg-[#eef2fd] flex items-center justify-center text-[#2d5be3]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                    <polyline points="16 7 22 7 22 13" />
                  </svg>
                </div>
                <span className="text-[15px] font-bold text-[#1a1915]">Financial Performance Summary</span>
              </div>

              {/* MOIC / IRR / DPI */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                {[
                  { label: 'MOIC', value: `${current.moic.toFixed(2)}x`, sub: 'Multiple on Invested Capital', badge: current.moic > 1 ? 'Gain' : undefined },
                  { label: 'IRR',  value: `${current.irr.toFixed(1)}%`,  sub: 'Internal Rate of Return',     badge: current.irr > 0 ? 'Positive' : undefined },
                  { label: 'DPI',  value: `${current.dpi.toFixed(2)}x`,  sub: 'Distributions to Paid-in' },
                ].map(k => (
                  <div key={k.label} className="bg-white border border-[#e8e6df] rounded-xl p-5">
                    {k.badge && (
                      <div className="flex justify-end mb-1">
                        <span className="text-[10.5px] text-green-600 font-medium">↗ {k.badge}</span>
                      </div>
                    )}
                    <div className="text-[12px] text-[#9b9890] mb-1">{k.label}</div>
                    <div className="text-[26px] font-bold font-mono text-[#1a1915] leading-tight">{k.value}</div>
                    <div className="text-[11.5px] text-[#9b9890] mt-1">{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* Capital tiles */}
              <div className="grid grid-cols-4 gap-4 mb-4">
                {[
                  { label: 'Total Committed', value: fmtFull(current.committed) },
                  { label: 'Total Invested',  value: fmtFull(current.invested) },
                  { label: 'Portfolio Value', value: fmtFull(current.portfolioValue) },
                  { label: 'Distributions',  value: fmtFull(current.distributions) },
                ].map(k => (
                  <div key={k.label} className="border border-[#e8e6df] rounded-xl p-4">
                    <div className="text-[11.5px] text-[#9b9890] mb-2">{k.label}</div>
                    <div className="text-[17px] font-bold font-mono text-[#1a1915]">{k.value}</div>
                  </div>
                ))}
              </div>

              {/* Uncalled capital */}
              {current.uncalled > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-center gap-3">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth={2} className="w-4 h-4 flex-shrink-0">
                    <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                  <div>
                    <div className="text-[11.5px] font-semibold text-amber-700">Uncalled Capital</div>
                    <div className="text-[16px] font-bold font-mono text-amber-700">{fmtFull(current.uncalled)}</div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Performance Comparison ── */}
            <div className="bg-white border border-[#e8e6df] rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[#e8e6df]">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[#eef2fd] flex items-center justify-center text-[#2d5be3]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                  </div>
                  <span className="text-[15px] font-bold text-[#1a1915]">Performance Comparison</span>
                </div>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e8e6df] bg-[#fafaf8]">
                    <th className="text-[11px] font-semibold text-[#9b9890] tracking-wide text-left px-5 py-3">Metric</th>
                    <th className="text-[11px] font-semibold text-[#2d5be3] tracking-wide text-right px-5 py-3 bg-blue-50/40 whitespace-nowrap">Current Quarter</th>
                    <th className="text-[11px] font-semibold text-[#9b9890] tracking-wide text-right px-5 py-3 whitespace-nowrap">Previous Quarter</th>
                    <th className="text-[11px] font-semibold text-[#9b9890] tracking-wide text-right px-5 py-3 whitespace-nowrap">QoQ Change</th>
                    <th className="text-[11px] font-semibold text-[#9b9890] tracking-wide text-right px-5 py-3 whitespace-nowrap">Year Ago</th>
                    <th className="text-[11px] font-semibold text-[#9b9890] tracking-wide text-right px-5 py-3 whitespace-nowrap">YoY Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e6df]">
                  {([
                    { label: 'Portfolio Value', currFmt: fmtFull(current.portfolioValue), currN: current.portfolioValue, prevN: prev?.portfolioValue, yAgoN: yearAgo?.portfolioValue, prevFmt: (n:number)=>fmtFull(n), kind:'pct' as const },
                    { label: 'MOIC',            currFmt: `${current.moic.toFixed(2)}x`,   currN: current.moic,           prevN: prev?.moic,           yAgoN: yearAgo?.moic,           prevFmt: (n:number)=>`${n.toFixed(2)}x`,  kind:'pct' as const },
                    { label: 'IRR',             currFmt: `${current.irr.toFixed(1)}%`,    currN: current.irr,            prevN: prev?.irr,            yAgoN: yearAgo?.irr,            prevFmt: (n:number)=>`${n.toFixed(1)}%`,  kind:'pp'  as const },
                    { label: 'DPI',             currFmt: `${current.dpi.toFixed(2)}x`,    currN: current.dpi,            prevN: prev?.dpi,            yAgoN: yearAgo?.dpi,            prevFmt: (n:number)=>`${n.toFixed(2)}x`,  kind:'pct' as const },
                    { label: 'Total Invested',  currFmt: fmtFull(current.invested),        currN: current.invested,       prevN: prev?.invested,       yAgoN: yearAgo?.invested,       prevFmt: (n:number)=>fmtFull(n),          kind:'pct' as const },
                    { label: 'Total Distributed', currFmt: fmtFull(current.distributions), currN: current.distributions,  prevN: prev?.distributions,  yAgoN: yearAgo?.distributions,  prevFmt: (n:number)=>fmtFull(n),          kind:'pct' as const },
                  ] as const).map(row => (
                    <tr key={row.label} className="hover:bg-[#fafaf8] transition-colors">
                      <td className="px-5 py-3 text-[13px] text-[#1a1915]">{row.label}</td>
                      <td className="px-5 py-3 text-right font-mono text-[13px] font-bold text-[#1a1915] bg-blue-50/20">
                        {row.currFmt}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-[12.5px] text-[#6b6860]">
                        {prev && row.prevN !== undefined ? row.prevFmt(row.prevN) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {prev && row.prevN !== undefined
                          ? row.kind === 'pp'
                            ? <PpDelta curr={row.currN} prev={row.prevN} />
                            : <PctDelta curr={row.currN} prev={row.prevN} />
                          : <span className="text-[12px] text-[#9b9890]">N/A</span>}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-[12.5px] text-[#6b6860]">
                        {yearAgo && row.yAgoN !== undefined ? row.prevFmt(row.yAgoN) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {yearAgo && row.yAgoN !== undefined
                          ? row.kind === 'pp'
                            ? <PpDelta curr={row.currN} prev={row.yAgoN} />
                            : <PctDelta curr={row.currN} prev={row.yAgoN} />
                          : <span className="text-[12px] text-[#9b9890]">N/A</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-2.5 bg-blue-50/40 border-t border-[#e8e6df]">
                <p className="text-[11.5px] text-[#2d5be3]">
                  <span className="font-semibold">Note:</span> Historical comparison figures are calculated from actual cash flow and investment data up to each respective period. 'N/A' indicates insufficient historical data.
                </p>
              </div>
            </div>

            {/* ── Portfolio Company Summary ── */}
            <div className="bg-white border border-[#e8e6df] rounded-xl overflow-hidden">
              {/* Section header */}
              <div className="px-6 py-4 border-b border-[#e8e6df] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[#eef2fd] flex items-center justify-center text-[#2d5be3]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                      <rect x="2" y="7" width="20" height="14" rx="2" />
                      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                    </svg>
                  </div>
                  <span className="text-[15px] font-bold text-[#1a1915]">Portfolio Company Summary</span>
                  <span className="text-[12px] text-[#9b9890]">
                    {companyRows.length} {companyRows.length === 1 ? 'company' : 'companies'}
                  </span>
                </div>
              </div>

              {companyRows.length === 0 ? (
                <div className="flex items-center justify-center h-36 text-[13px] text-[#9b9890]">
                  No portfolio companies for this fund.
                </div>
              ) : (
                <>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#e8e6df] bg-[#fafaf8]">
                        {['Company', 'Invested', 'Current Value', 'Distributed', 'Total Value', 'MOIC', 'IRR', 'Status'].map(h => (
                          <th key={h}
                            className={`text-[11px] font-semibold text-[#9b9890] tracking-wide px-5 py-3 whitespace-nowrap ${
                              h === 'Company' ? 'text-left' : 'text-right'
                            }`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e8e6df]">
                      {pagedRows.map(({ co, invested, distributed, currentValue, totalValue, moic, irr }) => (
                        <tr key={co.id} className="hover:bg-[#fafaf8] transition-colors">
                          <td className="px-5 py-3">
                            <div className="text-[13px] font-medium text-[#1a1915]">{co.name}</div>
                            {co.sector && <div className="text-[11px] text-[#9b9890]">{co.sector}</div>}
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-[12.5px] text-[#1a1915]">{fmtFull(invested)}</td>
                          <td className="px-5 py-3 text-right font-mono text-[12.5px] font-medium text-[#1a1915]">{fmtFull(currentValue)}</td>
                          <td className="px-5 py-3 text-right font-mono text-[12.5px] text-[#6b6860]">{fmtFull(distributed)}</td>
                          <td className="px-5 py-3 text-right font-mono text-[12.5px] text-[#1a1915]">{fmtFull(totalValue)}</td>
                          <td className="px-5 py-3 text-right">
                            <span className={`text-[12.5px] font-semibold font-mono ${moic > 1 ? 'text-green-600' : moic < 1 ? 'text-red-500' : 'text-[#6b6860]'}`}>
                              {moic.toFixed(2)}x
                            </span>
                          </td>
                          <td className={`px-5 py-3 text-right font-mono text-[12.5px] font-medium ${
                            irr > 0 ? 'text-green-600' : irr < 0 ? 'text-red-500' : 'text-[#9b9890]'
                          }`}>
                            {irr !== 0 ? `${irr >= 0 ? '+' : ''}${irr.toFixed(1)}%` : '0.0%'}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium ${
                              co.status === 'Active'     ? 'bg-green-50 text-green-700' :
                              co.status === 'Exited'     ? 'bg-blue-50 text-blue-700'  :
                                                           'bg-red-50 text-red-700'
                            }`}>
                              {co.status.toLowerCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {/* Totals row */}
                      <tr className="bg-[#f9f8f5] border-t-2 border-[#e8e6df]">
                        <td className="px-5 py-3 text-[13px] font-bold text-[#1a1915]">TOTAL</td>
                        <td className="px-5 py-3 text-right font-mono text-[12.5px] font-bold text-[#1a1915]">{fmtFull(totals.invested)}</td>
                        <td className="px-5 py-3 text-right font-mono text-[12.5px] font-bold text-[#1a1915]">{fmtFull(totals.currentValue)}</td>
                        <td className="px-5 py-3 text-right font-mono text-[12.5px] font-bold text-[#1a1915]">{fmtFull(totals.distributed)}</td>
                        <td className="px-5 py-3 text-right font-mono text-[12.5px] font-bold text-[#1a1915]">{fmtFull(totals.totalValue)}</td>
                        <td className="px-5 py-3 text-right font-mono text-[12.5px] font-bold text-[#1a1915]">
                          <span className={current.moic > 1 ? 'text-green-600' : 'text-[#6b6860]'}>
                            {current.moic.toFixed(2)}x
                          </span>
                        </td>
                        <td className={`px-5 py-3 text-right font-mono text-[12.5px] font-bold ${
                          current.irr > 0 ? 'text-green-600' : current.irr < 0 ? 'text-red-500' : 'text-[#9b9890]'
                        }`}>
                          {current.irr.toFixed(1)}%
                        </td>
                        <td className="px-5 py-3" />
                      </tr>
                    </tbody>
                  </table>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="px-5 py-3 border-t border-[#e8e6df] bg-[#fafaf8] flex items-center justify-between">
                      <div className="text-[12px] text-[#9b9890]">
                        Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, companyRows.length)} of {companyRows.length} entries
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                          className="px-3 py-1.5 rounded-[7px] border border-[#e8e6df] text-[12px] bg-white disabled:opacity-40 hover:bg-[#f9f8f5] transition-colors">
                          Previous
                        </button>
                        <span className="text-[12px] text-[#6b6860]">Page {page} of {totalPages}</span>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                          className="px-3 py-1.5 rounded-[7px] border border-[#e8e6df] text-[12px] bg-white disabled:opacity-40 hover:bg-[#f9f8f5] transition-colors">
                          Next
                        </button>
                      </div>
                    </div>
                  )}

                  {!totalPages || totalPages <= 1 ? (
                    <div className="px-5 py-2.5 border-t border-[#e8e6df] bg-[#fafaf8] text-[11.5px] text-[#9b9890]">
                      Showing {companyRows.length} of {companyRows.length} entries
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
