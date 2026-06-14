'use client';
// app/reports/fund-company/page.tsx

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  getFunds, getCompaniesByFund, getTransactionsByFund,
  getValuationsByFund, getLPsByFund,
  DbFund, DbCompany, DbTransaction, DbValuation, DbLP,
} from '@/lib/db';
import { supabase } from '@/lib/supabase';

// ── Formatters ────────────────────────────────────────────────
const fmtFull = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

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

// ── IRR calc ──────────────────────────────────────────────────
// ── XIRR ──────────────────────────────────────────────────────
function xirr(cashflows: { date: Date; amount: number }[]): number {
  if (cashflows.length < 2) return 0;
  const t0 = cashflows[0].date.getTime();
  const yrs = (d: Date) => (d.getTime() - t0) / (1000 * 60 * 60 * 24 * 365.25);
  const npv = (r: number) => cashflows.reduce((s, cf) => s + cf.amount / Math.pow(1 + r, yrs(cf.date)), 0);
  let lo = -0.999, hi = 10, fLo = npv(lo), fHi = npv(hi);
  if (fLo * fHi > 0) return 0;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2, fMid = npv(mid);
    if (Math.abs(fMid) < 1e-6) return mid * 100;
    if ((fLo < 0) !== (fMid < 0)) { hi = mid; fHi = fMid; } else { lo = mid; fLo = fMid; }
  }
  return ((lo + hi) / 2) * 100;
}

// ── Fund metrics — mirrors GP portal logic exactly ────────────
function calcFundMetrics(
  txns: DbTransaction[], companies: DbCompany[],
  valuations: DbValuation[], lps: DbLP[], asOfDate: string,
) {
  const cutoff = new Date(asOfDate);
  const ft = txns.filter(t => new Date(t.date) <= cutoff);
  const committed = lps.reduce((s, lp) => s + lp.commitment, 0);
  const called    = lps.reduce((s, lp) => s + lp.called, 0);
  const uncalled  = Math.max(0, committed - called);

  const coStatusMap: Record<string, string> = {};
  companies.forEach(c => { coStatusMap[c.id] = (c as any).status ?? 'Active'; });

  const fv = valuations.filter(v => new Date(v.quarter_end) <= cutoff);
  const latestValByTxn: Record<string, DbValuation> = {};
  fv.forEach(v => {
    if (!(v as any).transaction_id) return;
    const ex = latestValByTxn[(v as any).transaction_id];
    if (!ex || v.quarter_end > ex.quarter_end) latestValByTxn[(v as any).transaction_id] = v;
  });
  const latestValByCo: Record<string, DbValuation> = {};
  fv.forEach(v => {
    if (!v.company_id) return;
    const ex = latestValByCo[v.company_id];
    if (!ex || v.quarter_end > ex.quarter_end) latestValByCo[v.company_id] = v;
  });
  const investCountByCo: Record<string, number> = {};
  ft.filter(t => t.type === 'Investment' && t.company_id).forEach(t => {
    investCountByCo[t.company_id!] = (investCountByCo[t.company_id!] ?? 0) + 1;
  });
  const distribByCo: Record<string, number> = {};
  ft.filter(t => t.type === 'Distribution' && t.company_id).forEach(t => {
    distribByCo[t.company_id!] = (distribByCo[t.company_id!] ?? 0) + t.amount;
  });

  let realizedCost = 0, realizedProceeds = 0;
  let unrealisedCost = 0, unrealisedCurrentVal = 0;
  ft.filter(t => t.type === 'Investment' && t.company_id).forEach(t => {
    const status = coStatusMap[t.company_id!];
    if (status === 'Exited' || status === 'Written Off') {
      realizedCost     += t.amount;
      realizedProceeds += distribByCo[t.company_id!] ?? 0;
      return;
    }
    const txnVal = latestValByTxn[t.id];
    const coVal  = latestValByCo[t.company_id!];
    let currentVal: number;
    if (txnVal?.value != null) {
      currentVal = txnVal.value;
    } else if (coVal?.value != null) {
      if (investCountByCo[t.company_id!] === 1) {
        currentVal = coVal.value;
      } else {
        const entryVal = (t as any).valuation_cap ?? null;
        const companyValue = (coVal as any).company_value ?? 0;
        currentVal = (entryVal && entryVal > 0 && companyValue > 0)
          ? (t.amount / entryVal) * companyValue : t.amount;
      }
    } else {
      currentVal = t.amount;
    }
    unrealisedCost       += t.amount;
    unrealisedCurrentVal += currentVal;
  });

  const portfolioValue  = unrealisedCurrentVal;
  const invested        = unrealisedCost + realizedCost;
  const distributions   = Object.values(distribByCo).reduce((s, v) => s + v, 0);
  const totalValue      = portfolioValue + distributions;
  const moic            = invested > 0 ? totalValue / invested : 1;
  const dpi             = invested > 0 ? distributions / invested : 0;
  const realizedGL      = realizedProceeds - realizedCost;
  const unrealisedGL    = unrealisedCurrentVal - unrealisedCost;
  const netUnrealisedGL = unrealisedGL + realizedGL;

  const cfs: { date: Date; amount: number }[] = [];
  ft.filter(t => t.type === 'Investment').forEach(t => cfs.push({ date: new Date(t.date), amount: -t.amount }));
  ft.filter(t => t.type === 'Distribution').forEach(t => cfs.push({ date: new Date(t.date), amount: t.amount }));
  if (portfolioValue > 0) cfs.push({ date: new Date(), amount: portfolioValue });
  cfs.sort((a, b) => a.date.getTime() - b.date.getTime());
  const irr = xirr(cfs);

  return { invested, distributions, committed, called, uncalled, portfolioValue, totalValue, moic, dpi, irr, realizedGL, unrealisedGL, netUnrealisedGL };
}

