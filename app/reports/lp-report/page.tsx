'use client';
// app/reports/lp-report/page.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  getFunds, getLPsByFund, getCompaniesByFund, getTransactionsByFund,
  getValuationsByFund, getLPTransactionsByFund,
  DbFund, DbLP, DbCompany, DbTransaction, DbValuation, DbLPTransaction,
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

// ── IRR calc (CAGR proxy) ─────────────────────────────────────
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

// ── Fund-level metrics (as-of a cutoff date) — mirrors GP portal logic exactly ──
function calcFundMetrics(
  txns: DbTransaction[],
  companies: DbCompany[],
  valuations: DbValuation[],
  lps: DbLP[],
  asOfDate: string,
) {
  const cutoff = new Date(asOfDate);
  const ft = txns.filter(t => new Date(t.date) <= cutoff);

  const committed     = lps.reduce((s, lp) => s + lp.commitment, 0);
  const called        = lps.reduce((s, lp) => s + lp.called, 0);
  const uncalled      = Math.max(0, committed - called);

  // Company status map
  const coStatusMap: Record<string, string> = {};
  companies.forEach(c => { coStatusMap[c.id] = (c as any).status ?? 'Active'; });

  // Per-transaction valuation maps
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

  // Distribution amounts by company
  const distribByCo: Record<string, number> = {};
  ft.filter(t => t.type === 'Distribution' && t.company_id).forEach(t => {
    distribByCo[t.company_id!] = (distribByCo[t.company_id!] ?? 0) + t.amount;
  });

  // Realized: Exited + Written Off
  let realizedCost = 0, realizedProceeds = 0;
  ft.filter(t => t.type === 'Investment' && t.company_id).forEach(t => {
    const status = coStatusMap[t.company_id!];
    if (status === 'Exited' || status === 'Written Off') {
      realizedCost     += t.amount;
      realizedProceeds += distribByCo[t.company_id!] ?? 0;
    }
  });
  const realizedGL = realizedProceeds - realizedCost;

  // Unrealized: Active positions only
  let unrealisedCost = 0, unrealisedCurrentVal = 0;
  ft.filter(t => t.type === 'Investment' && t.company_id).forEach(t => {
    const status = coStatusMap[t.company_id!];
    if (status === 'Exited' || status === 'Written Off') return;
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

  const unrealisedGL    = unrealisedCurrentVal - unrealisedCost;
  const netUnrealisedGL = unrealisedGL + realizedGL; // matches GP portal Net Unrealized Gain/Loss
  const portfolioValue  = unrealisedCurrentVal;      // active NAV only
  const invested        = unrealisedCost + realizedCost; // all invested
  const distributions   = Object.values(distribByCo).reduce((s, v) => s + v, 0);
  const totalValue      = portfolioValue + distributions;
  const moic            = invested > 0 ? totalValue / invested : 1;
  const dpi             = invested > 0 ? distributions / invested : 0;

  // XIRR over all cashflows
  const cfs: { date: Date; amount: number }[] = [];
  ft.filter(t => t.type === 'Investment').forEach(t => cfs.push({ date: new Date(t.date), amount: -t.amount }));
  ft.filter(t => t.type === 'Distribution').forEach(t => cfs.push({ date: new Date(t.date), amount: t.amount }));
  if (portfolioValue > 0) cfs.push({ date: new Date(), amount: portfolioValue });
  cfs.sort((a, b) => a.date.getTime() - b.date.getTime());
  const irr = xirr(cfs);

  return {
    invested, distributions, committed, called, uncalled,
    portfolioValue, totalValue, moic, dpi, irr,
    realizedGL, unrealisedGL, netUnrealisedGL, realizedProceeds,
  };
}

const inputCls  = 'w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 bg-white';
const selectCls = 'w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] bg-white appearance-none pr-8';

const PER_PAGE = 25;

export default function LPReportPage() {
  const [funds, setFunds]           = useState<DbFund[]>([]);
  const [fundId, setFundId]         = useState('');
  const [lpId, setLpId]             = useState('all');
  const [quarter, setQuarter]       = useState(currentQuarter());
  const [reportName, setReportName] = useState('');
  const [commentary, setCommentary] = useState('');
  const [detailedMode, setDetailedMode] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveMsg, setSaveMsg]       = useState('');

  const [lps, setLps]               = useState<DbLP[]>([]);
  const [companies, setCompanies]   = useState<DbCompany[]>([]);
  const [txns, setTxns]             = useState<DbTransaction[]>([]);
  const [valuations, setValuations] = useState<DbValuation[]>([]);
  const [lpTxns, setLpTxns]         = useState<DbLPTransaction[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [page, setPage]             = useState(1);
  const reportRef = useRef<HTMLDivElement>(null);

  // Load funds
  useEffect(() => {
    getFunds().then(data => {
      setFunds(data);
      if (data.length > 0) setFundId(data[0].id);
    });
  }, []);

  // Auto-name report
  useEffect(() => {
    const fund = funds.find(f => f.id === fundId);
    const lp   = lps.find(l => l.id === lpId);
    const lpPart = lpId === 'all' ? 'All LPs' : (lp?.name ?? '');
    if (fund && quarter) setReportName(`${quarter} - ${fund.name} - LP Report${lpPart ? ' - ' + lpPart : ''}`);
  }, [fundId, lpId, quarter, funds, lps]);

  // Load fund data
  useEffect(() => {
    if (!fundId) return;
    setLoadingData(true);
    setLpId('all');
    Promise.all([
      getLPsByFund(fundId),
      getCompaniesByFund(fundId),
      getTransactionsByFund(fundId),
      getValuationsByFund(fundId),
      getLPTransactionsByFund(fundId),
    ]).then(([ls, cos, ts, vs, lts]) => {
      setLps(ls); setCompanies(cos); setTxns(ts); setValuations(vs); setLpTxns(lts);
    }).finally(() => setLoadingData(false));
  }, [fundId]);

  const fund   = funds.find(f => f.id === fundId);
  const qEnd   = quarterEnd(quarter);
  const cutoff = new Date(qEnd);

  // Fund-level metrics
  const fundMetrics = useMemo(
    () => calcFundMetrics(txns, companies, valuations, lps, qEnd),
    [txns, companies, valuations, lps, qEnd]
  );

  // Selected LP(s)
  const selectedLPs = useMemo(
    () => lpId === 'all' ? lps : lps.filter(l => l.id === lpId),
    [lps, lpId]
  );

  // Aggregate LP metrics across selected LPs
  const lpMetrics = useMemo(() => {
    const totalCommitment  = selectedLPs.reduce((s, lp) => s + lp.commitment, 0);
    const totalCalled      = selectedLPs.reduce((s, lp) => s + lp.called, 0);
    const totalDistributed = selectedLPs.reduce((s, lp) => s + lp.distributions, 0);
    const ownershipPct     = selectedLPs.reduce((s, lp) => s + lp.ownership_pct, 0);
    const uncalled         = Math.max(0, totalCommitment - totalCalled);
    const share            = ownershipPct / 100;

    // LP's proportional share — use net unrealized (matches GP portal) for portfolio value
    const lpPortfolioValue  = fundMetrics.portfolioValue  * share;
    const lpNetUnrealisedGL = fundMetrics.netUnrealisedGL * share;
    // Total value = active NAV + exit proceeds received (not LP distributions which are $0)
    const lpTotalValue      = lpPortfolioValue + (fundMetrics.realizedProceeds * share);

    // Use actual LP capital called from LP transactions, NOT proportional fund total.
    // Proportional estimate (fundMetrics.invested * share) diverges from actual LP
    // deployment when capital isn't deployed perfectly pro-rata across all LPs.
    const lpTxnsSorted = lpTxns
      .filter(t => selectedLPs.some(lp => lp.id === t.lp_id) && new Date(t.date) <= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date));
    // Invested = Called Capital − Admin Fee (matches GP portal "Net Invested Capital")
    const lpAdminFee = (fund?.management_fee ?? 0) / 100 * (fund?.fund_life ?? 10) * totalCalled;
    const lpInvested = totalCalled > 0 ? totalCalled - lpAdminFee : fundMetrics.invested * share;

    const moic = lpInvested > 0 ? lpTotalValue / lpInvested : 1;
    const dpi  = lpInvested > 0 ? totalDistributed / lpInvested : 0;

    // XIRR from actual LP capital call transactions
    const cfs: { date: Date; amount: number }[] = [];
    lpTxnsSorted.forEach(t => cfs.push({ date: new Date(t.date), amount: -t.amount }));
    if (lpPortfolioValue > 0) cfs.push({ date: new Date(), amount: lpPortfolioValue });
    const irr = xirr(cfs);

    return {
      totalCommitment, totalCalled, totalDistributed, ownershipPct,
      uncalled, lpPortfolioValue, lpTotalValue, lpInvested, lpNetUnrealisedGL,
      moic, dpi, irr, vehicleCount: selectedLPs.length,
    };
  }, [selectedLPs, fundMetrics, lpTxns, cutoff]);

  // Per-company rows (LP proportional share) — mirrors GP portal Portfolio tab
  const companyRows = useMemo(() => {
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
    txns.filter(t => t.type === 'Investment' && t.company_id && new Date(t.date) <= cutoff)
      .forEach(t => { investCountByCo[t.company_id!] = (investCountByCo[t.company_id!] ?? 0) + 1; });

    const pct = lpMetrics.ownershipPct / 100;

    return companies.map(co => {
      const coTxns = txns.filter(t => t.company_id === co.id && t.type === 'Investment'
        && new Date(t.date) <= cutoff);
      const fundInvested    = coTxns.reduce((s, t) => s + t.amount, 0);
      const fundDistributed = txns
        .filter(t => t.company_id === co.id && t.type === 'Distribution' && new Date(t.date) <= cutoff)
        .reduce((s, t) => s + t.amount, 0);

      // Per-transaction current value (same as GP portal)
      let fundCurrentValue = 0;
      coTxns.forEach(t => {
        const txnVal = latestValByTxn[t.id];
        const coVal  = latestValByCo[co.id];
        if (txnVal?.value != null) {
          fundCurrentValue += txnVal.value;
        } else if (coVal?.value != null) {
          if (investCountByCo[co.id] === 1) {
            fundCurrentValue += coVal.value;
          } else {
            const entryVal = (t as any).valuation_cap ?? null;
            const companyValue = (coVal as any).company_value ?? 0;
            fundCurrentValue += (entryVal && entryVal > 0 && companyValue > 0)
              ? (t.amount / entryVal) * companyValue : t.amount;
          }
        } else {
          fundCurrentValue += t.amount; // cost basis fallback
        }
      });

      const fundTotalValue = fundCurrentValue + fundDistributed;
      const lpInvested     = fundInvested     * pct;
      const lpCurrentValue = fundCurrentValue * pct;
      const lpDistributed  = fundDistributed  * pct;
      const lpTotalValue   = fundTotalValue   * pct;
      const moic = lpInvested > 0 ? lpTotalValue / lpInvested : 1;
      const cfs: { date: Date; amount: number }[] = [];
      coTxns.sort((a, b) => a.date.localeCompare(b.date)).forEach(t =>
        cfs.push({ date: new Date(t.date), amount: -(t.amount * pct) }));
      if (lpCurrentValue > 0) cfs.push({ date: new Date(), amount: lpCurrentValue });
      const irr = xirr(cfs);

      return { co, lpInvested, lpCurrentValue, lpDistributed, lpTotalValue, moic, irr };
    }).sort((a, b) => b.lpInvested - a.lpInvested);
  }, [companies, txns, valuations, cutoff, lpMetrics.ownershipPct]);

  const totalPages = Math.ceil(companyRows.length / PER_PAGE);
  const pagedRows  = companyRows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const coTotals = useMemo(() => ({
    lpInvested:     companyRows.reduce((s, r) => s + r.lpInvested, 0),
    lpCurrentValue: companyRows.reduce((s, r) => s + r.lpCurrentValue, 0),
    lpDistributed:  companyRows.reduce((s, r) => s + r.lpDistributed, 0),
    lpTotalValue:   companyRows.reduce((s, r) => s + r.lpTotalValue, 0),
  }), [companyRows]);

  // Save report
  async function handleSave() {
    if (!fundId || !reportName.trim()) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const now = new Date().toISOString();

      // 1. Save report metadata (existing behaviour)
      const { error } = await supabase.from('reports').insert({
        type: 'lp_report',
        name: reportName.trim(),
        fund_id: fundId,
        lp_id: lpId === 'all' ? null : lpId,
        quarter,
        quarter_end: qEnd,
        commentary,
        generated_at: now,
        created_at: now,
      });
      if (error) throw error;

      // 2. Upload HTML snapshot to LP documents (for each selected LP)
      const targetLPs = lpId === 'all' ? lps : lps.filter(l => l.id === lpId);
      if (targetLPs.length > 0) {
        // Generate PDF using jsPDF text API directly — no DOM capture, no color parsing issues
        const { jsPDF } = await import('jspdf');

        for (const lp of targetLPs) {
          const lpShare    = lp.ownership_pct / 100;
          const pdf        = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
          const W          = 210;
          const margin     = 16;
          const col2       = W / 2 + margin;
          let y            = margin;

          const hex = (color: string) => { pdf.setTextColor(color); };
          const line = (x1: number, y1: number, x2: number, y2: number, color = '#e8e6df') => {
            pdf.setDrawColor(color);
            pdf.setLineWidth(0.3);
            pdf.line(x1, y1, x2, y2);
          };
          const fmt = (n: number) => n >= 1_000_000
            ? `$${(n/1_000_000).toFixed(2)}M`
            : n >= 1_000 ? `$${(n/1_000).toFixed(1)}K` : `$${n.toLocaleString()}`;
          const fmtFull = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

          // ── Header ──
          pdf.setFillColor('#1a1915');
          pdf.rect(0, 0, W, 22, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(14);
          pdf.setTextColor('#ffffff');
          pdf.text('Nivesha Ventures', margin, 10);
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'normal');
          pdf.text('LP Report — Confidential', margin, 16);
          pdf.text(`Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, W - margin, 16, { align: 'right' });
          y = 30;

          // ── Report Title ──
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(16);
          hex('#1a1915');
          pdf.text(reportName.trim(), margin, y);
          y += 6;
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          hex('#6b6860');
          pdf.text(`Fund: ${fund?.name}   ·   LP: ${lp.name}   ·   Reporting Period: ${quarterLabel(quarter)}`, margin, y);
          y += 10;
          line(margin, y, W - margin, y);
          y += 6;

          // ── LP Details & Performance ──
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(10);
          hex('#1a1915');
          pdf.text('LP Performance Overview', margin, y);
          y += 5;

          const lpCalled   = lp.called;
          const adminFee   = (fund?.management_fee ?? 1) / 100 * (fund?.fund_life ?? 10) * lpCalled;
          const lpPortVal  = fundMetrics.portfolioValue * lpShare;
          // Invested = Called Capital − Admin Fee (matches GP portal "Net Invested Capital")
          const lpInvested = lpCalled > 0 ? lpCalled - adminFee : fundMetrics.invested * lpShare;
          const lpMOIC     = lpInvested > 0 ? (lpPortVal + lp.distributions) / lpInvested : 1;

          const detailRows = [
            ['LP Name', lp.name,           'NET MOIC', `${lpMOIC.toFixed(2)}x`],
            ['Fund Ownership', `${lp.ownership_pct.toFixed(1)}%`, 'NET IRR', `${lpMetrics.irr.toFixed(1)}%`],
            ['Commitment', fmtFull(lp.commitment), 'DPI', `${lpMetrics.dpi.toFixed(2)}x`],
            ['Capital Called', fmtFull(lpCalled), '', ''],
          ];

          detailRows.forEach(([l1, v1, l2, v2]) => {
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            hex('#6b6860');
            pdf.text(l1, margin, y);
            pdf.setFont('helvetica', 'bold');
            hex('#1a1915');
            pdf.text(v1, margin + 42, y);
            if (l2) {
              pdf.setFont('helvetica', 'normal');
              hex('#6b6860');
              pdf.text(l2, col2, y);
              pdf.setFont('helvetica', 'bold');
              hex('#2d5be3');
              pdf.text(v2, col2 + 42, y);
            }
            y += 5;
          });
          y += 4;
          line(margin, y, W - margin, y);
          y += 6;

          // ── Financial Summary ──
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(10);
          hex('#1a1915');
          pdf.text('LP Financial Summary', margin, y);
          y += 5;

          const summaryRows: [string, string, string][] = [
            ['Commitment',      fmtFull(fund?.committed ?? 0),          fmtFull(lp.commitment)],
            ['Capital Called',  fmtFull(fundMetrics.called),             fmtFull(lpCalled)],
            ['Admin Fee',       fmtFull(adminFee / lpShare),             fmtFull(adminFee)],
            ['Invested Capital',fmtFull(fundMetrics.invested),           fmtFull(lpInvested)],
            ['Portfolio Value', fmtFull(fundMetrics.portfolioValue),     fmtFull(lpPortVal)],
            ['Distributions',   fmtFull(fundMetrics.distributions),      fmtFull(lp.distributions)],
            ['Total Value',     fmtFull(fundMetrics.totalValue),         fmtFull(lpPortVal + lp.distributions)],
          ];

          // Table header
          pdf.setFontSize(8);
          pdf.setFont('helvetica', 'bold');
          hex('#9b9890');
          pdf.text('METRIC', margin, y);
          pdf.text('FUND TOTAL', W - margin - 60, y);
          pdf.text('LP SHARE', W - margin - 20, y, { align: 'right' });
          y += 3;
          line(margin, y, W - margin, y, '#1a1915');
          y += 4;

          summaryRows.forEach(([label, fundVal, lpVal]) => {
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            hex('#1a1915');
            pdf.text(label, margin, y);
            hex('#6b6860');
            pdf.text(fundVal, W - margin - 60, y);
            pdf.setFont('helvetica', 'bold');
            hex('#2d5be3');
            pdf.text(lpVal, W - margin, y, { align: 'right' });
            y += 5;
            line(margin, y - 1.5, W - margin, y - 1.5);
          });
          y += 4;

          // ── Commentary ──
          if (commentary.trim()) {
            line(margin, y, W - margin, y);
            y += 6;
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(10);
            hex('#1a1915');
            pdf.text('Commentary', margin, y);
            y += 5;
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            hex('#3d3b35');
            const lines = pdf.splitTextToSize(commentary.trim(), W - margin * 2);
            pdf.text(lines, margin, y);
          }

          // ── Footer ──
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7.5);
          hex('#9b9890');
          pdf.text('This report is confidential and intended solely for the named LP. Past performance is not indicative of future results.', margin, 285);
          line(margin, 282, W - margin, 282);

          const pdfBlob = pdf.output('blob');
          const fileName = `${reportName.trim().replace(/[^a-zA-Z0-9-_ ]/g, '')}-${lp.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
          const filePath = `${lp.id}/${Date.now()}-${fileName}`;

          const { error: uploadErr } = await supabase.storage
            .from('lp-documents')
            .upload(filePath, pdfBlob, { contentType: 'application/pdf', upsert: false });
          if (uploadErr) { console.warn(`[save-report] upload failed for ${lp.name}:`, uploadErr.message); continue; }

          await supabase.from('lp_documents').insert({
            lp_id:       lp.id,
            fund_id:     fundId,
            name:        reportName.trim(),
            file_path:   filePath,
            file_size:   pdfBlob.size,
            file_type:   'application/pdf',
            doc_type:    'Quarterly Report',
            notes:       `${quarterLabel(quarter)} LP Report`,
            uploaded_by: 'GP',
            created_at:  now,
          });
        }
      }

      const lpCount = targetLPs.length;
      setSaveMsg(lpCount > 0
        ? `Report saved & sent to ${lpCount === 1 ? targetLPs[0].name : `${lpCount} LPs`}'s documents ✓`
        : 'Report saved!');
      setTimeout(() => setSaveMsg(''), 4000);
    } catch (e: any) {
      console.error('[save-report]', e);
      setSaveMsg(`Failed to save: ${e?.message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  function handleExportCSV() {
    const rows: (string | number)[][] = [
      ['LP Report', reportName],
      ['Fund', fund?.name ?? ''],
      ['Quarter', quarterLabel(quarter)],
      ['LP', lpId === 'all' ? 'All LPs' : (lps.find(l => l.id === lpId)?.name ?? '')],
      [],
      ['LP Financial Summary'],
      ['Metric', 'Fund Total', 'LP Share', 'Ownership %'],
      ['Commitment',     fmtFull(fundMetrics.committed),     fmtFull(lpMetrics.totalCommitment),  `${lpMetrics.ownershipPct.toFixed(1)}%`],
      ['Invested',       fmtFull(fundMetrics.invested),      fmtFull(lpMetrics.lpInvested),        `${lpMetrics.ownershipPct.toFixed(1)}%`],
      ['Portfolio Value',fmtFull(fundMetrics.portfolioValue),fmtFull(lpMetrics.lpPortfolioValue),  `${lpMetrics.ownershipPct.toFixed(1)}%`],
      ['Distributions',  fmtFull(fundMetrics.distributions), fmtFull(lpMetrics.totalDistributed),  `${lpMetrics.ownershipPct.toFixed(1)}%`],
      ['Total Value',    fmtFull(fundMetrics.totalValue),    fmtFull(lpMetrics.lpTotalValue),      `${lpMetrics.ownershipPct.toFixed(1)}%`],
      ['Uncalled Capital',fmtFull(fundMetrics.uncalled),     fmtFull(lpMetrics.uncalled),          `${lpMetrics.ownershipPct.toFixed(1)}%`],
    ];
    if (detailedMode) {
      rows.push([], ['Portfolio Companies - LP Proportional Share']);
      rows.push(['Company', "LP's Invested", "LP's Current Value", "LP's Distributed", "LP's Total Value", 'MOIC', 'IRR']);
      companyRows.forEach(r => rows.push([
        r.co.name, r.lpInvested, r.lpCurrentValue, r.lpDistributed, r.lpTotalValue,
        `${r.moic.toFixed(2)}x`, `${r.irr.toFixed(1)}%`,
      ]));
    }
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${reportName || 'lp-report'}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const today   = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const selectedLP = lps.find(l => l.id === lpId);

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
          <span className="text-[13px] text-[#1a1915]">LP Report</span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight">LP Report</h1>
            <p className="text-[13px] text-[#9b9890] mt-0.5">Fund performance with LP-specific proportional calculations</p>
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
          <div className="grid grid-cols-4 gap-4 mb-4">
            {/* Report name */}
            <div>
              <label className="block text-[11.5px] font-medium text-[#6b6860] mb-1.5">Report Name</label>
              <input value={reportName} onChange={e => setReportName(e.target.value)}
                placeholder="Report name" className={inputCls} />
            </div>
            {/* Fund */}
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
            {/* LP selector */}
            <div>
              <label className="block text-[11.5px] font-medium text-[#6b6860] mb-1.5">Limited Partner</label>
              <div className="relative">
                <select value={lpId} onChange={e => { setLpId(e.target.value); setPage(1); }} className={selectCls}>
                  <option value="all">All LPs (Aggregated)</option>
                  {lps.map(lp => (
                    <option key={lp.id} value={lp.id}>
                      {lp.name} ({lp.ownership_pct.toFixed(1)}%)
                    </option>
                  ))}
                </select>
                <svg viewBox="0 0 24 24" fill="none" stroke="#9b9890" strokeWidth={2}
                  className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
            {/* Quarter */}
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

          {/* Commentary + detail mode toggle */}
          <div className="mb-4">
            <label className="block text-[11.5px] font-medium text-[#6b6860] mb-1.5">
              Commentary <span className="font-normal text-[#9b9890]">(Optional)</span>
            </label>
            <textarea value={commentary} onChange={e => setCommentary(e.target.value)} rows={3}
              placeholder="Add commentary specific to this LP's performance or fund updates..."
              className="w-full px-3 py-2.5 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 bg-white resize-none placeholder:text-[#c4c2bb]"
            />
          </div>

          {/* Detailed mode toggle */}
          <div className="flex items-center justify-between py-3 px-4 bg-[#f9f8f5] rounded-[8px] border border-[#e8e6df]">
            <div>
              <div className="text-[12.5px] font-medium text-[#1a1915]">Show Portfolio Company Breakdown</div>
              <div className="text-[11.5px] text-[#9b9890] mt-0.5">
                {detailedMode
                  ? 'LP will see their proportional share per company — use for high-trust LPs'
                  : 'Summary only — LP sees fund-level metrics without company detail (recommended)'}
              </div>
            </div>
            <button
              onClick={() => setDetailedMode(v => !v)}
              className={`relative w-10 h-5.5 rounded-full transition-colors flex-shrink-0 ${
                detailedMode ? 'bg-[#2d5be3]' : 'bg-[#d1cfc8]'
              }`}
              style={{ width: 40, height: 22 }}
            >
              <span className={`absolute top-[3px] w-4 h-4 bg-white rounded-full shadow transition-transform ${
                detailedMode ? 'translate-x-[20px]' : 'translate-x-[3px]'
              }`} />
            </button>
          </div>
        </div>

        {/* ── Loading ── */}
        {loadingData ? (
          <div className="bg-white border border-[#e8e6df] rounded-xl flex items-center justify-center h-48">
            <div className="w-5 h-5 border-2 border-[#2d5be3] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !fundId ? null : (
          <div ref={reportRef}>
            {/* ── Report Header ── */}
            <div className="bg-white border border-[#e8e6df] rounded-xl p-6">
              <div className="text-[20px] font-bold text-[#1a1915] mb-2">LP Report</div>
              <div className="space-y-0.5 text-[13px] text-[#6b6860]">
                <div>Fund: <span className="font-medium text-[#1a1915]">{fund?.name}</span></div>
                <div>LP: <span className="font-medium text-[#1a1915]">
                  {lpId === 'all' ? `All LPs (${lps.length})` : selectedLP?.name}
                </span></div>
                <div>Reporting Period: <span className="font-medium text-[#1a1915]">{quarterLabel(quarter)}</span></div>
                <div>Generated: <span className="font-medium text-[#1a1915]">{today}</span></div>
              </div>
              {commentary && (
                <div className="mt-4 pt-4 border-t border-[#e8e6df] text-[13px] text-[#3d3b35] leading-relaxed whitespace-pre-wrap">
                  {commentary}
                </div>
              )}
            </div>

            {/* ── LP Performance Overview ── */}
            <div className="bg-white border border-[#e8e6df] rounded-xl p-6">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-7 h-7 rounded-lg bg-[#eef2fd] flex items-center justify-center text-[#2d5be3]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                    <polyline points="16 7 22 7 22 13" />
                  </svg>
                </div>
                <span className="text-[15px] font-bold text-[#1a1915]">LP Performance Overview</span>
              </div>

              <div className="grid grid-cols-2 gap-8">
                {/* LP Details */}
                <div>
                  <div className="text-[12px] font-semibold text-[#9b9890] uppercase tracking-wider mb-3">LP Details</div>
                  <table className="w-full">
                    <tbody className="divide-y divide-[#f0efe9]">
                      {[
                        { label: 'LP Name',             value: lpId === 'all' ? `All LPs (${lps.length})` : (selectedLP?.name ?? '—') },
                        { label: 'Fund Ownership',      value: `${lpMetrics.ownershipPct.toFixed(1)}%` },
                        { label: 'Commitment',          value: fmtFull(lpMetrics.totalCommitment) },
                        { label: 'Capital Called',      value: fmtFull(lpMetrics.totalCalled) },
                        { label: 'Number of Vehicles',  value: `${lpMetrics.vehicleCount}` },
                      ].map(row => (
                        <tr key={row.label}>
                          <td className="py-2 text-[13px] text-[#6b6860]">{row.label}:</td>
                          <td className="py-2 text-[13px] font-medium text-[#1a1915] text-right">{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Performance Metrics */}
                <div>
                  <div className="text-[12px] font-semibold text-[#9b9890] uppercase tracking-wider mb-3">Performance Metrics</div>
                  <table className="w-full">
                    <tbody className="divide-y divide-[#f0efe9]">
                      {[
                        {
                          label: 'NET MOIC',
                          value: `${lpMetrics.moic.toFixed(2)}x`,
                          color: lpMetrics.moic > 1 ? 'text-[#2d5be3]' : lpMetrics.moic < 1 ? 'text-red-500' : 'text-[#1a1915]',
                        },
                        {
                          label: 'NET IRR',
                          value: `${lpMetrics.irr.toFixed(1)}%`,
                          color: lpMetrics.irr > 0 ? 'text-green-600' : lpMetrics.irr < 0 ? 'text-red-500' : 'text-[#9b9890]',
                        },
                        {
                          label: 'DPI',
                          value: `${lpMetrics.dpi.toFixed(2)}x`,
                          color: lpMetrics.dpi > 0 ? 'text-amber-600' : 'text-[#9b9890]',
                        },
                      ].map(row => (
                        <tr key={row.label}>
                          <td className="py-2 text-[13px] text-[#6b6860]">{row.label}:</td>
                          <td className={`py-2 text-[13px] font-bold font-mono text-right ${row.color}`}>{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* ── LP Financial Summary ── */}
            <div className="bg-white border border-[#e8e6df] rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[#e8e6df]">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[#eef2fd] flex items-center justify-center text-[#2d5be3]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                      <line x1="12" y1="1" x2="12" y2="23" />
                      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                  </div>
                  <span className="text-[15px] font-bold text-[#1a1915]">LP Financial Summary</span>
                </div>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e8e6df] bg-[#fafaf8]">
                    <th className="text-[11px] font-semibold text-[#9b9890] tracking-wide text-left px-5 py-3">Metric</th>
                    <th className="text-[11px] font-semibold text-[#9b9890] tracking-wide text-right px-5 py-3">Fund Total</th>
                    <th className="text-[11px] font-semibold text-[#2d5be3] tracking-wide text-right px-5 py-3">LP Share</th>
                    <th className="text-[11px] font-semibold text-[#9b9890] tracking-wide text-right px-5 py-3">Ownership %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e6df]">
                  {[
                    { label: 'Commitment',      fundVal: fundMetrics.committed,     lpVal: lpMetrics.totalCommitment,  highlight: false },
                    { label: 'Invested',        fundVal: fundMetrics.invested,      lpVal: lpMetrics.lpInvested,       highlight: false },
                    { label: 'Portfolio Value', fundVal: fundMetrics.portfolioValue, lpVal: lpMetrics.lpPortfolioValue, highlight: false },
                    { label: 'Distributions',   fundVal: fundMetrics.distributions, lpVal: lpMetrics.totalDistributed, highlight: false },
                    { label: 'Total Value',     fundVal: fundMetrics.totalValue,    lpVal: lpMetrics.lpTotalValue,     highlight: true  },
                    { label: 'Uncalled Capital',fundVal: fundMetrics.uncalled,      lpVal: lpMetrics.uncalled,         highlight: 'amber' as const },
                  ].map(row => (
                    <tr key={row.label} className={`hover:bg-[#fafaf8] transition-colors ${
                      row.highlight === 'amber' ? 'bg-amber-50/40' : ''
                    }`}>
                      <td className="px-5 py-3 text-[13px] text-[#1a1915]">{row.label}</td>
                      <td className="px-5 py-3 text-right font-mono text-[12.5px] text-[#6b6860]">
                        {fmtFull(row.fundVal)}
                      </td>
                      <td className={`px-5 py-3 text-right font-mono text-[12.5px] font-bold ${
                        row.highlight === true    ? 'text-[#2d5be3]' :
                        row.highlight === 'amber' ? 'text-amber-600' :
                        'text-[#1a1915]'
                      }`}>
                        {fmtFull(row.lpVal)}
                      </td>
                      <td className="px-5 py-3 text-right text-[12.5px] text-[#6b6860]">
                        {lpMetrics.ownershipPct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-2.5 bg-blue-50/40 border-t border-[#e8e6df]">
                <p className="text-[11.5px] text-[#2d5be3]">
                  <span className="font-semibold">Note:</span> LP shares are calculated proportionally based on ownership percentage. MOIC, IRR, and DPI remain unchanged as they are relative performance metrics.
                </p>
              </div>
            </div>

            {/* ── Portfolio Companies (Detailed mode only) ── */}
            {detailedMode && (
              <div className="bg-white border border-[#e8e6df] rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-[#e8e6df] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-[#eef2fd] flex items-center justify-center text-[#2d5be3]">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                        <rect x="2" y="7" width="20" height="14" rx="2" />
                        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
                      </svg>
                    </div>
                    <span className="text-[15px] font-bold text-[#1a1915]">Portfolio Companies — LP's Proportional Share</span>
                    <span className="text-[12px] text-[#9b9890]">{companyRows.length} companies</span>
                  </div>
                  {/* Detailed mode badge */}
                  <span className="px-2.5 py-1 bg-purple-50 text-purple-700 text-[11px] font-medium rounded-full">
                    Detailed View
                  </span>
                </div>

                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#e8e6df] bg-[#fafaf8]">
                      {["Company", "LP's Invested", "LP's Current Value", "LP's Distributed", "LP's Total Value", "MOIC", "IRR"].map(h => (
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
                    {pagedRows.map(({ co, lpInvested, lpCurrentValue, lpDistributed, lpTotalValue, moic, irr }) => (
                      <tr key={co.id} className="hover:bg-[#fafaf8] transition-colors">
                        <td className="px-5 py-3">
                          <div className="text-[13px] font-medium text-[#1a1915]">{co.name}</div>
                          <div className="text-[11px] text-[#9b9890]">{co.sector ?? 'N/A'}</div>
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-[12.5px] text-[#1a1915]">{fmtFull(lpInvested)}</td>
                        <td className="px-5 py-3 text-right font-mono text-[12.5px] font-medium text-[#1a1915]">{fmtFull(lpCurrentValue)}</td>
                        <td className="px-5 py-3 text-right font-mono text-[12.5px] text-[#6b6860]">{fmtFull(lpDistributed)}</td>
                        <td className="px-5 py-3 text-right font-mono text-[12.5px] text-[#1a1915]">{fmtFull(lpTotalValue)}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`text-[12.5px] font-semibold font-mono ${
                            moic > 1 ? 'text-green-600' : moic < 1 ? 'text-red-500' : 'text-[#6b6860]'
                          }`}>
                            {moic.toFixed(2)}x
                          </span>
                        </td>
                        <td className={`px-5 py-3 text-right font-mono text-[12.5px] font-medium ${
                          irr > 0 ? 'text-green-600' : irr < 0 ? 'text-red-500' : 'text-[#9b9890]'
                        }`}>
                          {irr !== 0 ? `${irr >= 0 ? '+' : ''}${irr.toFixed(1)}%` : '0.0%'}
                        </td>
                      </tr>
                    ))}
                    {/* Totals */}
                    <tr className="bg-[#f9f8f5] border-t-2 border-[#e8e6df]">
                      <td className="px-5 py-3 text-[13px] font-bold text-[#1a1915]">TOTAL</td>
                      <td className="px-5 py-3 text-right font-mono text-[12.5px] font-bold text-[#1a1915]">{fmtFull(coTotals.lpInvested)}</td>
                      <td className="px-5 py-3 text-right font-mono text-[12.5px] font-bold text-[#1a1915]">{fmtFull(coTotals.lpCurrentValue)}</td>
                      <td className="px-5 py-3 text-right font-mono text-[12.5px] font-bold text-[#1a1915]">{fmtFull(coTotals.lpDistributed)}</td>
                      <td className="px-5 py-3 text-right font-mono text-[12.5px] font-bold text-[#1a1915]">{fmtFull(coTotals.lpTotalValue)}</td>
                      <td className="px-5 py-3 text-right font-mono text-[12.5px] font-bold">
                        <span className={lpMetrics.moic > 1 ? 'text-green-600' : 'text-[#6b6860]'}>
                          {lpMetrics.moic.toFixed(2)}x
                        </span>
                      </td>
                      <td className={`px-5 py-3 text-right font-mono text-[12.5px] font-bold ${
                        lpMetrics.irr > 0 ? 'text-green-600' : lpMetrics.irr < 0 ? 'text-red-500' : 'text-[#9b9890]'
                      }`}>
                        {lpMetrics.irr.toFixed(1)}%
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Pagination */}
                {totalPages > 1 ? (
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
                ) : (
                  <div className="px-5 py-2.5 border-t border-[#e8e6df] bg-[#fafaf8] text-[11.5px] text-[#9b9890]">
                    Showing {companyRows.length} of {companyRows.length} entries
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
