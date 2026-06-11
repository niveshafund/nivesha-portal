'use client';
// app/reports/portfolio-deployment/page.tsx

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { getFunds, getCompaniesByFund, DbFund, DbCompany } from '@/lib/db';
import { supabase } from '@/lib/supabase';

// ── Formatters ────────────────────────────────────────────────
const fmtFull  = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtShort = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}m`
  : n >= 1_000   ? `$${(n / 1_000).toFixed(0)}k`
  : `$${n}`;

// ── Deployment variable options ───────────────────────────────
type DeployVar = 'sector' | 'stage' | 'status' | 'instrument';
const DEPLOY_VARS: { value: DeployVar; label: string }[] = [
  { value: 'sector',     label: 'Sector'     },
  { value: 'stage',      label: 'Stage'      },
  { value: 'status',     label: 'Status'     },
  { value: 'instrument', label: 'Instrument' },
];

function getGroupKey(co: DbCompany, variable: DeployVar): string {
  switch (variable) {
    case 'sector':     return co.sector     || 'Unknown';
    case 'stage':      return co.stage      || 'Unknown';
    case 'status':     return co.status     || 'Unknown';
    case 'instrument': return (co as any).security_type || 'Unknown';
  }
}

// ── Chart helpers ─────────────────────────────────────────────
const COLORS = [
  '#2d5be3','#7c3aed','#059669','#d97706','#dc2626',
  '#0891b2','#be185d','#65a30d','#9333ea','#ea580c',
  '#0284c7','#16a34a','#b45309','#7c3aed','#e11d48',
];

function getColor(i: number) { return COLORS[i % COLORS.length]; }

const PER_PAGE = 25;

const inputCls  = 'w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 bg-white';
const selectCls = 'w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] bg-white appearance-none pr-8';

export default function PortfolioDeploymentPage() {
  const [funds, setFunds]           = useState<DbFund[]>([]);
  const [fundId, setFundId]         = useState('all');
  const [deployVar, setDeployVar]   = useState<DeployVar>('sector');
  const [reportName, setReportName] = useState('');
  const [saving, setSaving]         = useState(false);
  const [saveMsg, setSaveMsg]       = useState('');

  const [companies, setCompanies]   = useState<DbCompany[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [page, setPage]             = useState(1);

  // Load funds
  useEffect(() => {
    getFunds().then(setFunds);
  }, []);

  // Auto-name
  useEffect(() => {
    const fund = funds.find(f => f.id === fundId);
    const fundPart = fundId === 'all' ? 'All Funds' : (fund?.name ?? '');
    const now = new Date();
    const q = `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
    setReportName(`${q} - ${fundPart} - Portfolio Deployment by ${DEPLOY_VARS.find(d => d.value === deployVar)?.label}`);
  }, [fundId, deployVar, funds]);

  // Load companies
  useEffect(() => {
    setLoadingData(true);
    setPage(1);
    async function load() {
      try {
        if (fundId === 'all') {
          // Load all funds in parallel
          const allFunds = await getFunds();
          const results = await Promise.all(allFunds.map(f => getCompaniesByFund(f.id)));
          setCompanies(results.flat());
        } else {
          setCompanies(await getCompaniesByFund(fundId));
        }
      } finally {
        setLoadingData(false);
      }
    }
    load();
  }, [fundId]);

  // ── KPI totals ────────────────────────────────────────────────
  const totalInvested      = useMemo(() => companies.reduce((s, c) => s + c.invested, 0), [companies]);
  const totalCurrentValue  = useMemo(() => companies.reduce((s, c) => s + (c.unrealised || c.invested), 0), [companies]);
  const totalDistributions = useMemo(() => companies.reduce((s, c) => s + c.distributions, 0), [companies]);

  // ── Group by deployment variable ──────────────────────────────
  type GroupRow = {
    key: string;
    companies: DbCompany[];
    invested: number;
    currentValue: number;
    distributions: number;
    totalValue: number;
    moic: number;
    pctOfPortfolio: number;
  };

  const groupedRows = useMemo((): GroupRow[] => {
    const map: Record<string, DbCompany[]> = {};
    for (const co of companies) {
      const key = getGroupKey(co, deployVar);
      if (!map[key]) map[key] = [];
      map[key].push(co);
    }
    const rows = Object.entries(map).map(([key, cos]) => {
      const invested      = cos.reduce((s, c) => s + c.invested, 0);
      const currentValue  = cos.reduce((s, c) => s + (c.unrealised || c.invested), 0);
      const distributions = cos.reduce((s, c) => s + c.distributions, 0);
      const totalValue    = currentValue + distributions;
      const moic          = invested > 0 ? totalValue / invested : 1;
      const pctOfPortfolio = totalInvested > 0 ? (invested / totalInvested) * 100 : 0;
      return { key, companies: cos, invested, currentValue, distributions, totalValue, moic, pctOfPortfolio };
    });
    return rows.sort((a, b) => b.invested - a.invested);
  }, [companies, deployVar, totalInvested]);

  // ── Company table (flat, sorted by invested) ──────────────────
  const sortedCompanies = useMemo(() =>
    [...companies].sort((a, b) => b.invested - a.invested),
    [companies]
  );
  const totalPages = Math.ceil(sortedCompanies.length / PER_PAGE);
  const pagedCompanies = sortedCompanies.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // ── Chart data ────────────────────────────────────────────────
  const chartMax = groupedRows[0]?.invested ?? 0;

  // Donut chart (SVG)
  const donutRows = groupedRows.slice(0, 8); // top 8 for legibility
  const donutTotal = donutRows.reduce((s, r) => s + r.invested, 0);
  const otherInvested = totalInvested - donutTotal;
  const allDonut = otherInvested > 0
    ? [...donutRows, { key: 'Other', invested: otherInvested, pctOfPortfolio: (otherInvested / totalInvested) * 100 }]
    : donutRows;

  // SVG donut
  function buildDonut(rows: { key: string; invested: number }[], total: number) {
    const R = 80; const r = 50; const cx = 100; const cy = 100;
    let angle = -Math.PI / 2;
    return rows.map((row, i) => {
      const pct   = total > 0 ? row.invested / total : 0;
      const sweep = pct * 2 * Math.PI;
      const x1 = cx + R * Math.cos(angle);
      const y1 = cy + R * Math.sin(angle);
      const x2 = cx + R * Math.cos(angle + sweep);
      const y2 = cy + R * Math.sin(angle + sweep);
      const ix1 = cx + r * Math.cos(angle + sweep);
      const iy1 = cy + r * Math.sin(angle + sweep);
      const ix2 = cx + r * Math.cos(angle);
      const iy2 = cy + r * Math.sin(angle);
      const large = sweep > Math.PI ? 1 : 0;
      const d = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${r} ${r} 0 ${large} 0 ${ix2} ${iy2} Z`;
      angle += sweep;
      return { d, color: getColor(i), key: row.key, pct: pct * 100 };
    });
  }
  const donutSlices = buildDonut(allDonut, totalInvested);

  // Save report
  async function handleSave() {
    if (!reportName.trim()) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from('reports').insert({
        type: 'portfolio_deployment',
        name: reportName.trim(),
        fund_id: fundId === 'all' ? funds[0]?.id : fundId,
        quarter: reportName.split(' - ')[0],
        quarter_end: new Date().toISOString().split('T')[0],
        generated_at: now,
        created_at: now,
      });
      if (error) throw error;
      setSaveMsg('Report saved!');
      setTimeout(() => setSaveMsg(''), 2500);
    } catch (e) {
      setSaveMsg('Failed to save');
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  function handleExportCSV() {
    const rows: (string | number)[][] = [
      [`Portfolio Deployment Report — by ${DEPLOY_VARS.find(d => d.value === deployVar)?.label}`],
      [],
      [DEPLOY_VARS.find(d => d.value === deployVar)?.label ?? 'Group', 'Companies', 'Total Invested', 'Current Value', 'Distributions', 'Total Value', 'MOIC', '% of Portfolio'],
      ...groupedRows.map(r => [r.key, r.companies.length, r.invested, r.currentValue, r.distributions, r.totalValue, `${r.moic.toFixed(2)}x`, `${r.pctOfPortfolio.toFixed(1)}%`]),
      [],
      ['Company', 'Sector', 'Stage', 'Status', 'Invested', 'Current Value', 'Distributions', 'MOIC'],
      ...sortedCompanies.map(c => [c.name, c.sector ?? '', c.stage ?? '', c.status, c.invested, c.unrealised || c.invested, c.distributions, `${c.moic.toFixed(2)}x`]),
    ];
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${reportName || 'portfolio-deployment'}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const deployLabel = DEPLOY_VARS.find(d => d.value === deployVar)?.label ?? 'Sector';

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
          <span className="text-[13px] text-[#1a1915]">Portfolio Deployment</span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight">Portfolio Deployment Report</h1>
            <p className="text-[13px] text-[#9b9890] mt-0.5">Track capital deployment across different dimensions</p>
          </div>
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
            <button onClick={handleSave} disabled={saving || funds.length === 0}
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

        {/* ── Config ── */}
        <div className="bg-white border border-[#e8e6df] rounded-xl p-6">
          <div className="text-[14px] font-semibold mb-4">Report Configuration</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[11.5px] font-medium text-[#6b6860] mb-1.5">Report Name</label>
              <input value={reportName} onChange={e => setReportName(e.target.value)}
                placeholder="Report name" className={inputCls} />
            </div>
            <div>
              <label className="block text-[11.5px] font-medium text-[#6b6860] mb-1.5">
                Fund <span className="font-normal text-[#9b9890]">(Optional)</span>
              </label>
              <div className="relative">
                <select value={fundId} onChange={e => setFundId(e.target.value)} className={selectCls}>
                  <option value="all">All Funds</option>
                  {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <svg viewBox="0 0 24 24" fill="none" stroke="#9b9890" strokeWidth={2}
                  className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
            <div>
              <label className="block text-[11.5px] font-medium text-[#6b6860] mb-1.5">Deployment Variable</label>
              <div className="relative">
                <select value={deployVar} onChange={e => { setDeployVar(e.target.value as DeployVar); setPage(1); }} className={selectCls}>
                  {DEPLOY_VARS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                <svg viewBox="0 0 24 24" fill="none" stroke="#9b9890" strokeWidth={2}
                  className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {loadingData ? (
          <div className="bg-white border border-[#e8e6df] rounded-xl flex items-center justify-center h-48">
            <div className="w-5 h-5 border-2 border-[#2d5be3] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── KPI tiles ── */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Total Companies', value: companies.length.toString(),    sub: 'Portfolio companies' },
                { label: 'Total Invested',  value: fmtFull(totalInvested),         sub: 'Capital deployed' },
                { label: 'Current Value',   value: fmtFull(totalCurrentValue),     sub: 'Portfolio NAV' },
                { label: deployLabel + 's', value: groupedRows.length.toString(),  sub: `Unique ${deployLabel.toLowerCase()}s` },
              ].map(k => (
                <div key={k.label} className="bg-white border border-[#e8e6df] rounded-xl p-5">
                  <div className="text-[11.5px] text-[#9b9890] mb-2">{k.label}</div>
                  <div className="text-[22px] font-bold text-[#1a1915] font-mono leading-tight">{k.value}</div>
                  <div className="text-[11px] text-[#9b9890] mt-1">{k.sub}</div>
                </div>
              ))}
            </div>

            {/* ── Charts ── */}
            <div className="grid grid-cols-2 gap-5">

              {/* Bar chart — Investment by group */}
              <div className="bg-white border border-[#e8e6df] rounded-xl p-6">
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="w-7 h-7 rounded-lg bg-[#eef2fd] flex items-center justify-center text-[#2d5be3]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                    </svg>
                  </div>
                  <span className="text-[14px] font-bold text-[#1a1915]">Investment by {deployLabel}</span>
                </div>

                {groupedRows.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-[13px] text-[#9b9890]">No data</div>
                ) : (
                  <div className="space-y-2.5">
                    {/* Y-axis labels */}
                    <div className="flex items-center gap-1 mb-1 justify-end">
                      {[0, 0.25, 0.5, 0.75, 1].map(p => (
                        <span key={p} className="text-[10px] text-[#9b9890]" style={{ width: 40, textAlign: 'right' }}>
                          {fmtShort(chartMax * p)}
                        </span>
                      ))}
                    </div>
                    {groupedRows.slice(0, 8).map((row, i) => (
                      <div key={row.key} className="flex items-center gap-2">
                        <div className="text-[11px] text-[#6b6860] truncate" style={{ width: 90, flexShrink: 0 }}>
                          {row.key}
                        </div>
                        <div className="flex-1 bg-[#f9f8f5] rounded-sm h-6 relative overflow-hidden">
                          <div
                            className="h-full rounded-sm transition-all duration-500"
                            style={{
                              width: chartMax > 0 ? `${(row.invested / chartMax) * 100}%` : '0%',
                              backgroundColor: getColor(i),
                            }}
                          />
                        </div>
                        <div className="text-[11px] font-mono text-[#1a1915]" style={{ width: 60, flexShrink: 0, textAlign: 'right' }}>
                          {fmtShort(row.invested)}
                        </div>
                      </div>
                    ))}
                    {groupedRows.length > 8 && (
                      <div className="text-[11px] text-[#9b9890] text-center pt-1">
                        +{groupedRows.length - 8} more categories in table below
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Donut chart — Portfolio Distribution */}
              <div className="bg-white border border-[#e8e6df] rounded-xl p-6">
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="w-7 h-7 rounded-lg bg-[#eef2fd] flex items-center justify-center text-[#2d5be3]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                      <path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>
                    </svg>
                  </div>
                  <span className="text-[14px] font-bold text-[#1a1915]">Portfolio Distribution</span>
                </div>

                {donutSlices.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-[13px] text-[#9b9890]">No data</div>
                ) : (
                  <div className="flex items-center gap-4">
                    {/* SVG donut */}
                    <div className="flex-shrink-0">
                      <svg viewBox="0 0 200 200" width={160} height={160}>
                        {donutSlices.map((s, i) => (
                          <path key={i} d={s.d} fill={s.color} opacity={0.9}>
                            <title>{s.key}: {s.pct.toFixed(1)}%</title>
                          </path>
                        ))}
                        {/* Center label */}
                        <text x="100" y="96" textAnchor="middle" className="text-xs" fontSize={11} fill="#9b9890">Total</text>
                        <text x="100" y="112" textAnchor="middle" fontSize={12} fontWeight="bold" fill="#1a1915">
                          {fmtShort(totalInvested)}
                        </text>
                      </svg>
                    </div>
                    {/* Legend */}
                    <div className="flex-1 space-y-1.5 overflow-hidden">
                      {donutSlices.map((s, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
                          <div className="text-[11px] text-[#6b6860] truncate flex-1">{s.key}</div>
                          <div className="text-[11px] font-medium text-[#1a1915] flex-shrink-0">{s.pct.toFixed(1)}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Deployment Analysis table ── */}
            <div className="bg-white border border-[#e8e6df] rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[#e8e6df]">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[#eef2fd] flex items-center justify-center text-[#2d5be3]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
                    </svg>
                  </div>
                  <span className="text-[15px] font-bold text-[#1a1915]">Deployment Analysis by {deployLabel}</span>
                </div>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e8e6df] bg-[#fafaf8]">
                    {[deployLabel, 'Companies', 'Total Invested', 'Current Value', 'Distributions', 'MOIC', '% of Portfolio'].map(h => (
                      <th key={h}
                        className={`text-[11px] font-semibold text-[#9b9890] tracking-wide px-5 py-3 whitespace-nowrap ${
                          h === deployLabel ? 'text-left' : 'text-right'
                        }`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e6df]">
                  {groupedRows.map((row, i) => (
                    <tr key={row.key} className="hover:bg-[#fafaf8] transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: getColor(i) }} />
                          <span className="text-[13px] font-medium text-[#1a1915]">{row.key}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right text-[12.5px] text-[#6b6860]">{row.companies.length}</td>
                      <td className="px-5 py-3 text-right font-mono text-[12.5px] text-[#1a1915]">{fmtFull(row.invested)}</td>
                      <td className="px-5 py-3 text-right font-mono text-[12.5px] font-medium text-[#1a1915]">{fmtFull(row.currentValue)}</td>
                      <td className="px-5 py-3 text-right font-mono text-[12.5px] text-[#6b6860]">{fmtFull(row.distributions)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`font-mono text-[12.5px] font-semibold ${
                          row.moic > 1 ? 'text-green-600' : row.moic < 1 ? 'text-red-500' : 'text-[#6b6860]'
                        }`}>
                          {row.moic.toFixed(2)}x
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-[#f0efe9] rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${row.pctOfPortfolio}%`, backgroundColor: getColor(i) }} />
                          </div>
                          <span className="text-[12px] font-medium text-[#1a1915] w-10 text-right">
                            {row.pctOfPortfolio.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {/* Totals */}
                  <tr className="bg-[#f9f8f5] border-t-2 border-[#e8e6df]">
                    <td className="px-5 py-3 text-[13px] font-bold text-[#1a1915]">TOTAL</td>
                    <td className="px-5 py-3 text-right font-bold text-[12.5px] text-[#1a1915]">{companies.length}</td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-[12.5px] text-[#1a1915]">{fmtFull(totalInvested)}</td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-[12.5px] text-[#1a1915]">{fmtFull(totalCurrentValue)}</td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-[12.5px] text-[#1a1915]">{fmtFull(totalDistributions)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`font-mono text-[12.5px] font-bold ${
                        totalInvested > 0 && (totalCurrentValue + totalDistributions) / totalInvested > 1
                          ? 'text-green-600' : 'text-[#6b6860]'
                      }`}>
                        {totalInvested > 0 ? ((totalCurrentValue + totalDistributions) / totalInvested).toFixed(2) : '1.00'}x
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-[12.5px] text-[#1a1915]">100.0%</td>
                  </tr>
                </tbody>
              </table>
              <div className="px-5 py-2.5 border-t border-[#e8e6df] bg-[#fafaf8] text-[11.5px] text-[#9b9890]">
                Showing 1–{groupedRows.length} of {groupedRows.length} entries
              </div>
            </div>

            {/* ── Company Detail Table ── */}
            <div className="bg-white border border-[#e8e6df] rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[#e8e6df] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[#eef2fd] flex items-center justify-center text-[#2d5be3]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                      <rect x="2" y="7" width="20" height="14" rx="2"/>
                      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                    </svg>
                  </div>
                  <span className="text-[15px] font-bold text-[#1a1915]">Company Detail</span>
                  <span className="text-[12px] text-[#9b9890]">{companies.length} companies</span>
                </div>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e8e6df] bg-[#fafaf8]">
                    {['Company', deployLabel, 'Stage', 'Invested', 'Current Value', 'Distributions', 'MOIC', 'Status'].map(h => (
                      <th key={h}
                        className={`text-[11px] font-semibold text-[#9b9890] tracking-wide px-5 py-3 whitespace-nowrap ${
                          h === 'Company' ? 'text-left' : h === deployLabel || h === 'Stage' || h === 'Status' ? 'text-left' : 'text-right'
                        }`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e6df]">
                  {pagedCompanies.map(co => {
                    const currentValue = co.unrealised || co.invested;
                    const groupIdx = groupedRows.findIndex(r => r.key === getGroupKey(co, deployVar));
                    return (
                      <tr key={co.id} className="hover:bg-[#fafaf8] transition-colors">
                        <td className="px-5 py-3">
                          <div className="text-[13px] font-medium text-[#1a1915]">{co.name}</div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-sm flex-shrink-0"
                              style={{ backgroundColor: groupIdx >= 0 ? getColor(groupIdx) : '#e8e6df' }} />
                            <span className="text-[12px] text-[#6b6860]">{getGroupKey(co, deployVar)}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-[12px] text-[#6b6860]">{co.stage ?? '—'}</td>
                        <td className="px-5 py-3 text-right font-mono text-[12.5px] text-[#1a1915]">{fmtFull(co.invested)}</td>
                        <td className="px-5 py-3 text-right font-mono text-[12.5px] font-medium text-[#1a1915]">{fmtFull(currentValue)}</td>
                        <td className="px-5 py-3 text-right font-mono text-[12.5px] text-[#6b6860]">{fmtFull(co.distributions)}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`font-mono text-[12.5px] font-semibold ${
                            co.moic > 1 ? 'text-green-600' : co.moic < 1 ? 'text-red-500' : 'text-[#6b6860]'
                          }`}>
                            {co.moic.toFixed(2)}x
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium ${
                            co.status === 'Active'     ? 'bg-green-50 text-green-700' :
                            co.status === 'Exited'     ? 'bg-blue-50 text-blue-700'  :
                                                         'bg-red-50 text-red-700'
                          }`}>
                            {co.status.toLowerCase()}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 ? (
                <div className="px-5 py-3 border-t border-[#e8e6df] bg-[#fafaf8] flex items-center justify-between">
                  <div className="text-[12px] text-[#9b9890]">
                    Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, sortedCompanies.length)} of {sortedCompanies.length} entries
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
              ) : (
                <div className="px-5 py-2.5 border-t border-[#e8e6df] bg-[#fafaf8] text-[11.5px] text-[#9b9890]">
                  Showing {sortedCompanies.length} of {sortedCompanies.length} entries
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
