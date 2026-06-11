'use client';
import React, { useState, useEffect } from 'react';
import { getFunds, getCompaniesByFund, getTransactionsByFund, getValuationsByFund } from '@/lib/db';
import type { DbCompany, DbTransaction, DbValuation, DbFund } from '@/lib/db';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const fmt  = (n: number) => n >= 1_000_000 ? `$${(n/1_000_000).toFixed(1)}m` : n >= 1_000 ? `$${(n/1_000).toFixed(0)}k` : `$${n.toLocaleString()}`;
const fmtFull = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const COLORS = ['#2d5be3','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1'];
const MOIC_COLORS: Record<string, string> = { '5x+': '#10b981', '3x–5x': '#2d5be3', '2x–3x': '#6366f1', '1x–2x': '#f59e0b', '<1x': '#ef4444', '0x': '#9b9890' };

type Tab = 'allocation' | 'companies';
type GroupBy = 'sector' | 'stage' | 'moic_band';
type Metric = 'moic' | 'irr';

function moicBand(m: number): string {
  if (m === 0) return '0x';
  if (m < 1)   return '<1x';
  if (m < 2)   return '1x–2x';
  if (m < 3)   return '2x–3x';
  if (m < 5)   return '3x–5x';
  return '5x+';
}

type CompanyRow = {
  company: DbCompany;
  totalInvested: number;
  currentValue: number;
  distributions: number;
  moic: number;
  irr: number | null;
  dpi: number;
};

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('allocation');
  const [funds, setFunds] = useState<DbFund[]>([]);
  const [allCompanies, setAllCompanies] = useState<DbCompany[]>([]);
  const [allTxns, setAllTxns] = useState<DbTransaction[]>([]);
  const [allVals, setAllVals] = useState<DbValuation[]>([]);
  const [loading, setLoading] = useState(true);

  // Allocation state
  const [groupBy, setGroupBy] = useState<GroupBy>('sector');

  // Portfolio Companies state
  const [metric, setMetric] = useState<Metric>('moic');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [groupByCompany, setGroupByCompany] = useState<'none' | 'sector' | 'stage'>('none');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const fs = await getFunds();
        setFunds(fs);
        const companies: DbCompany[] = [];
        const txns: DbTransaction[] = [];
        const vals: DbValuation[] = [];
        await Promise.all(fs.map(async f => {
          const [c, t, v] = await Promise.all([
            getCompaniesByFund(f.id),
            getTransactionsByFund(f.id),
            getValuationsByFund(f.id),
          ]);
          companies.push(...c);
          txns.push(...t);
          vals.push(...v);
        }));
        setAllCompanies(companies);
        setAllTxns(txns);
        setAllVals(vals);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Build per-company rows with live MOIC/IRR
  const companyRows: CompanyRow[] = allCompanies.map(co => {
    const txns = allTxns.filter(t => t.company_id === co.id && t.type === 'Investment');
    const distTxns = allTxns.filter(t => t.company_id === co.id && t.type === 'Distribution');
    const totalInvested = txns.reduce((s, t) => s + t.amount, 0);
    const distributions = distTxns.reduce((s, t) => s + t.amount, 0);
    const coVals = allVals.filter(v => v.company_id === co.id).sort((a, b) => b.quarter.localeCompare(a.quarter));
    const latestVal = coVals[0] ?? null;
    const currentValue = latestVal != null ? latestVal.value : (co.unrealised ?? totalInvested);
    const moic = totalInvested > 0 ? currentValue / totalInvested : 0;
    // IRR: years from first investment
    const firstTxn = txns.sort((a, b) => a.date.localeCompare(b.date))[0];
    let irr: number | null = null;
    if (firstTxn && totalInvested > 0) {
      const years = (Date.now() - new Date(firstTxn.date).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (years >= 1) {
        irr = currentValue === 0 ? -100 : ((currentValue / totalInvested) ** (1 / years) - 1) * 100;
      }
    }
    const dpi = totalInvested > 0 ? distributions / totalInvested : 0;
    return { company: co, totalInvested, currentValue, distributions, moic, irr, dpi };
  }).filter(r => r.totalInvested > 0 && !!r.company.id);

  // ── ALLOCATION TAB ──────────────────────────────────────────────────────────

  type GroupRow = { key: string; companies: number; invested: number; currentValue: number; alloc: number; avgCheck: number; color: string; };

  const allocationGroups = (): GroupRow[] => {
    const totalInv = companyRows.reduce((s, r) => s + r.totalInvested, 0);
    const map = new Map<string, CompanyRow[]>();
    companyRows.forEach(r => {
      let key = 'Unknown';
      if (groupBy === 'sector') key = r.company.sector || 'Unknown';
      else if (groupBy === 'stage') key = r.company.stage || 'Unknown';
      else if (groupBy === 'moic_band') key = moicBand(r.moic);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries())
      .map(([key, rows], i) => ({
        key,
        companies: rows.length,
        invested: rows.reduce((s, r) => s + r.totalInvested, 0),
        currentValue: rows.reduce((s, r) => s + r.currentValue, 0),
        alloc: totalInv > 0 ? (rows.reduce((s, r) => s + r.totalInvested, 0) / totalInv) * 100 : 0,
        avgCheck: rows.length > 0 ? rows.reduce((s, r) => s + r.totalInvested, 0) / rows.length : 0,
        color: groupBy === 'moic_band' ? (MOIC_COLORS[key] ?? '#9b9890') : COLORS[i % COLORS.length],
      }))
      .sort((a, b) => b.invested - a.invested);
  };

  const groups = allocationGroups();
  const totalInvested = companyRows.reduce((s, r) => s + r.totalInvested, 0);
  const totalCurrentValue = companyRows.reduce((s, r) => s + r.currentValue, 0);
  const avgCheck = companyRows.length > 0 ? totalInvested / companyRows.length : 0;
  const pieData = groups.map(g => ({ name: g.key, value: g.invested, color: g.color }));

  // ── PORTFOLIO COMPANIES TAB ────────────────────────────────────────────────

  const sortedRows = [...companyRows].sort((a, b) => {
    const av = metric === 'moic' ? a.moic : (a.irr ?? -999);
    const bv = metric === 'moic' ? b.moic : (b.irr ?? -999);
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const topPerformer = [...companyRows].sort((a, b) => b.moic - a.moic)[0];
  const needsAttention = [...companyRows].filter(r => r.company.status !== 'Written Off').sort((a, b) => a.moic - b.moic)[0];

  const avgMoic = companyRows.length > 0 ? companyRows.reduce((s, r) => s + r.moic, 0) / companyRows.length : 0;
  const irrRows = companyRows.filter(r => r.irr != null);
  const avgIrr = irrRows.length > 0 ? irrRows.reduce((s, r) => s + r.irr!, 0) / irrRows.length : null;
  const avgDpi = companyRows.length > 0 ? companyRows.reduce((s, r) => s + r.dpi, 0) / companyRows.length : 0;

  // Aggregated group bars for when groupByCompany !== 'none'
  type GroupBarRow = { name: string; value: number; companies: number; color: string; };
  const groupBarRows: GroupBarRow[] = (() => {
    if (groupByCompany === 'none') return [];
    const map = new Map<string, CompanyRow[]>();
    companyRows.forEach(r => {
      const key = (groupByCompany === 'sector' ? r.company.sector : r.company.stage) || 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries()).map(([name, rows], i) => ({
      name,
      value: metric === 'moic'
        ? rows.reduce((s, r) => s + r.moic, 0) / rows.length
        : rows.filter(r => r.irr != null).reduce((s, r) => s + r.irr!, 0) / (rows.filter(r => r.irr != null).length || 1),
      companies: rows.length,
      color: COLORS[i % COLORS.length],
    })).sort((a, b) => sortDir === 'desc' ? b.value - a.value : a.value - b.value);
  })();

  // Bar chart — top 20 by selected metric
  const barRows = sortedRows.slice(0, 20);

  // Quartile coloring for bar chart
  const ranked = [...companyRows].sort((a, b) => {
    const av = metric === 'moic' ? a.moic : (a.irr ?? -999);
    const bv = metric === 'moic' ? b.moic : (b.irr ?? -999);
    return bv - av;
  });
  const q1 = Math.ceil(ranked.length * 0.25);
  const q2 = Math.ceil(ranked.length * 0.5);
  const q3 = Math.ceil(ranked.length * 0.75);
  const quartileColor = (idx: number) => {
    if (idx < q1)  return '#10b981'; // top 25%
    if (idx < q2)  return '#2d5be3'; // 25-50%
    if (idx < q3)  return '#f59e0b'; // 50-75%
    return '#ef4444';                // bottom 25%
  };

  const inputCls = 'px-3 py-1.5 rounded-[7px] border border-[#e8e6df] bg-white text-[12.5px] outline-none focus:border-[#2d5be3] transition-colors';

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-[#9b9890] text-[13px]">Loading analytics…</div>
  );

  return (
    <div className="p-6 max-w-[1400px]">
      <h1 className="text-[22px] font-semibold tracking-tight mb-5">Analytics</h1>

      {/* Tabs */}
      <div className="flex border-b border-[#e8e6df] mb-6">
        {([['allocation','Allocation'],['companies','Portfolio Companies']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-all ${tab === key ? 'border-[#2d5be3] text-[#2d5be3]' : 'border-transparent text-[#6b6860] hover:text-[#1a1917]'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── ALLOCATION TAB ── */}
      {tab === 'allocation' && (
        <div>
          {/* Controls */}
          <div className="flex items-center gap-3 mb-5">
            <span className="text-[12.5px] text-[#6b6860]">Group by</span>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value as GroupBy)} className={inputCls}>
              <option value="sector">Sector</option>
              <option value="stage">Stage</option>
              <option value="moic_band">MOIC Band</option>
            </select>
          </div>

          {/* KPI tiles */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Companies',       value: companyRows.length.toString() },
              { label: 'Total Invested',  value: fmtFull(totalInvested) },
              { label: 'Current Value',   value: fmtFull(totalCurrentValue) },
              { label: 'Avg Check Size',  value: fmtFull(avgCheck) },
            ].map(k => (
              <div key={k.label} className="bg-white border border-[#e8e6df] rounded-xl p-4">
                <div className="text-[11px] text-[#9b9890] mb-1">{k.label}</div>
                <div className="text-[20px] font-semibold font-mono">{k.value}</div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Donut */}
            <div className="bg-white border border-[#e8e6df] rounded-xl p-5">
              <div className="text-[13.5px] font-semibold mb-0.5">
                {groupBy === 'sector' ? 'Sector' : groupBy === 'stage' ? 'Stage' : 'MOIC Band'} Distribution
              </div>
              <div className="text-[11.5px] text-[#9b9890] mb-4">By investment amount</div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                    dataKey="value" nameKey="name" paddingAngle={2}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmtFull(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
                {groups.map(g => (
                  <div key={g.key} className="flex items-center gap-1.5 text-[11px] text-[#6b6860]">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: g.color }} />
                    {g.key} {g.alloc.toFixed(0)}%
                  </div>
                ))}
              </div>
            </div>

            {/* Bar */}
            <div className="bg-white border border-[#e8e6df] rounded-xl p-5">
              <div className="text-[13.5px] font-semibold mb-0.5">
                {groupBy === 'sector' ? 'Sector' : groupBy === 'stage' ? 'Stage' : 'MOIC Band'} Breakdown
              </div>
              <div className="text-[11.5px] text-[#9b9890] mb-4">Ranked by invested capital</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={groups} layout="vertical" margin={{ left: 80, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0efe9" />
                  <XAxis type="number" tickFormatter={v => fmt(v)} tick={{ fontSize: 10, fill: '#9b9890' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="key" tick={{ fontSize: 11, fill: '#6b6860' }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip formatter={(v: any) => fmtFull(Number(v))} />
                  <Bar dataKey="invested" radius={[0, 4, 4, 0]}>
                    {groups.map((g, i) => <Cell key={i} fill={g.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Largest group callout */}
          {groups[0] && (
            <div className="bg-white border border-[#e8e6df] rounded-xl p-4 mb-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-[#9b9890] mb-0.5">Largest {groupBy === 'moic_band' ? 'MOIC Band' : groupBy === 'stage' ? 'Stage' : 'Sector'}</div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: groups[0].color }} />
                  <span className="text-[15px] font-semibold">{groups[0].key}</span>
                </div>
                <div className="text-[12px] text-[#9b9890] mt-0.5">{groups[0].companies} companies · {groups[0].alloc.toFixed(1)}% of portfolio</div>
              </div>
              <div className="text-right">
                <div className="text-[20px] font-semibold font-mono">{fmtFull(groups[0].invested)}</div>
                <div className="text-[11px] text-[#9b9890]">Invested</div>
              </div>
            </div>
          )}

          {/* Breakdown table */}
          <div className="bg-white border border-[#e8e6df] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#e8e6df]">
              <span className="text-[13.5px] font-semibold">
                {groupBy === 'sector' ? 'Sector' : groupBy === 'stage' ? 'Stage' : 'MOIC Band'} Allocation Details
              </span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e8e6df]">
                  {['','Companies','Investment','Current Value','Allocation %','Avg Check Size'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium text-[#9b9890]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(g => (
                  <tr key={g.key} className="border-b border-[#f0efe9] hover:bg-[#fafaf8]">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 text-[13px] font-medium">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: g.color }} />
                        {g.key}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-mono">{g.companies}</td>
                    <td className="px-4 py-2.5 text-[13px] font-mono">{fmtFull(g.invested)}</td>
                    <td className="px-4 py-2.5 text-[13px] font-mono text-green-700">{fmtFull(g.currentValue)}</td>
                    <td className="px-4 py-2.5 text-[13px] font-mono">{g.alloc.toFixed(1)}%</td>
                    <td className="px-4 py-2.5 text-[13px] font-mono">{fmtFull(g.avgCheck)}</td>
                  </tr>
                ))}
                <tr className="bg-[#f9f8f5]">
                  <td className="px-4 py-2.5 text-[12.5px] font-semibold">Total</td>
                  <td className="px-4 py-2.5 text-[12.5px] font-mono font-semibold">{companyRows.length}</td>
                  <td className="px-4 py-2.5 text-[12.5px] font-mono font-semibold">{fmtFull(totalInvested)}</td>
                  <td className="px-4 py-2.5 text-[12.5px] font-mono font-semibold text-green-700">{fmtFull(totalCurrentValue)}</td>
                  <td className="px-4 py-2.5 text-[12.5px] font-mono font-semibold">100%</td>
                  <td className="px-4 py-2.5 text-[12.5px] font-mono font-semibold">{fmtFull(avgCheck)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── PORTFOLIO COMPANIES TAB ── */}
      {tab === 'companies' && (
        <div>
          {/* Controls */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] text-[#6b6860]">Metric</span>
              <select value={metric} onChange={e => setMetric(e.target.value as Metric)} className={inputCls}>
                <option value="moic">MOIC</option>
                <option value="irr">IRR</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] text-[#6b6860]">Group by</span>
              <select value={groupByCompany} onChange={e => setGroupByCompany(e.target.value as any)} className={inputCls}>
                <option value="none">None</option>
                <option value="sector">Sector</option>
                <option value="stage">Stage</option>
              </select>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[12.5px] text-[#6b6860]">Sort</span>
              <select value={sortDir} onChange={e => setSortDir(e.target.value as any)} className={inputCls}>
                <option value="desc">Highest First</option>
                <option value="asc">Lowest First</option>
              </select>
            </div>
          </div>

          {/* KPI tiles */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Companies',  value: companyRows.length.toString() },
              { label: 'Avg MOIC',   value: `${avgMoic.toFixed(2)}x` },
              { label: 'Avg DPI',    value: `${avgDpi.toFixed(2)}x` },
              { label: 'Avg IRR',    value: avgIrr != null ? `${avgIrr.toFixed(1)}%` : '—' },
            ].map(k => (
              <div key={k.label} className="bg-white border border-[#e8e6df] rounded-xl p-4">
                <div className="text-[11px] text-[#9b9890] mb-1">{k.label}</div>
                <div className="text-[20px] font-semibold font-mono">{k.value}</div>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          <div className="bg-white border border-[#e8e6df] rounded-xl p-5 mb-4">
            {groupByCompany === 'none' ? (<>
              <div className="flex items-start justify-between mb-1">
                <div>
                  <div className="text-[13.5px] font-semibold">Company Rankings by {metric.toUpperCase()}</div>
                  <div className="text-[11.5px] text-[#9b9890]">Best to worst performers · Top {Math.min(20, barRows.length)} shown</div>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  {[['#10b981','Top 25%'],['#2d5be3','25–50%'],['#f59e0b','50–75%'],['#ef4444','Bottom 25%']].map(([c,l]) => (
                    <div key={l} className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: c }} />
                      <span className="text-[#6b6860]">{l}</span>
                    </div>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={Math.max(200, barRows.length * 28)}>
                <BarChart data={barRows.map((r, i) => ({
                  name: r.company.name,
                  value: metric === 'moic' ? r.moic : (r.irr ?? 0),
                }))} layout="vertical" margin={{ left: 120, right: 40, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0efe9" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#9b9890' }} axisLine={false} tickLine={false}
                    tickFormatter={v => metric === 'moic' ? `${v.toFixed(1)}x` : `${v.toFixed(0)}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6b6860' }} axisLine={false} tickLine={false} width={120} />
                  <Tooltip formatter={(v: any) => metric === 'moic' ? `${Number(v).toFixed(2)}x` : `${Number(v).toFixed(1)}%`} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {barRows.map((r, i) => {
                      const globalIdx = ranked.findIndex(rr => rr.company.id === r.company.id);
                      return <Cell key={i} fill={quartileColor(globalIdx)} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>) : (<>
              <div className="mb-4">
                <div className="text-[13.5px] font-semibold">
                  {groupByCompany === 'sector' ? 'Sector' : 'Stage'} Rankings by {metric.toUpperCase()}
                </div>
                <div className="text-[11.5px] text-[#9b9890]">
                  Aggregate {metric.toUpperCase()} per {groupByCompany === 'sector' ? 'sector' : 'stage'}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={Math.max(200, groupBarRows.length * 52)}>
                <BarChart data={groupBarRows} layout="vertical" margin={{ left: 160, right: 60, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0efe9" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#9b9890' }} axisLine={false} tickLine={false}
                    tickFormatter={v => metric === 'moic' ? `${v.toFixed(1)}x` : `${v.toFixed(0)}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#6b6860' }} axisLine={false} tickLine={false} width={160} />
                  <Tooltip formatter={(v: any) => metric === 'moic' ? `${Number(v).toFixed(2)}x` : `${Number(v).toFixed(1)}%`} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {groupBarRows.map((g, i) => <Cell key={i} fill={g.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>)}
          </div>

          {/* Top / Bottom cards */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {topPerformer && (
              <div className="bg-white border border-[#e8e6df] rounded-xl p-5">
                <div className="flex items-center gap-1.5 text-[11px] text-green-600 font-medium mb-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                  Top Performer
                </div>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[16px] font-semibold">{topPerformer.company.name}</div>
                    <div className="text-[12px] text-[#9b9890] mt-0.5">{topPerformer.company.sector || 'Unknown'} · {funds.find(f => f.id === topPerformer.company.fund_id)?.name ?? ''}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[22px] font-semibold font-mono text-green-600">{topPerformer.moic.toFixed(2)}x</div>
                    <div className="text-[11px] text-[#9b9890]">MOIC</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-[#f0efe9]">
                  <div><div className="text-[11px] text-[#9b9890]">MOIC</div><div className="text-[13px] font-mono font-semibold">{topPerformer.moic.toFixed(2)}x</div></div>
                  <div><div className="text-[11px] text-[#9b9890]">DPI</div><div className="text-[13px] font-mono font-semibold">{topPerformer.dpi.toFixed(2)}x</div></div>
                  <div><div className="text-[11px] text-[#9b9890]">IRR</div><div className="text-[13px] font-mono font-semibold">{topPerformer.irr != null ? `${topPerformer.irr.toFixed(1)}%` : '—'}</div></div>
                </div>
              </div>
            )}
            {needsAttention && (
              <div className="bg-white border border-[#e8e6df] rounded-xl p-5">
                <div className="flex items-center gap-1.5 text-[11px] text-amber-600 font-medium mb-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
                  Needs Attention
                </div>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[16px] font-semibold">{needsAttention.company.name}</div>
                    <div className="text-[12px] text-[#9b9890] mt-0.5">{needsAttention.company.sector || 'Unknown'} · {funds.find(f => f.id === needsAttention.company.fund_id)?.name ?? ''}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[22px] font-semibold font-mono text-red-500">{needsAttention.moic.toFixed(2)}x</div>
                    <div className="text-[11px] text-[#9b9890]">MOIC</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-[#f0efe9]">
                  <div><div className="text-[11px] text-[#9b9890]">MOIC</div><div className="text-[13px] font-mono font-semibold">{needsAttention.moic.toFixed(2)}x</div></div>
                  <div><div className="text-[11px] text-[#9b9890]">DPI</div><div className="text-[13px] font-mono font-semibold">{needsAttention.dpi.toFixed(2)}x</div></div>
                  <div><div className="text-[11px] text-[#9b9890]">IRR</div><div className="text-[13px] font-mono font-semibold">{needsAttention.irr != null ? `${needsAttention.irr.toFixed(1)}%` : '—'}</div></div>
                </div>
              </div>
            )}
          </div>

          {/* Full ranked table */}
          <div className="bg-white border border-[#e8e6df] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#e8e6df]">
              <span className="text-[13.5px] font-semibold">Company Rankings — {metric.toUpperCase()}</span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e8e6df]">
                  {['Rank','Company','Sector','MOIC','DPI','IRR','Investment','Status'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium text-[#9b9890]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r, i) => (
                  <tr key={r.company.id} className="border-b border-[#f0efe9] hover:bg-[#fafaf8]">
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] font-medium text-[#9b9890] bg-[#f0efe9] px-1.5 py-0.5 rounded">#{i+1}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-medium">{r.company.name}</td>
                    <td className="px-4 py-2.5 text-[12.5px] text-[#6b6860]">{r.company.sector || '—'}</td>
                    <td className="px-4 py-2.5 text-[13px] font-mono font-semibold" style={{ color: r.moic >= 2 ? '#10b981' : r.moic >= 1 ? '#f59e0b' : '#ef4444' }}>
                      {r.moic.toFixed(2)}x
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-mono">{r.dpi.toFixed(2)}x</td>
                    <td className="px-4 py-2.5 text-[13px] font-mono" style={{ color: r.irr == null ? '#9b9890' : r.irr >= 0 ? '#10b981' : '#ef4444' }}>
                      {r.irr != null ? `${r.irr.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-mono">{fmtFull(r.totalInvested)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10.5px] font-medium px-2 py-0.5 rounded-full ${
                        r.company.status === 'Active' ? 'bg-green-50 text-green-700' :
                        r.company.status === 'Exited' ? 'bg-blue-50 text-blue-700' :
                        'bg-red-50 text-red-700'}`}>
                        {r.company.status}
                      </span>
                    </td>
                  </tr>
                ))}
                <tr className="bg-[#f9f8f5]">
                  <td className="px-4 py-2.5 text-[12px] font-semibold" colSpan={3}>Total ({sortedRows.length} companies)</td>
                  <td className="px-4 py-2.5 text-[12.5px] font-mono font-semibold">Avg: {avgMoic.toFixed(2)}x</td>
                  <td className="px-4 py-2.5 text-[12.5px] font-mono font-semibold">Avg: {avgDpi.toFixed(2)}x</td>
                  <td className="px-4 py-2.5 text-[12.5px] font-mono font-semibold">{avgIrr != null ? `Avg: ${avgIrr.toFixed(1)}%` : '—'}</td>
                  <td className="px-4 py-2.5 text-[12.5px] font-mono font-semibold">{fmtFull(totalInvested)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
