'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  getFunds, getCompaniesByFund, getTransactionsByFund,
  getValuationsByFund, getLPsByFund,
  DbFund, DbCompany, DbTransaction, DbValuation, DbLP,
} from '@/lib/db';

// ── Formatters ────────────────────────────────────────────────
const fmt  = (n: number) => n >= 1_000_000 ? `$${(n/1_000_000).toFixed(1)}m` : n >= 1_000 ? `$${(n/1_000).toFixed(0)}k` : `$${n.toLocaleString()}`;
const fmtFull = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const fmtM = (n: number) => `$${(n/1_000_000).toFixed(1)}m`;
const pct  = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

// ── Recharts (loaded dynamically to avoid SSR issues) ─────────
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';

const QUARTERS = [
  'Q1 2024','Q2 2024','Q3 2024','Q4 2024',
  'Q1 2025','Q2 2025','Q3 2025','Q4 2025',
  'Q1 2026','Q2 2026','Q3 2026','Q4 2026',
];

function quarterToDate(q: string): Date {
  const [qn, yr] = q.split(' ');
  const month = qn === 'Q1' ? 2 : qn === 'Q2' ? 5 : qn === 'Q3' ? 8 : 11;
  return new Date(Number(yr), month, 30);
}

function dateToQuarter(d: Date): string {
  const m = d.getMonth();
  const y = d.getFullYear();
  const q = m < 3 ? 'Q1' : m < 6 ? 'Q2' : m < 9 ? 'Q3' : 'Q4';
  return `${q} ${y}`;
}

