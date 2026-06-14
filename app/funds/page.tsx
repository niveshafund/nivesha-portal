'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getFunds, getTransactionsByFund, getLPsByFund, getCompaniesByFund, getValuationsByFund, DbFund, DbValuation } from '@/lib/db';

const fmt = (n: number): string => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
};

const moicColor = (m: number) =>
  m >= 3 ? 'text-green-600 font-semibold' :
  m >= 1.2 ? 'text-amber-600 font-semibold' :
  m > 0 && m < 1 ? 'text-red-600 font-semibold' : 'text-gray-400';

const irrColor = (i: number) =>
  i > 0 ? 'text-green-600' : i < 0 ? 'text-red-600' : 'text-gray-400';

const statusBadge = (s: string) =>
  s === 'Active'      ? 'bg-green-50 text-green-700' :
  s === 'Fundraising' ? 'bg-blue-50 text-blue-700'   :
                        'bg-gray-100 text-gray-500';

type FundWithMetrics = DbFund & {
  derivedCommitted: number;
  derivedCalled: number;
  derivedInvested: number;
  availCash: number;
  feePaid: number;
  companyCount: number;
  lpCount: number;
  liveNAV: number;
  liveMOIC: number;
  liveIRR: number;
};

export default function FundsPage() {
  const [funds, setFunds] = useState<FundWithMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadFunds(); }, []);

  async function loadFunds() {
    try {
      setLoading(true);
      const dbFunds = await getFunds();
      const enriched = await Promise.all(dbFunds.map(async (fund) => {
        const [lps, txns, companies, valuations] = await Promise.all([
          getLPsByFund(fund.id),
          getTransactionsByFund(fund.id),
          getCompaniesByFund(fund.id),
          getValuationsByFund(fund.id),
        ]);
        const derivedCommitted = lps.reduce((s, lp) => s + lp.commitment, 0);
        const derivedCalled    = lps.reduce((s, lp) => s + lp.called, 0);
        const derivedInvested  = txns.filter(t => t.type === 'Investment').reduce((s, t) => s + t.amount, 0);
        const feePaid          = txns.filter(t => t.type === 'Fee').reduce((s, t) => s + t.amount, 0);
        const availCash        = derivedCalled - derivedInvested;

        // Company status map
        const coStatusMap: Record<string, string> = {};
        companies.forEach(c => { coStatusMap[c.id] = (c as any).status ?? 'Active'; });

        // Per-transaction + per-company valuation maps
        const latestValByTxn: Record<string, DbValuation> = {};
        valuations.forEach(v => {
          if (!(v as any).transaction_id) return;
          const ex = latestValByTxn[(v as any).transaction_id];
          if (!ex || v.quarter_end > ex.quarter_end) latestValByTxn[(v as any).transaction_id] = v;
        });
        const latestValByCo: Record<string, DbValuation> = {};
        valuations.forEach(v => {
          if (!v.company_id) return;
          const ex = latestValByCo[v.company_id];
          if (!ex || v.quarter_end > ex.quarter_end) latestValByCo[v.company_id] = v;
        });
        const investCountByCo: Record<string, number> = {};
        txns.filter(t => t.type === 'Investment' && t.company_id).forEach(t => {
          investCountByCo[t.company_id!] = (investCountByCo[t.company_id!] ?? 0) + 1;
        });

        // Live NAV — active positions only (exclude Exited/Written Off)
        let liveNAV = 0;
        txns.filter(t => t.type === 'Investment' && t.company_id).forEach(t => {
          const status = coStatusMap[t.company_id!];
          if (status === 'Exited' || status === 'Written Off') return;
          const txnVal = latestValByTxn[t.id];
          const coVal  = latestValByCo[t.company_id!];
          if (txnVal?.value != null) { liveNAV += txnVal.value; return; }
          if (coVal?.value != null) {
            if (investCountByCo[t.company_id!] === 1) { liveNAV += coVal.value; return; }
            const entryVal = (t as any).valuation_cap ?? null;
            const companyValue = (coVal as any).company_value ?? 0;
            liveNAV += (entryVal && entryVal > 0 && companyValue > 0)
              ? (t.amount / entryVal) * companyValue : t.amount;
            return;
          }
          liveNAV += t.amount; // cost basis fallback
        });

        const liveMOIC = derivedInvested > 0 ? liveNAV / derivedInvested : 0;

        // XIRR
        const xirr = (cfs: { date: Date; amount: number }[]): number => {
          if (cfs.length < 2) return 0;
          const t0 = cfs[0].date.getTime();
          const yrs = (d: Date) => (d.getTime() - t0) / (1000 * 60 * 60 * 24 * 365.25);
          const npv = (r: number) => cfs.reduce((s, cf) => s + cf.amount / Math.pow(1 + r, yrs(cf.date)), 0);
          let lo = -0.999, hi = 10, fLo = npv(lo), fHi = npv(hi);
          if (fLo * fHi > 0) return 0;
          for (let i = 0; i < 100; i++) {
            const mid = (lo + hi) / 2, fMid = npv(mid);
            if (Math.abs(fMid) < 1e-6) return mid * 100;
            if ((fLo < 0) !== (fMid < 0)) { hi = mid; fHi = fMid; } else { lo = mid; fLo = fMid; }
          }
          return ((lo + hi) / 2) * 100;
        };
        const cfs: { date: Date; amount: number }[] = [];
        txns.filter(t => t.type === 'Investment' && t.date).forEach(t => cfs.push({ date: new Date(t.date), amount: -t.amount }));
        txns.filter(t => t.type === 'Distribution' && t.date).forEach(t => cfs.push({ date: new Date(t.date), amount: t.amount }));
        if (liveNAV > 0) cfs.push({ date: new Date(), amount: liveNAV });
        cfs.sort((a, b) => a.date.getTime() - b.date.getTime());
        const liveIRR = xirr(cfs);

        return { ...fund, derivedCommitted, derivedCalled, derivedInvested, availCash, feePaid, companyCount: companies.length, lpCount: lps.length, liveNAV, liveMOIC, liveIRR };
      }));
      setFunds(enriched);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load funds');
    } finally {
      setLoading(false);
    }
  }

  const totalCommitted = funds.reduce((s, f) => s + (f.derivedCommitted || f.committed), 0);
  const totalInvested  = funds.reduce((s, f) => s + (f.derivedInvested  || f.invested),  0);
  const totalNAV       = funds.reduce((s, f) => s + f.liveNAV, 0);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex items-center gap-2 text-[#6b6860]">
        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        Loading funds...
      </div>
    </div>
  );

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-[13px]">
      <strong>Error loading funds:</strong> {error}
      <button onClick={loadFunds} className="ml-3 underline">Retry</button>
    </div>
  );

  return (
    <div>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Funds</h1>
          <p className="text-[12.5px] text-[#6b6860] mt-0.5">Manage your investment funds and track their performance</p>
        </div>
        <Link href="/funds/new" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">
          + New Fund
        </Link>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total Funds',     value: String(funds.length), mono: false },
          { label: 'Total Committed', value: fmt(totalCommitted),  mono: true  },
          { label: 'Total Invested',  value: fmt(totalInvested),   mono: true  },
          { label: 'Total NAV',       value: fmt(totalNAV),        mono: true  },
        ].map(k => (
          <div key={k.label} className="bg-white border border-[#e8e6df] rounded-xl p-4">
            <label className="text-[11.5px] text-[#6b6860] block mb-1.5">{k.label}</label>
            <div className={`text-[20px] font-semibold tracking-tight ${k.mono ? 'font-mono' : ''}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {funds.length === 0 && (
        <div className="bg-white border border-[#e8e6df] rounded-xl p-12 text-center">
          <div className="text-3xl mb-3">💼</div>
          <div className="font-semibold text-[14px] mb-2">No funds yet</div>
          <p className="text-[12.5px] text-[#6b6860] mb-4">Create your first fund to get started</p>
          <Link href="/funds/new" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">+ New Fund</Link>
        </div>
      )}

      {funds.length > 0 && (
        <div className="bg-white border border-[#e8e6df] rounded-xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Fund Name','Vintage','Committed','Called','Invested','Available Cash','NAV','MOIC','IRR','Admin Fee Paid','Status'].map(h => (
                    <th key={h} className="text-[11px] font-medium text-[#6b6860] text-left px-3 py-2.5 border-b-2 border-[#e8e6df] bg-[#f9f8f5] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {funds.map(f => {
                  const committed = f.derivedCommitted || f.committed;
                  const called    = f.derivedCalled    || f.called;
                  const invested  = f.derivedInvested  || f.invested;
                  const availCash = called - invested;
                  return (
                    <tr key={f.id} className="hover:bg-[#f9f8f5] transition-colors cursor-pointer" onClick={() => window.location.href = `/funds/${f.id}`}>
                      {/* Fund Name — clickable */}
                      <td className="px-3 py-3 border-b border-[#e8e6df]">
                        <Link href={`/funds/${f.id}`} className="font-medium text-[13px] text-[#2d5be3] hover:underline" onClick={e => e.stopPropagation()}>
                          {f.name}
                        </Link>
                        <div className="text-[11px] text-[#9b9890] mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>{f.management_fee}% mgmt</span>
                          <span>·</span>
                          <span>{f.carried_interest}% carry</span>
                          {f.target_size && <><span>·</span><span className="text-[#2d5be3]">Target: {fmt(f.target_size)}</span></>}
                        </div>
                      </td>
                      <td className="px-3 py-3 border-b border-[#e8e6df] font-mono text-[12px]">{f.vintage}</td>
                      <td className="px-3 py-3 border-b border-[#e8e6df]">
                        <div className="font-mono text-[12px]">{committed > 0 ? fmt(committed) : '—'}</div>
                        <div className="text-[10px] text-[#9b9890]">from LPs</div>
                      </td>
                      <td className="px-3 py-3 border-b border-[#e8e6df]">
                        <div className="font-mono text-[12px]">{called > 0 ? fmt(called) : '—'}</div>
                        {committed > 0 && called > 0 && (
                          <div className="mt-1 h-1 bg-[#f0f0ed] rounded-full w-20">
                            <div className="h-1 bg-[#2d5be3] rounded-full" style={{ width: `${Math.min(100,(called/committed)*100)}%` }} />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 border-b border-[#e8e6df]">
                        <div className="font-mono text-[12px]">{invested > 0 ? fmt(invested) : '—'}</div>
                        <div className="text-[10px] text-[#9b9890]">deployed</div>
                      </td>
                      <td className="px-3 py-3 border-b border-[#e8e6df]">
                        <div className={`font-mono text-[12px] font-medium ${availCash >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {called > 0 ? fmt(Math.abs(availCash)) : '—'}
                        </div>
                      </td>
                      <td className="px-3 py-3 border-b border-[#e8e6df] font-mono text-[12px]">{f.liveNAV > 0 ? fmt(f.liveNAV) : '—'}</td>
                      <td className={`px-3 py-3 border-b border-[#e8e6df] text-[12.5px] ${moicColor(f.liveMOIC)}`}>{f.liveMOIC > 0 ? `${f.liveMOIC.toFixed(2)}x` : '—'}</td>
                      <td className={`px-3 py-3 border-b border-[#e8e6df] text-[12.5px] ${irrColor(f.liveIRR)}`}>{f.liveIRR !== 0 ? `${f.liveIRR.toFixed(1)}%` : '—'}</td>
                      <td className="px-3 py-3 border-b border-[#e8e6df] font-mono text-[12px] text-[#d97706]">
                        {f.feePaid > 0 ? fmt(f.feePaid) : committed > 0 ? `est. ${fmt(committed * f.management_fee / 100)}/yr` : '—'}
                      </td>
                      <td className="px-3 py-3 border-b border-[#e8e6df]">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusBadge(f.status)}`}>{f.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-[#e8e6df]">
            <span className="text-[12px] text-[#6b6860]">Showing 1–{funds.length} of {funds.length} {funds.length === 1 ? 'fund' : 'funds'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