// ── Delta helpers ─────────────────────────────────────────────
function PctDelta({ curr, prev }: { curr: number; prev: number }) {
  if (prev === 0) return <span className="text-[12px] text-[#9b9890]">N/A</span>;
  const d = ((curr - prev) / prev) * 100;
  return <span className={`text-[12px] font-medium ${d >= 0 ? 'text-green-600' : 'text-red-500'}`}>{d >= 0 ? '+' : ''}{d.toFixed(1)}%</span>;
}
function PpDelta({ curr, prev }: { curr: number; prev: number }) {
  const d = curr - prev;
  return <span className={`text-[12px] font-medium ${d >= 0 ? 'text-green-600' : 'text-red-500'}`}>{d >= 0 ? '+' : ''}{d.toFixed(1)}pp</span>;
}

const inputCls  = 'w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 bg-white';
const selectCls = 'w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] bg-white appearance-none pr-8';
const CO_TXN_PER_PAGE = 10;

// ── Company snapshot card ─────────────────────────────────────
function CompanySnapshot({
  idx, co, txns, valuations, quarter, quarterEndDate, today,
}: {
  idx: number;
  co: DbCompany;
  txns: DbTransaction[];
  valuations: DbValuation[];
  quarter: string;
  quarterEndDate: string;
  today: string;
}) {
  const [txnPage, setTxnPage] = useState(1);
  const cutoff = new Date(quarterEndDate);

  const coTxns = txns.filter(t => t.company_id === co.id && new Date(t.date) <= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date));
  const invested   = coTxns.filter(t => t.type === 'Investment').reduce((s, t) => s + t.amount, 0);
  const distributed = coTxns.filter(t => t.type === 'Distribution').reduce((s, t) => s + t.amount, 0);

  // Per-transaction valuation (matches GP portal)
  const fv = valuations.filter(v => new Date(v.quarter_end) <= cutoff);
  const latestValByTxn: Record<string, DbValuation> = {};
  fv.forEach(v => {
    if (!(v as any).transaction_id) return;
    const ex = latestValByTxn[(v as any).transaction_id];
    if (!ex || v.quarter_end > ex.quarter_end) latestValByTxn[(v as any).transaction_id] = v;
  });
  const latestValByCo = fv
    .filter(v => v.company_id === co.id)
    .sort((a, b) => b.quarter_end.localeCompare(a.quarter_end))[0];
  const invTxns = coTxns.filter(t => t.type === 'Investment');
  const investCount = invTxns.length;

  let currentVal = 0;
  invTxns.forEach(t => {
    const txnVal = latestValByTxn[t.id];
    if (txnVal?.value != null) {
      currentVal += txnVal.value;
    } else if (latestValByCo?.value != null) {
      if (investCount === 1) {
        currentVal += latestValByCo.value;
      } else {
        const entryVal = (t as any).valuation_cap ?? null;
        const companyValue = (latestValByCo as any).company_value ?? 0;
        currentVal += (entryVal && entryVal > 0 && companyValue > 0)
          ? (t.amount / entryVal) * companyValue : t.amount;
      }
    } else {
      currentVal += t.amount;
    }
  });

  const totalValue = currentVal + distributed;
  const moic = invested > 0 ? totalValue / invested : 1;
  const dpi  = invested > 0 ? distributed / invested : 0;
  const cfs: { date: Date; amount: number }[] = [];
  invTxns.sort((a, b) => a.date.localeCompare(b.date)).forEach(t =>
    cfs.push({ date: new Date(t.date), amount: -t.amount }));
  if (distributed > 0) cfs.push({ date: new Date(coTxns.filter(t => t.type === 'Distribution').sort((a,b) => b.date.localeCompare(a.date))[0]?.date ?? new Date().toISOString()), amount: distributed });
  if (currentVal > 0) cfs.push({ date: new Date(), amount: currentVal });
  const irr = xirr(cfs);

  const totalTxnPages = Math.ceil(coTxns.length / CO_TXN_PER_PAGE);
  const pagedTxns = coTxns.slice((txnPage - 1) * CO_TXN_PER_PAGE, txnPage * CO_TXN_PER_PAGE);

  return (
    <div className="border-l-[3px] border-[#2d5be3] pl-1">
      {/* Company header */}
      <div className="flex items-center justify-between mb-3 pl-4">
        <h3 className="text-[17px] font-bold text-[#1a1915]">Company {idx}: {co.name}</h3>
        <span className="text-[12px] text-[#9b9890]">{co.sector ?? 'No sector'}</span>
      </div>

      <div className="pl-4 space-y-4">
        {/* Snapshot header */}
        <div className="bg-white border border-[#e8e6df] rounded-xl p-5">
          <div className="text-[18px] font-bold text-[#1a1915] mb-2">Company Snapshot Report</div>
          <div className="space-y-0.5 text-[13px] text-[#6b6860]">
            <div>Company: <span className="font-medium text-[#1a1915]">{co.name}</span></div>
            <div>Reporting Period: <span className="font-medium text-[#1a1915]">{quarterLabel(quarter)}</span></div>
            <div>Generated: <span className="font-medium text-[#1a1915]">{today}</span></div>
          </div>
        </div>

        {/* Identity card */}
        <div className="bg-white border border-[#e8e6df] rounded-xl p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-[#f9f8f5] border border-[#e8e6df] flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="#9b9890" strokeWidth={1.5} className="w-5 h-5">
                <rect x="2" y="7" width="20" height="14" rx="2"/>
                <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
              </svg>
            </div>
            <div>
              <div className="text-[15px] font-bold text-[#1a1915]">{co.name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[12px] text-[#9b9890]">{co.sector ?? 'No sector'}</span>
                <span className="text-[#e8e6df]">•</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium ${
                  co.status === 'Active'     ? 'bg-green-50 text-green-700' :
                  co.status === 'Exited'     ? 'bg-blue-50 text-blue-700'  :
                                               'bg-red-50 text-red-700'
                }`}>
                  {co.status}
                </span>
              </div>
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            {[
              { label: 'Company Name',   value: co.name },
              { label: 'Board Seats',    value: '—' },
              { label: 'Sector',         value: co.sector ?? '—' },
              { label: 'Headquarters',   value: co.country ?? '—' },
              { label: 'Status',         value: co.status },
              { label: 'Founded',        value: co.investment_date ? co.investment_date.slice(0, 4) : '—' },
              { label: 'Fund Ownership', value: '—' },
              { label: 'Employees',      value: '—' },
            ].map(item => (
              <div key={item.label}>
                <div className="text-[11px] text-[#9b9890] mb-0.5">{item.label}</div>
                <div className="text-[13px] font-medium text-[#1a1915]">{item.value}</div>
              </div>
            ))}
            {(co.about || co.headline) && (
              <div className="col-span-2">
                <div className="text-[11px] text-[#9b9890] mb-0.5">Description</div>
                <div className="text-[13px] text-[#3d3b35] leading-relaxed">{co.about ?? co.headline ?? '—'}</div>
              </div>
            )}
            {!co.about && !co.headline && (
              <div className="col-span-2">
                <div className="text-[11px] text-[#9b9890] mb-0.5">Description</div>
                <div className="text-[13px] text-[#9b9890]">—</div>
              </div>
            )}
          </div>
        </div>

        {/* Financial Performance Summary */}
        <div className="bg-white border border-[#e8e6df] rounded-xl p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-7 h-7 rounded-lg bg-[#eef2fd] flex items-center justify-center text-[#2d5be3]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
              </svg>
            </div>
            <span className="text-[14px] font-bold text-[#1a1915]">Financial Performance Summary</span>
          </div>

          {/* MOIC / IRR / DPI */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[
              { label: 'MOIC', value: `${moic.toFixed(2)}x`, sub: 'Multiple on Invested Capital', badge: moic > 1 ? 'Gain' : undefined },
              { label: 'IRR',  value: `${irr.toFixed(1)}%`,  sub: 'Internal Rate of Return',      badge: irr > 0 ? 'Positive' : undefined },
              { label: 'DPI',  value: `${dpi.toFixed(2)}x`,  sub: 'Distributions to Paid-in' },
            ].map(k => (
              <div key={k.label} className="border border-[#e8e6df] rounded-xl p-4">
                {k.badge && <div className="flex justify-end mb-1"><span className="text-[10px] text-green-600 font-medium">↗ {k.badge}</span></div>}
                <div className="text-[11.5px] text-[#9b9890] mb-1">{k.label}</div>
                <div className="text-[22px] font-bold font-mono text-[#1a1915] leading-tight">{k.value}</div>
                <div className="text-[11px] text-[#9b9890] mt-0.5">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Capital tiles */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total Invested',      value: fmtFull(invested) },
              { label: 'Current Valuation',   value: fmtFull(currentVal) },
              { label: 'Distributions',       value: fmtFull(distributed) },
              { label: 'Total Value',         value: fmtFull(totalValue) },
            ].map(k => (
              <div key={k.label} className="border border-[#e8e6df] rounded-xl p-3.5">
                <div className="text-[11px] text-[#9b9890] mb-1.5">{k.label}</div>
                <div className="text-[15px] font-bold font-mono text-[#1a1915]">{k.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Transaction History */}
        <div className="bg-white border border-[#e8e6df] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#e8e6df] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#eef2fd] flex items-center justify-center text-[#2d5be3]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <span className="text-[13.5px] font-bold text-[#1a1915]">Transaction History</span>
              <span className="text-[12px] text-[#9b9890]">{coTxns.length} transaction{coTxns.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {coTxns.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-[12.5px] text-[#9b9890]">
              No transactions recorded
            </div>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e8e6df] bg-[#fafaf8]">
                    {['Date', 'Type', 'Amount', 'Description'].map(h => (
                      <th key={h} className={`text-[11px] font-semibold text-[#9b9890] tracking-wide px-5 py-2.5 ${
                        h === 'Amount' ? 'text-right' : 'text-left'
                      }`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e6df]">
                  {pagedTxns.map(t => (
                    <tr key={t.id} className="hover:bg-[#fafaf8] transition-colors">
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded bg-[#eef2fd] flex items-center justify-center flex-shrink-0">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#2d5be3" strokeWidth={2} className="w-3 h-3">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                              <line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                          </div>
                          <span className="font-mono text-[12px] text-[#1a1915]">
                            {new Date(t.date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium ${
                          t.type === 'Investment'  ? 'bg-blue-50 text-blue-700' :
                          t.type === 'Distribution'? 'bg-green-50 text-green-700' :
                          t.type === 'Exit'        ? 'bg-purple-50 text-purple-700' :
                                                     'bg-[#f9f8f5] text-[#6b6860]'
                        }`}>
                          <span>↘</span> {t.type}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono text-[12.5px] font-medium text-[#1a1915]">
                        -{fmtFull(t.amount)}
                      </td>
                      <td className="px-5 py-2.5 text-[12px] text-[#6b6860]">
                        {t.description ?? t.notes ?? (t.instrument ? `${t.instrument}${t.valuation_cap ? ' at valuation cap' : ''}` : '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-2.5 border-t border-[#e8e6df] bg-[#fafaf8] flex items-center justify-between">
                <div className="text-[11.5px] text-[#9b9890]">
                  Showing {(txnPage - 1) * CO_TXN_PER_PAGE + 1}–{Math.min(txnPage * CO_TXN_PER_PAGE, coTxns.length)} of {coTxns.length} entries
                </div>
                {totalTxnPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setTxnPage(p => Math.max(1, p - 1))} disabled={txnPage === 1}
                      className="px-2.5 py-1 rounded-[6px] border border-[#e8e6df] text-[11.5px] bg-white disabled:opacity-40 hover:bg-[#f9f8f5] transition-colors">
                      Previous
                    </button>
                    <span className="text-[11.5px] text-[#6b6860]">Page {txnPage} of {totalTxnPages}</span>
                    <button onClick={() => setTxnPage(p => Math.min(totalTxnPages, p + 1))} disabled={txnPage === totalTxnPages}
                      className="px-2.5 py-1 rounded-[6px] border border-[#e8e6df] text-[11.5px] bg-white disabled:opacity-40 hover:bg-[#f9f8f5] transition-colors">
                      Next
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────
const FUND_CO_PER_PAGE = 25;

export default function FundCompanyPage() {
  const [funds, setFunds]           = useState<DbFund[]>([]);
  const [fundId, setFundId]         = useState('');
  const [quarter, setQuarter]       = useState(currentQuarter());
  const [reportName, setReportName] = useState('');
  const [commentary, setCommentary] = useState('');
  const [saving, setSaving]         = useState(false);
  const [saveMsg, setSaveMsg]       = useState('');

  const [companies, setCompanies]   = useState<DbCompany[]>([]);
  const [txns, setTxns]             = useState<DbTransaction[]>([]);
  const [valuations, setValuations] = useState<DbValuation[]>([]);
  const [lps, setLps]               = useState<DbLP[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [fundCoPage, setFundCoPage] = useState(1);

  useEffect(() => {
    getFunds().then(data => {
      setFunds(data);
      if (data.length > 0) setFundId(data[0].id);
    });
  }, []);

  useEffect(() => {
    const fund = funds.find(f => f.id === fundId);
    if (fund && quarter) setReportName(`${quarter} - ${fund.name} - Fund & Company Report`);
  }, [fundId, quarter, funds]);

  useEffect(() => {
    if (!fundId) return;
    setLoadingData(true);
    setFundCoPage(1);
    Promise.all([
      getCompaniesByFund(fundId),
      getTransactionsByFund(fundId),
      getValuationsByFund(fundId),
      getLPsByFund(fundId),
    ]).then(([cos, ts, vs, ls]) => {
      setCompanies(cos); setTxns(ts); setValuations(vs); setLps(ls);
    }).finally(() => setLoadingData(false));
  }, [fundId]);

  const fund   = funds.find(f => f.id === fundId);
  const qEnd   = quarterEnd(quarter);
  const prevQ  = QUARTERS[QUARTERS.indexOf(quarter) - 1] ?? null;
  const yearAgoQ = QUARTERS[QUARTERS.indexOf(quarter) - 4] ?? null;

  const current  = useMemo(() => calcFundMetrics(txns, companies, valuations, lps, qEnd), [txns, companies, valuations, lps, qEnd]);
  const prev     = useMemo(() => prevQ     ? calcFundMetrics(txns, companies, valuations, lps, quarterEnd(prevQ))     : null, [txns, companies, valuations, lps, prevQ]);
  const yearAgo  = useMemo(() => yearAgoQ  ? calcFundMetrics(txns, companies, valuations, lps, quarterEnd(yearAgoQ))  : null, [txns, companies, valuations, lps, yearAgoQ]);

  // Portfolio company summary rows — per-transaction valuations matching GP portal
  const companyRows = useMemo(() => {
    const cutoff = new Date(qEnd);
    const fv = valuations.filter(v => new Date(v.quarter_end) <= cutoff);
    const coStatusMap: Record<string, string> = {};
    companies.forEach(c => { coStatusMap[c.id] = (c as any).status ?? 'Active'; });
    const latestValByTxn: Record<string, DbValuation> = {};
    fv.forEach(v => {
      if (!(v as any).transaction_id) return;
      const ex = latestValByTxn[(v as any).transaction_id];
      if (!ex || v.quarter_end > ex.quarter_end) latestValByTxn[(v as any).transaction_id] = v;
    });
    const latestValByCo: Record<string, DbValuation> = {};
    fv.forEach(v => {
      if (!v.company_id) return;
      const ex = latestValByCo[v.company_id];
      if (!ex || v.quarter_end > ex.quarter_end) latestValByCo[v.company_id] = v;
    });
    const investCountByCo: Record<string, number> = {};
    txns.filter(t => t.type === 'Investment' && t.company_id && new Date(t.date) <= cutoff)
      .forEach(t => { investCountByCo[t.company_id!] = (investCountByCo[t.company_id!] ?? 0) + 1; });

    return companies.map(co => {
      const coTxns = txns.filter(t => t.company_id === co.id && t.type === 'Investment' && new Date(t.date) <= cutoff);
      const invested   = coTxns.reduce((s, t) => s + t.amount, 0);
      const distributed = txns.filter(t => t.company_id === co.id && t.type === 'Distribution' && new Date(t.date) <= cutoff)
        .reduce((s, t) => s + t.amount, 0);

      let currentValue = 0;
      coTxns.forEach(t => {
        const txnVal = latestValByTxn[t.id];
        const coVal  = latestValByCo[co.id];
        if (txnVal?.value != null) {
          currentValue += txnVal.value;
        } else if (coVal?.value != null) {
          if (investCountByCo[co.id] === 1) {
            currentValue += coVal.value;
          } else {
            const entryVal = (t as any).valuation_cap ?? null;
            const companyValue = (coVal as any).company_value ?? 0;
            currentValue += (entryVal && entryVal > 0 && companyValue > 0)
              ? (t.amount / entryVal) * companyValue : t.amount;
          }
        } else {
          currentValue += t.amount;
        }
      });

      const totalValue = currentValue + distributed;
      const moic = invested > 0 ? totalValue / invested : 1;
      const cfs: { date: Date; amount: number }[] = [];
      coTxns.sort((a, b) => a.date.localeCompare(b.date)).forEach(t =>
        cfs.push({ date: new Date(t.date), amount: -t.amount }));
      if (currentValue > 0) cfs.push({ date: new Date(), amount: currentValue });
      const irr = xirr(cfs);
      return { co, invested, distributed, currentValue, totalValue, moic, irr };
    }).sort((a, b) => b.invested - a.invested);
  }, [companies, txns, valuations, qEnd]);

  const totals = useMemo(() => ({
    invested:     companyRows.reduce((s, r) => s + r.invested, 0),
    distributed:  companyRows.reduce((s, r) => s + r.distributed, 0),
    currentValue: companyRows.reduce((s, r) => s + r.currentValue, 0),
    totalValue:   companyRows.reduce((s, r) => s + r.totalValue, 0),
  }), [companyRows]);

  const fundCoTotalPages = Math.ceil(companyRows.length / FUND_CO_PER_PAGE);
  const pagedCompanyRows = companyRows.slice((fundCoPage - 1) * FUND_CO_PER_PAGE, fundCoPage * FUND_CO_PER_PAGE);

  // Companies sorted by invested for individual snapshots
  const sortedCompanies = useMemo(() => [...companies].sort((a, b) => b.invested - a.invested), [companies]);

  async function handleSave() {
    if (!fundId || !reportName.trim()) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from('reports').insert({
        type: 'fund_company', name: reportName.trim(), fund_id: fundId,
        quarter, quarter_end: qEnd, commentary, generated_at: now, created_at: now,
      });
      if (error) throw error;
      setSaveMsg('Report saved!');
      setTimeout(() => setSaveMsg(''), 2500);
    } catch (e) { setSaveMsg('Failed to save'); console.error(e); }
    finally { setSaving(false); }
  }

  const today = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="max-w-5xl">

      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/reports" className="text-[13px] text-[#9b9890] hover:text-[#1a1915] transition-colors flex items-center gap-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><polyline points="15 18 9 12 15 6"/></svg>
            Reports
          </Link>
          <span className="text-[#c4c2bb] text-[13px]">/</span>
          <span className="text-[13px] text-[#1a1915]">Fund & Company Report</span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight">Fund & Company Report</h1>
            <p className="text-[13px] text-[#9b9890] mt-0.5">Complete fund performance with detailed company snapshots</p>
          </div>
          <div className="flex items-center gap-2">
            {saveMsg && <span className={`text-[12.5px] font-medium ${saveMsg.includes('Failed') ? 'text-red-500' : 'text-green-600'}`}>{saveMsg}</span>}
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] border border-[#e8e6df] bg-white text-[12.5px] hover:bg-[#f9f8f5] transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
              </svg>
              Save PDF
            </button>
            <button onClick={handleSave} disabled={saving || !fundId}
              className="flex items-center gap-1.5 px-4 py-2 rounded-[8px] bg-[#2d5be3] text-white text-[12.5px] font-medium hover:bg-[#2450cc] disabled:opacity-60 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
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
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-[11.5px] font-medium text-[#6b6860] mb-1.5">Report Name</label>
              <input value={reportName} onChange={e => setReportName(e.target.value)} placeholder="Report name" className={inputCls} />
            </div>
            <div>
              <label className="block text-[11.5px] font-medium text-[#6b6860] mb-1.5">Fund</label>
              <div className="relative">
                <select value={fundId} onChange={e => setFundId(e.target.value)} className={selectCls}>
                  {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <svg viewBox="0 0 24 24" fill="none" stroke="#9b9890" strokeWidth={2} className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>
            <div>
              <label className="block text-[11.5px] font-medium text-[#6b6860] mb-1.5">Quarter End Date</label>
              <div className="relative">
                <select value={quarter} onChange={e => setQuarter(e.target.value)} className={selectCls}>
                  {[...QUARTERS].reverse().map(q => <option key={q} value={q}>{quarterLabel(q)}</option>)}
                </select>
                <svg viewBox="0 0 24 24" fill="none" stroke="#9b9890" strokeWidth={2} className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[11.5px] font-medium text-[#6b6860] mb-1.5">
              Fund Commentary <span className="font-normal text-[#9b9890]">(Optional)</span>
            </label>
            <textarea value={commentary} onChange={e => setCommentary(e.target.value)} rows={3}
              placeholder="Add commentary about fund performance, portfolio companies, or other relevant updates..."
              className="w-full px-3 py-2.5 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 bg-white resize-none placeholder:text-[#c4c2bb]"
            />
          </div>
        </div>

        {loadingData ? (
          <div className="bg-white border border-[#e8e6df] rounded-xl flex items-center justify-center h-48">
            <div className="w-5 h-5 border-2 border-[#2d5be3] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !fundId ? null : (
          <>
            {/* ══ FUND PERFORMANCE SUMMARY ══ */}
            <div className="bg-white border border-[#e8e6df] rounded-xl p-6">
              <div className="text-[16px] font-bold text-[#1a1915] mb-4">Fund Performance Summary</div>

              {/* Report header */}
              <div className="border border-[#e8e6df] rounded-xl p-5 mb-4">
                <div className="text-[18px] font-bold text-[#1a1915] mb-2">Fund Performance Report</div>
                <div className="space-y-0.5 text-[13px] text-[#6b6860]">
                  <div>Fund: <span className="font-medium text-[#1a1915]">{fund?.name}</span></div>
                  <div>Reporting Period: <span className="font-medium text-[#1a1915]">{quarterLabel(quarter)}</span></div>
                  <div>Generated: <span className="font-medium text-[#1a1915]">{today}</span></div>
                </div>
                {commentary && <div className="mt-3 pt-3 border-t border-[#e8e6df] text-[13px] text-[#3d3b35] leading-relaxed whitespace-pre-wrap">{commentary}</div>}
              </div>

              {/* Financial Performance Summary */}
              <div className="border border-[#e8e6df] rounded-xl p-5 mb-4">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-[#eef2fd] flex items-center justify-center text-[#2d5be3]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
                  </div>
                  <span className="text-[14px] font-bold text-[#1a1915]">Financial Performance Summary</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {[
                    { label: 'MOIC', value: `${current.moic.toFixed(2)}x`, sub: 'Multiple on Invested Capital', badge: current.moic > 1 ? 'Gain' : undefined },
                    { label: 'IRR',  value: `${current.irr.toFixed(1)}%`,  sub: 'Internal Rate of Return',     badge: current.irr > 0 ? 'Positive' : undefined },
                    { label: 'DPI',  value: `${current.dpi.toFixed(2)}x`,  sub: 'Distributions to Paid-in' },
                  ].map(k => (
                    <div key={k.label} className="border border-[#e8e6df] rounded-xl p-4">
                      {k.badge && <div className="flex justify-end mb-1"><span className="text-[10px] text-green-600 font-medium">↗ {k.badge}</span></div>}
                      <div className="text-[11.5px] text-[#9b9890] mb-1">{k.label}</div>
                      <div className="text-[22px] font-bold font-mono text-[#1a1915]">{k.value}</div>
                      <div className="text-[11px] text-[#9b9890] mt-0.5">{k.sub}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-3 mb-3">
                  {[
                    { label: 'Total Committed', value: fmtFull(current.committed) },
                    { label: 'Total Invested',  value: fmtFull(current.invested) },
                    { label: 'Portfolio Value', value: fmtFull(current.portfolioValue) },
                    { label: 'Distributions',  value: fmtFull(current.distributions) },
                  ].map(k => (
                    <div key={k.label} className="border border-[#e8e6df] rounded-xl p-3.5">
                      <div className="text-[11px] text-[#9b9890] mb-1.5">{k.label}</div>
                      <div className="text-[15px] font-bold font-mono text-[#1a1915]">{k.value}</div>
                    </div>
                  ))}
                </div>
                {current.uncalled > 0 && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5 flex items-center gap-2.5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth={2} className="w-4 h-4 flex-shrink-0"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                    <div>
                      <div className="text-[11px] font-semibold text-amber-700">Uncalled Capital</div>
                      <div className="text-[14px] font-bold font-mono text-amber-700">{fmtFull(current.uncalled)}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Performance Comparison */}
              <div className="border border-[#e8e6df] rounded-xl overflow-hidden mb-4">
                <div className="px-5 py-3 border-b border-[#e8e6df] flex items-center gap-2.5 bg-[#fafaf8]">
                  <div className="w-6 h-6 rounded-lg bg-[#eef2fd] flex items-center justify-center text-[#2d5be3]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                  </div>
                  <span className="text-[13.5px] font-bold text-[#1a1915]">Performance Comparison</span>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#e8e6df] bg-[#fafaf8]">
                      <th className="text-[11px] font-semibold text-[#9b9890] text-left px-5 py-2.5">Metric</th>
                      <th className="text-[11px] font-semibold text-[#2d5be3] text-right px-5 py-2.5 bg-blue-50/40">Current Quarter</th>
                      <th className="text-[11px] font-semibold text-[#9b9890] text-right px-5 py-2.5">Previous Quarter</th>
                      <th className="text-[11px] font-semibold text-[#9b9890] text-right px-5 py-2.5">QoQ Change</th>
                      <th className="text-[11px] font-semibold text-[#9b9890] text-right px-5 py-2.5">Year Ago</th>
                      <th className="text-[11px] font-semibold text-[#9b9890] text-right px-5 py-2.5">YoY Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e6df]">
                    {([
                      { label: 'Portfolio Value', currFmt: fmtFull(current.portfolioValue), currN: current.portfolioValue, prevN: prev?.portfolioValue, yAgoN: yearAgo?.portfolioValue, fmt: (n:number)=>fmtFull(n), kind:'pct' as const },
                      { label: 'MOIC',            currFmt: `${current.moic.toFixed(2)}x`,   currN: current.moic,           prevN: prev?.moic,           yAgoN: yearAgo?.moic,           fmt: (n:number)=>`${n.toFixed(2)}x`, kind:'pct' as const },
                      { label: 'IRR',             currFmt: `${current.irr.toFixed(1)}%`,    currN: current.irr,            prevN: prev?.irr,            yAgoN: yearAgo?.irr,            fmt: (n:number)=>`${n.toFixed(1)}%`, kind:'pp' as const },
                      { label: 'DPI',             currFmt: `${current.dpi.toFixed(2)}x`,    currN: current.dpi,            prevN: prev?.dpi,            yAgoN: yearAgo?.dpi,            fmt: (n:number)=>`${n.toFixed(2)}x`, kind:'pct' as const },
                      { label: 'Total Invested',  currFmt: fmtFull(current.invested),        currN: current.invested,       prevN: prev?.invested,       yAgoN: yearAgo?.invested,       fmt: (n:number)=>fmtFull(n),          kind:'pct' as const },
                      { label: 'Total Distributed', currFmt: fmtFull(current.distributions), currN: current.distributions,  prevN: prev?.distributions,  yAgoN: yearAgo?.distributions,  fmt: (n:number)=>fmtFull(n),          kind:'pct' as const },
                    ] as const).map(row => (
                      <tr key={row.label} className="hover:bg-[#fafaf8]">
                        <td className="px-5 py-2.5 text-[12.5px] text-[#1a1915]">{row.label}</td>
                        <td className="px-5 py-2.5 text-right font-mono text-[12.5px] font-bold text-[#1a1915] bg-blue-50/20">{row.currFmt}</td>
                        <td className="px-5 py-2.5 text-right font-mono text-[12px] text-[#6b6860]">{prev && row.prevN !== undefined ? row.fmt(row.prevN) : '—'}</td>
                        <td className="px-5 py-2.5 text-right">
                          {prev && row.prevN !== undefined ? row.kind === 'pp' ? <PpDelta curr={row.currN} prev={row.prevN}/> : <PctDelta curr={row.currN} prev={row.prevN}/> : <span className="text-[11.5px] text-[#9b9890]">N/A</span>}
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono text-[12px] text-[#6b6860]">{yearAgo && row.yAgoN !== undefined ? row.fmt(row.yAgoN) : '—'}</td>
                        <td className="px-5 py-2.5 text-right">
                          {yearAgo && row.yAgoN !== undefined ? row.kind === 'pp' ? <PpDelta curr={row.currN} prev={row.yAgoN}/> : <PctDelta curr={row.currN} prev={row.yAgoN}/> : <span className="text-[11.5px] text-[#9b9890]">N/A</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-5 py-2 bg-blue-50/40 border-t border-[#e8e6df]">
                  <p className="text-[11px] text-[#2d5be3]"><span className="font-semibold">Note:</span> Historical comparison figures are calculated from actual cash flow and investment data. 'N/A' indicates insufficient historical data.</p>
                </div>
              </div>

              {/* Portfolio Company Summary */}
              <div className="border border-[#e8e6df] rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-[#e8e6df] flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-[#eef2fd] flex items-center justify-center text-[#2d5be3]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                  </div>
                  <span className="text-[13.5px] font-bold text-[#1a1915]">Portfolio Company Summary</span>
                  <span className="text-[12px] text-[#9b9890]">{companyRows.length} companies</span>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#e8e6df] bg-[#fafaf8]">
                      {['Company','Invested','Current Value','Distributed','Total Value','MOIC','IRR','Status'].map(h => (
                        <th key={h} className={`text-[11px] font-semibold text-[#9b9890] tracking-wide px-4 py-2.5 whitespace-nowrap ${h === 'Company' ? 'text-left' : 'text-right'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e6df]">
                    {pagedCompanyRows.map(({ co, invested, distributed, currentValue, totalValue, moic, irr }) => (
                      <tr key={co.id} className="hover:bg-[#fafaf8]">
                        <td className="px-4 py-2.5 text-[12.5px] font-medium text-[#1a1915]">{co.name}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px] text-[#1a1915]">{fmtFull(invested)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px] font-medium text-[#1a1915]">{fmtFull(currentValue)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px] text-[#6b6860]">{fmtFull(distributed)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px] text-[#1a1915]">{fmtFull(totalValue)}</td>
                        <td className="px-4 py-2.5 text-right"><span className={`font-mono text-[12px] font-semibold ${moic > 1 ? 'text-green-600' : moic < 1 ? 'text-red-500' : 'text-[#6b6860]'}`}>{moic.toFixed(2)}x</span></td>
                        <td className={`px-4 py-2.5 text-right font-mono text-[12px] font-medium ${irr > 0 ? 'text-green-600' : irr < 0 ? 'text-red-500' : 'text-[#9b9890]'}`}>{irr !== 0 ? `${irr >= 0 ? '+' : ''}${irr.toFixed(1)}%` : '0.0%'}</td>
                        <td className="px-4 py-2.5 text-right"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${co.status === 'Active' ? 'bg-green-50 text-green-700' : co.status === 'Exited' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>{co.status.toLowerCase()}</span></td>
                      </tr>
                    ))}
                    <tr className="bg-[#f9f8f5] border-t-2 border-[#e8e6df]">
                      <td className="px-4 py-2.5 text-[12.5px] font-bold text-[#1a1915]">TOTAL</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12px] font-bold text-[#1a1915]">{fmtFull(totals.invested)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12px] font-bold text-[#1a1915]">{fmtFull(totals.currentValue)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12px] font-bold text-[#1a1915]">{fmtFull(totals.distributed)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12px] font-bold text-[#1a1915]">{fmtFull(totals.totalValue)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12px] font-bold"><span className={current.moic > 1 ? 'text-green-600' : 'text-[#6b6860]'}>{current.moic.toFixed(2)}x</span></td>
                      <td className={`px-4 py-2.5 text-right font-mono text-[12px] font-bold ${current.irr > 0 ? 'text-green-600' : current.irr < 0 ? 'text-red-500' : 'text-[#9b9890]'}`}>{current.irr.toFixed(1)}%</td>
                      <td className="px-4 py-2.5"/>
                    </tr>
                  </tbody>
                </table>
                {fundCoTotalPages > 1 ? (
                  <div className="px-5 py-2.5 border-t border-[#e8e6df] bg-[#fafaf8] flex items-center justify-between">
                    <div className="text-[11.5px] text-[#9b9890]">Showing {(fundCoPage-1)*FUND_CO_PER_PAGE+1}–{Math.min(fundCoPage*FUND_CO_PER_PAGE,companyRows.length)} of {companyRows.length} entries</div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setFundCoPage(p => Math.max(1,p-1))} disabled={fundCoPage===1} className="px-3 py-1 rounded-[6px] border border-[#e8e6df] text-[11.5px] bg-white disabled:opacity-40 hover:bg-[#f9f8f5]">Previous</button>
                      <span className="text-[11.5px] text-[#6b6860]">Page {fundCoPage} of {fundCoTotalPages}</span>
                      <button onClick={() => setFundCoPage(p => Math.min(fundCoTotalPages,p+1))} disabled={fundCoPage===fundCoTotalPages} className="px-3 py-1 rounded-[6px] border border-[#e8e6df] text-[11.5px] bg-white disabled:opacity-40 hover:bg-[#f9f8f5]">Next</button>
                    </div>
                  </div>
                ) : (
                  <div className="px-5 py-2.5 border-t border-[#e8e6df] bg-[#fafaf8] text-[11.5px] text-[#9b9890]">Showing {companyRows.length} of {companyRows.length} entries</div>
                )}
              </div>
            </div>

            {/* ══ INDIVIDUAL COMPANY REPORTS ══ */}
            <div className="bg-white border border-[#e8e6df] rounded-xl p-6">
              <div className="mb-5">
                <div className="text-[16px] font-bold text-[#1a1915] mb-1">Individual Company Reports</div>
                <div className="text-[13px] text-[#9b9890]">Detailed analysis for each portfolio company in the fund.</div>
              </div>
              <div className="space-y-8">
                {sortedCompanies.map((co, i) => (
                  <CompanySnapshot
                    key={co.id}
                    idx={i + 1}
                    co={co}
                    txns={txns}
                    valuations={valuations}
                    quarter={quarter}
                    quarterEndDate={qEnd}
                    today={today}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