export default function DashboardPage() {
  const [funds, setFunds]           = useState<DbFund[]>([]);
  const [selectedFundId, setSelectedFundId] = useState<string>('all');
  const [companies, setCompanies]   = useState<DbCompany[]>([]);
  const [txns, setTxns]             = useState<DbTransaction[]>([]);
  const [valuations, setValuations] = useState<DbValuation[]>([]);
  const [lps, setLps]               = useState<DbLP[]>([]);
  const [loading, setLoading]       = useState(true);

  // Load funds list on mount
  useEffect(() => {
    getFunds().then(setFunds).catch(console.error);
  }, []);

  // Load data when fund selection changes
  useEffect(() => {
    setLoading(true);
    async function load() {
      try {
        const fundIds = selectedFundId === 'all'
          ? funds.map(f => f.id)
          : [selectedFundId];
        if (fundIds.length === 0) { setLoading(false); return; }

        const [allCos, allTxns, allVals, allLPs] = await Promise.all([
          Promise.all(fundIds.map(id => getCompaniesByFund(id))).then(r => r.flat()),
          Promise.all(fundIds.map(id => getTransactionsByFund(id))).then(r => r.flat()),
          Promise.all(fundIds.map(id => getValuationsByFund(id))).then(r => r.flat()),
          Promise.all(fundIds.map(id => getLPsByFund(id))).then(r => r.flat()),
        ]);
        setCompanies(allCos);
        setTxns(allTxns);
        setValuations(allVals);
        setLps(allLPs);
      } finally {
        setLoading(false);
      }
    }
    if (funds.length > 0) load();
  }, [selectedFundId, funds]);

  // ── Derived KPIs ────────────────────────────────────────────
  const kpis = useMemo(() => {
    const invested      = txns.filter(t => t.type === 'Investment').reduce((s, t) => s + t.amount, 0);

    // Distributions = LP payouts only (not exit proceeds which go back into fund)
    // Use lps table as source of truth for what was actually paid to LPs
    const distributions = lps.reduce((s, lp) => s + (lp.distributions ?? 0), 0);

    // Committed + called from live LP data (source of truth)
    const committed = lps.reduce((s, lp) => s + lp.commitment, 0);
    const called    = lps.reduce((s, lp) => s + lp.called, 0);
    const uncalled  = Math.max(0, committed - called);

    // Company status map — needed to exclude Exited/Written Off from active NAV
    const coStatusMap: Record<string, string> = {};
    companies.forEach(c => { coStatusMap[c.id] = (c as any).status ?? 'Active'; });

    // Portfolio value: latest valuation per company by quarter_end, then created_at
    const latestByCompany = valuations.reduce<Record<string, DbValuation>>((acc, v) => {
      if (!v.company_id) return acc;
      const existing = acc[v.company_id];
      if (!existing) { acc[v.company_id] = v; return acc; }
      const vDate  = v.quarter_end   || v.created_at || '';
      const exDate = existing.quarter_end || existing.created_at || '';
      if (vDate > exDate) acc[v.company_id] = v;
      return acc;
    }, {});
    // Latest valuation per transaction (each investment round can have its own valuation)
    const latestValByTxn: Record<string, DbValuation> = {};
    valuations.forEach(v => {
      const txnId = (v as any).transaction_id;
      if (!txnId) return;
      const existing = latestValByTxn[txnId];
      if (!existing) { latestValByTxn[txnId] = v; return; }
      const vDate  = v.quarter_end || v.created_at || '';
      const exDate = existing.quarter_end || existing.created_at || '';
      if (vDate > exDate) latestValByTxn[txnId] = v;
    });
    const investCountByCo: Record<string, number> = {};
    txns.filter(t => t.type === 'Investment' && t.company_id).forEach(t => {
      investCountByCo[t.company_id!] = (investCountByCo[t.company_id!] ?? 0) + 1;
    });

    // Portfolio value: active positions only (exclude Exited/Written Off — position closed, value = $0)
    const portfolioValue = txns.filter(t => t.type === 'Investment' && t.company_id).reduce((sum, t) => {
      // Skip exited/written-off — they contribute $0 to active NAV
      const status = coStatusMap[t.company_id!];
      if (status === 'Exited' || status === 'Written Off') return sum;

      const txnVal = latestValByTxn[t.id];
      if (txnVal != null && txnVal.value != null) return sum + txnVal.value;
      const co = companies.find(c => c.id === t.company_id);
      const coVal = t.company_id ? latestByCompany[t.company_id] : null;
      if (coVal != null && coVal.value != null) {
        if (t.company_id && investCountByCo[t.company_id] === 1) return sum + coVal.value;
        const entryVal = t.valuation_cap ?? null;
        if (entryVal && entryVal > 0) {
          const companyValue = (coVal as any)?.company_value ?? co?.valuation ?? 0;
          if (companyValue > 0) return sum + (t.amount / entryVal) * companyValue;
        }
        return sum + t.amount;
      }
      return sum + t.amount;
    }, 0);

    // Total value = active NAV + LP distributions (exit proceeds excluded — reinvested in fund)
    const totalValue = portfolioValue + distributions;
    const moic = invested > 0 ? totalValue / invested : 0;
    const dpi  = invested > 0 ? distributions / invested : 0;

    // IRR via XIRR: investment outflows (dated) + distribution inflows (dated)
    // + terminal inflow = current portfolio value as of today
    const xirr = (cashflows: { date: Date; amount: number }[]): number | null => {
      if (cashflows.length < 2) return null;
      const t0 = cashflows[0].date.getTime();
      const yrs = (d: Date) => (d.getTime() - t0) / (1000 * 60 * 60 * 24 * 365.25);
      const npv = (r: number) => cashflows.reduce((s, cf) => s + cf.amount / Math.pow(1 + r, yrs(cf.date)), 0);
      let lo = -0.999, hi = 10;
      let fLo = npv(lo), fHi = npv(hi);
      if (fLo * fHi > 0) return null;
      for (let i = 0; i < 100; i++) {
        const mid = (lo + hi) / 2;
        const fMid = npv(mid);
        if (Math.abs(fMid) < 1e-6) return mid * 100;
        if ((fLo < 0) !== (fMid < 0)) { hi = mid; fHi = fMid; } else { lo = mid; fLo = fMid; }
      }
      return ((lo + hi) / 2) * 100;
    };
    const cashflows: { date: Date; amount: number }[] = [];
    txns.filter(t => t.type === 'Investment' && t.date).forEach(t => cashflows.push({ date: new Date(t.date), amount: -t.amount }));
    txns.filter(t => t.type === 'Distribution' && t.date).forEach(t => cashflows.push({ date: new Date(t.date), amount: t.amount }));
    if (portfolioValue > 0) cashflows.push({ date: new Date(), amount: portfolioValue });
    cashflows.sort((a, b) => a.date.getTime() - b.date.getTime());
    const irr = xirr(cashflows) ?? 0;

    // % change vs previous quarter
    const prevQ = QUARTERS[QUARTERS.indexOf(dateToQuarter(new Date())) - 1];
    const prevPortfolioVal = companies.reduce((s, co) => {
      const prevVal = valuations
        .filter(v => v.company_id === co.id && v.quarter === prevQ)
        .sort((a, b) => b.quarter_end.localeCompare(a.quarter_end))[0];
      return s + (prevVal ? prevVal.value : 0);
    }, 0);
    const portfolioChange = prevPortfolioVal > 0
      ? ((portfolioValue - prevPortfolioVal) / prevPortfolioVal) * 100 : 0;

    return { invested, portfolioValue, totalValue, moic, dpi, irr, distributions, committed, uncalled, portfolioChange };
  }, [txns, valuations, companies, lps, funds, selectedFundId]);

  // ── Fund Performance Chart Data ──────────────────────────────
  const perfChartData = useMemo(() => {
    // Build cumulative invested + portfolio value per quarter
    const data: { quarter: string; fundValue: number; invested: number }[] = [];
    let cumInvested = 0;

    for (const q of QUARTERS) {
      const qDate = quarterToDate(q);
      // Investments up to this quarter
      const qInvested = txns
        .filter(t => t.type === 'Investment' && new Date(t.date) <= qDate)
        .reduce((s, t) => s + t.amount, 0);

      // Portfolio value at this quarter (latest valuation <= this quarter per company)
      const coIds = [...new Set(txns.filter(t => t.company_id).map(t => t.company_id!))];
      let qPortfolioVal = 0;
      for (const coId of coIds) {
        const coVals = valuations
          .filter(v => v.company_id === coId && v.quarter_end <= qDate.toISOString().split('T')[0])
          .sort((a, b) => b.quarter_end.localeCompare(a.quarter_end));
        if (coVals[0]) {
          qPortfolioVal += coVals[0].value;
        } else {
          // Fall back to invested amount for companies with no valuation yet
          const coInvested = txns
            .filter(t => t.company_id === coId && t.type === 'Investment' && new Date(t.date) <= qDate)
            .reduce((s, t) => s + t.amount, 0);
          qPortfolioVal += coInvested;
        }
      }

      if (qInvested > 0 || qPortfolioVal > 0) {
        data.push({
          quarter: q,
          fundValue: qPortfolioVal / 1_000_000,
          invested:  qInvested / 1_000_000,
        });
      }
    }
    return data;
  }, [txns, valuations]);

  // ── NAV Bridge Data ──────────────────────────────────────────
  const navBridgeData = useMemo(() => {
    const currentQ  = dateToQuarter(new Date());
    const currentQIdx = QUARTERS.indexOf(currentQ);
    const prevQ = QUARTERS[currentQIdx - 1] || QUARTERS[currentQIdx];

    const coIds = [...new Set(valuations.map(v => v.company_id))];

    let beginNAV = 0, endNAV = 0;
    for (const coId of coIds) {
      const prevVal = valuations.filter(v => v.company_id === coId && v.quarter === prevQ)
        .sort((a, b) => b.quarter_end.localeCompare(a.quarter_end))[0];
      const currVal = valuations.filter(v => v.company_id === coId && v.quarter === currentQ)
        .sort((a, b) => b.quarter_end.localeCompare(a.quarter_end))[0];
      if (prevVal) beginNAV += prevVal.value;
      if (currVal) endNAV += currVal.value;
    }

    const newInvestments = txns
      .filter(t => t.type === 'Investment' && dateToQuarter(new Date(t.date)) === currentQ)
      .reduce((s, t) => s + t.amount, 0);
    const valuationUplift = endNAV - beginNAV - newInvestments;
    const periodChange = endNAV - beginNAV;
    const periodChangePct = beginNAV > 0 ? (periodChange / beginNAV) * 100 : 0;

    return {
      bars: [
        { name: `Beginning NAV\n(${prevQ})`,   value: beginNAV / 1_000_000,      color: '#4f46e5' },
        { name: 'New Investments',              value: newInvestments / 1_000_000, color: '#6b7280' },
        { name: 'Valuation Uplift',             value: valuationUplift / 1_000_000, color: '#10b981' },
        { name: `Ending NAV\n(${currentQ})`,   value: endNAV / 1_000_000,        color: '#4f46e5' },
      ],
      periodChange, periodChangePct, prevQ, currentQ,
    };
  }, [txns, valuations]);

  // ── Portfolio Quick View ─────────────────────────────────────
  const portfolioRows = useMemo(() => {
    // latest valuation per transaction (each investment round can have its own valuation)
    const latestValByTxn: Record<string, DbValuation> = {};
    valuations.forEach(v => {
      const txnId = (v as any).transaction_id;
      if (!txnId) return;
      const existing = latestValByTxn[txnId];
      if (!existing) { latestValByTxn[txnId] = v; return; }
      const vDate  = v.quarter_end || v.created_at || '';
      const exDate = existing.quarter_end || existing.created_at || '';
      if (vDate > exDate) latestValByTxn[txnId] = v;
    });
    // latest company-level valuation (fallback for rounds without a transaction-level valuation)
    const latestValByCo: Record<string, DbValuation> = {};
    valuations.forEach(v => {
      if (!v.company_id) return;
      const existing = latestValByCo[v.company_id];
      if (!existing) { latestValByCo[v.company_id] = v; return; }
      const vDate  = v.quarter_end || v.created_at || '';
      const exDate = existing.quarter_end || existing.created_at || '';
      if (vDate > exDate) latestValByCo[v.company_id] = v;
    });

    return companies.map(co => {
      const coTxns  = txns.filter(t => t.company_id === co.id);
      const investTxns = coTxns.filter(t => t.type === 'Investment');
      const invested = investTxns.reduce((s, t) => s + t.amount, 0);
      const distrib  = coTxns.filter(t => t.type === 'Distribution').reduce((s, t) => s + t.amount, 0);

      // Sum current value across every investment round for this company
      const currentVal = investTxns.reduce((sum, t) => {
        const txnVal = latestValByTxn[t.id];
        if (txnVal != null && txnVal.value != null) return sum + txnVal.value;
        const coVal = latestValByCo[co.id];
        if (coVal != null && coVal.value != null) {
          // Single-investment company: the company-level valuation's `value`
          // already represents this position's current value directly.
          if (investTxns.length === 1) return sum + coVal.value;
          // Multi-round company sharing one company-level valuation: prorate by ownership.
          const entryVal = t.valuation_cap ?? null;
          if (entryVal && entryVal > 0) {
            const companyValue = (coVal as any)?.company_value ?? co.valuation ?? 0;
            if (companyValue > 0) return sum + (t.amount / entryVal) * companyValue;
          }
          return sum + t.amount; // no usable basis: cost basis
        }
        return sum + t.amount; // no valuation at all: cost basis (1.00x)
      }, 0);

      const moic = invested > 0 ? (currentVal + distrib) / invested : 0;
      const dpi  = invested > 0 ? distrib / invested : 0;
      const sortedInv = [...investTxns].sort((a, b) => a.date.localeCompare(b.date));
      const firstDate = sortedInv[0]?.date ? new Date(sortedInv[0].date) : null;
      const years = firstDate ? (Date.now() - firstDate.getTime()) / (1000*60*60*24*365.25) : 0;
      const irr = years > 0.1 && currentVal > 0 && invested > 0
        ? ((( currentVal + distrib) / invested) ** (1/years) - 1) * 100 : 0;
      return { co, invested, distrib, currentVal, moic, dpi, irr };
    }).sort((a, b) => b.moic - a.moic);
  }, [companies, txns, valuations, lps]);

  const moicColor = (m: number) => m >= 3 ? '#16a34a' : m >= 1.5 ? '#2d5be3' : m >= 1 ? '#6b7280' : '#dc2626';

  if (loading && funds.length === 0) return (
    <div className="flex items-center justify-center h-64 text-[#9b9890] text-[13px]">Loading dashboard…</div>
  );

  return (
    <div className="max-w-7xl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Dashboard</h1>
          <p className="text-[12.5px] text-[#6b6860] mt-0.5">Overview of your fund performance and portfolio companies</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Fund selector */}
          <select
            value={selectedFundId}
            onChange={e => setSelectedFundId(e.target.value)}
            className="px-3 py-2 rounded-[7px] border border-[#e8e6df] bg-white text-[13px] outline-none focus:border-[#2d5be3] min-w-[180px]"
          >
            <option value="all">🏦 All Funds</option>
            {funds.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          {/* Today */}
          <div className="px-3 py-2 rounded-[7px] border border-[#e8e6df] bg-white text-[13px] text-[#6b6860]">
            📅 {new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Invested Capital', value: fmtFull(kpis.invested), change: null, color: '' },
          { label: 'Total Fund Value', value: fmtFull(kpis.totalValue), change: kpis.portfolioChange, color: '' },
          { label: 'IRR',              value: `${kpis.irr.toFixed(1)}%`, change: null, color: kpis.irr > 20 ? 'text-green-600' : kpis.irr > 0 ? 'text-amber-600' : 'text-red-600' },
          { label: 'MOIC',             value: `${kpis.moic.toFixed(2)}x`, change: null, color: kpis.moic >= 2 ? 'text-green-600' : kpis.moic >= 1 ? 'text-amber-600' : 'text-red-600' },
          { label: 'DPI',              value: `${kpis.dpi.toFixed(2)}x`, change: null, color: '' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-[#e8e6df] rounded-xl p-4">
            <div className="text-[11px] text-[#9b9890] mb-1.5">{k.label}</div>
            <div className={`text-[20px] font-semibold font-mono ${k.color}`}>{k.value}</div>
            {k.change != null && (
              <div className={`text-[11.5px] mt-1 font-medium ${k.change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {k.change >= 0 ? '▲' : '▼'} {Math.abs(k.change).toFixed(1)}% vs last quarter
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {/* Fund Performance Chart */}
        <div className="col-span-2 bg-white border border-[#e8e6df] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[13.5px] font-semibold">Fund Performance Over Time</div>
              <div className="text-[11.5px] text-[#9b9890]">Portfolio value vs invested capital by quarter</div>
            </div>
          </div>
          {perfChartData.length < 2 ? (
            <div className="flex items-center justify-center h-48 text-[12.5px] text-[#9b9890]">
              Not enough data yet. Add quarterly valuations to see performance over time.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={perfChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0efeb" />
                <XAxis dataKey="quarter" tick={{ fontSize: 10, fill: '#9b9890' }} tickLine={false} />
                <YAxis tickFormatter={v => `$${v.toFixed(1)}m`} tick={{ fontSize: 10, fill: '#9b9890' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}m`]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e8e6df' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="fundValue" name="Fund Value ($M)" stroke="#2d5be3" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="invested" name="Invested Capital ($M)" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Fund Summary Panel */}
        <div className="bg-white border border-[#e8e6df] rounded-xl p-5">
          <div className="text-[13.5px] font-semibold mb-4">Fund Summary</div>
          <div className="space-y-3">
            {[
              { label: 'Committed Capital',   value: fmtFull(kpis.committed) },
              { label: 'Invested Capital',     value: fmtFull(kpis.invested) },
              { label: 'Uncalled Capital',     value: fmtFull(kpis.uncalled) },
              { label: 'Distributions',        value: fmtFull(kpis.distributions) },
              { label: 'Portfolio Value (NAV)', value: fmtFull(kpis.portfolioValue) },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between text-[12.5px]">
                <span className="text-[#6b6860]">{row.label}</span>
                <span className="font-mono font-medium">{row.value}</span>
              </div>
            ))}
            <div className="pt-2 border-t border-[#e8e6df] flex items-center justify-between text-[13px]">
              <span className="font-semibold">Total Value</span>
              <span className="font-mono font-bold">{fmtFull(kpis.totalValue)}</span>
            </div>
            <div className="text-[10.5px] text-[#9b9890]">NAV + Distributions</div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#e8e6df] flex gap-4 text-[12px]">
            <div><span className="text-[#9b9890]">IRR </span><span className={`font-semibold ${kpis.irr > 0 ? 'text-green-600' : ''}`}>{kpis.irr.toFixed(1)}%</span></div>
            <div><span className="text-[#9b9890]">MOIC </span><span className="font-semibold">{kpis.moic.toFixed(2)}x</span></div>
            <div><span className="text-[#9b9890]">DPI </span><span className="font-semibold">{kpis.dpi.toFixed(2)}x</span></div>
          </div>
        </div>
      </div>

      {/* ── NAV Bridge ── */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-5 mb-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[13.5px] font-semibold">NAV Bridge Analysis <span className="text-[12px] font-normal text-[#9b9890] ml-1">Quarter-over-Quarter Performance</span></div>
            <div className="text-[11.5px] text-[#9b9890] mt-0.5">
              {navBridgeData.prevQ}: {fmtM(navBridgeData.bars[0].value * 1_000_000)} → {navBridgeData.currentQ}: {fmtM(navBridgeData.bars[3].value * 1_000_000)}
            </div>
          </div>
          <div className="flex gap-6 text-[12.5px]">
            <div>
              <div className="text-[11px] text-[#9b9890]">Period Change</div>
              <div className={`font-semibold font-mono ${navBridgeData.periodChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {navBridgeData.periodChange >= 0 ? '+' : ''}{fmtM(navBridgeData.periodChange)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#9b9890]">% Change</div>
              <div className={`font-semibold ${navBridgeData.periodChangePct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {pct(navBridgeData.periodChangePct)}
              </div>
            </div>
          </div>
        </div>
        {navBridgeData.bars[0].value === 0 && navBridgeData.bars[3].value === 0 ? (
          <div className="flex items-center justify-center h-36 text-[12.5px] text-[#9b9890]">
            No valuation data for current and previous quarters yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={navBridgeData.bars} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0efeb" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b6860' }} tickLine={false} />
              <YAxis tickFormatter={v => `$${v.toFixed(0)}m`} tick={{ fontSize: 10, fill: '#9b9890' }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}m`]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e8e6df' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {navBridgeData.bars.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Portfolio Quick View ── */}
      <div className="bg-white border border-[#e8e6df] rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6df]">
          <div className="text-[13.5px] font-semibold">Portfolio Quick View</div>
          <Link href="/funds" className="text-[12.5px] text-[#2d5be3] hover:underline">View All →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Company','Invested','Distributed','Current Value','MOIC','DPI','IRR','Status'].map(h => (
                  <th key={h} className="text-[11px] font-medium text-[#6b6860] text-left px-4 py-2.5 border-b border-[#e8e6df] bg-[#f9f8f5] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {portfolioRows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-[12.5px] text-[#9b9890]">
                  No portfolio companies yet.
                </td></tr>
              ) : portfolioRows.map(({ co, invested, distrib, currentVal, moic, dpi, irr }) => (
                <tr key={co.id} className="hover:bg-[#f9f8f5] transition-colors">
                  <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                        style={{ background: `hsl(${co.name.charCodeAt(0) * 7 % 360}, 60%, 45%)` }}>
                        {co.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-[12.5px]">{co.name}</div>
                        <div className="text-[11px] text-[#9b9890]">{co.sector || 'Unspecified'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">{fmtFull(invested)}</td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">{fmtFull(distrib)}</td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px] font-medium">{fmtFull(currentVal)}</td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
                      style={{ background: moicColor(moic) }}>
                      {moic.toFixed(2)}x
                    </span>
                  </td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860]">{dpi.toFixed(2)}x</td>
                  <td className={`px-4 py-2.5 border-b border-[#e8e6df] text-[12px] font-medium ${irr > 0 ? 'text-green-600' : irr < 0 ? 'text-red-500' : 'text-[#9b9890]'}`}>
                    {irr !== 0 ? `${irr >= 0 ? '+' : ''}${irr.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      co.status === 'Active' ? 'bg-green-50 text-green-700' :
                      co.status === 'Exited' ? 'bg-blue-50 text-blue-700' :
                      'bg-red-50 text-red-700'
                    }`}>{co.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
