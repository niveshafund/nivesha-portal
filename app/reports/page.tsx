'use client';
// app/reports/page.tsx

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { getFunds, DbFund } from '@/lib/db';
import { supabase } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────
type ReportType = 'fund_performance' | 'lp_report' | 'portfolio_deployment' | 'fund_company';

type SavedReport = {
  id: string;
  type: ReportType;
  name: string;
  fund_id: string;
  fund_name?: string;
  quarter: string;
  quarter_end: string;
  generated_at: string;
};

// ── Template definitions ──────────────────────────────────────
const TEMPLATES: {
  type: ReportType;
  label: string;
  description: string;
  href: string;
  color: string;
  icon: React.ReactElement;
}[] = [
  {
    type: 'fund_performance',
    label: 'Fund Performance',
    description: 'Overview of fund metrics, investments, and returns',
    href: '/reports/fund-performance',
    color: '#2d5be3',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-7 h-7">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  {
    type: 'lp_report',
    label: 'LP Report',
    description: 'Fund performance with LP proportional calculations',
    href: '/reports/lp-report',
    color: '#7c3aed',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-7 h-7">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    type: 'portfolio_deployment',
    label: 'Portfolio Deployment',
    description: 'Track investments by fund, company, and sector',
    href: '/reports/portfolio-deployment',
    color: '#059669',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-7 h-7">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    type: 'fund_company',
    label: 'Fund & Company Report',
    description: 'Fund report combined with all company snapshots',
    href: '/reports/fund-company',
    color: '#d97706',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-7 h-7">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
];

// ── Filter tabs ───────────────────────────────────────────────
type FilterTab = 'All' | 'Fund' | 'LP' | 'Deployment' | 'Fund & Co';
const FILTER_TABS: FilterTab[] = ['All', 'Fund', 'LP', 'Deployment', 'Fund & Co'];
const TAB_TO_TYPE: Record<FilterTab, ReportType | null> = {
  'All': null,
  'Fund': 'fund_performance',
  'LP': 'lp_report',
  'Deployment': 'portfolio_deployment',
  'Fund & Co': 'fund_company',
};

const TYPE_LABELS: Record<ReportType, string> = {
  fund_performance: 'Fund',
  lp_report: 'LP',
  portfolio_deployment: 'Deployment',
  fund_company: 'Fund & Co',
};

const TYPE_BADGE: Record<ReportType, string> = {
  fund_performance: 'bg-blue-50 text-blue-700',
  lp_report:        'bg-purple-50 text-purple-700',
  portfolio_deployment: 'bg-green-50 text-green-700',
  fund_company:     'bg-amber-50 text-amber-700',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ReportsPage() {
  const [funds, setFunds]     = useState<DbFund[]>([]);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('All');

  useEffect(() => {
    async function load() {
      try {
        const [fundsData, { data: reportsData }] = await Promise.all([
          getFunds(),
          supabase
            .from('reports')
            .select('*')
            .order('generated_at', { ascending: false })
            .limit(50),
        ]);
        setFunds(fundsData);
        const fundMap = Object.fromEntries(fundsData.map(f => [f.id, f.name]));
        setReports(
          (reportsData ?? []).map((r: any) => ({
            ...r,
            fund_name: fundMap[r.fund_id] ?? 'Unknown Fund',
          }))
        );
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = activeTab === 'All'
    ? reports
    : reports.filter(r => r.type === TAB_TO_TYPE[activeTab]);

  return (
    <div className="max-w-5xl">

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-[20px] font-semibold tracking-tight">Reports</h1>
        <p className="text-[13px] text-[#9b9890] mt-0.5">Generate and manage fund and LP reports</p>
      </div>

      {/* ── Report Templates ── */}
      <div className="mb-8">
        <div className="text-[13.5px] font-semibold text-[#1a1915] mb-3">Report Templates</div>
        <div className="grid grid-cols-4 gap-4">
          {TEMPLATES.map(t => (
            <Link
              key={t.type}
              href={t.href}
              className="bg-white border border-[#e8e6df] rounded-xl p-6 flex flex-col items-center text-center
                         hover:border-[#2d5be3] hover:shadow-sm transition-all duration-150 group"
            >
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
                style={{ background: `${t.color}14`, color: t.color }}
              >
                {t.icon}
              </div>
              <div className="text-[13px] font-semibold text-[#1a1915] mb-1.5 group-hover:text-[#2d5be3] transition-colors">
                {t.label}
              </div>
              <div className="text-[12px] text-[#9b9890] leading-relaxed">
                {t.description}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Recent Reports ── */}
      <div>
        {/* Sub-header + filter tabs */}
        <div className="flex items-center gap-3 mb-4">
          <div className="text-[13.5px] font-semibold text-[#1a1915]">Recent Reports</div>
          <div className="ml-auto flex gap-1 bg-white border border-[#e8e6df] rounded-xl p-1">
            {FILTER_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-[#2d5be3] text-white'
                    : 'text-[#6b6860] hover:text-[#1a1915]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-[#e8e6df] rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-5 h-5 border-2 border-[#2d5be3] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-11 h-11 rounded-xl bg-[#f9f8f5] flex items-center justify-center mb-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="#9b9890" strokeWidth={1.5} className="w-5 h-5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="text-[13px] font-medium text-[#1a1915] mb-1">No reports yet</div>
              <div className="text-[12px] text-[#9b9890]">
                {activeTab === 'All'
                  ? 'Generate your first report using a template above'
                  : `No ${activeTab} reports generated yet`}
              </div>
            </div>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e8e6df] bg-[#fafaf8]">
                    {['Report Name', 'Type', 'Fund', 'Quarter', 'Generated', ''].map(h => (
                      <th key={h}
                        className="text-[11px] font-semibold text-[#9b9890] tracking-wide text-left px-5 py-3 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e6df]">
                  {filtered.map(r => (
                    <tr key={r.id} className="hover:bg-[#fafaf8] transition-colors">
                      <td className="px-5 py-3 text-[13px] font-medium text-[#1a1915]">{r.name}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${TYPE_BADGE[r.type]}`}>
                          {TYPE_LABELS[r.type]}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[12.5px] text-[#6b6860]">{r.fund_name}</td>
                      <td className="px-5 py-3 text-[12.5px] text-[#6b6860]">{r.quarter}</td>
                      <td className="px-5 py-3 text-[12.5px] text-[#9b9890]">{fmtDate(r.generated_at)}</td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/reports/fund-performance?reportId=${r.id}`}
                          className="text-[12px] text-[#2d5be3] hover:underline font-medium"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-2.5 border-t border-[#e8e6df] bg-[#fafaf8] text-[11.5px] text-[#9b9890]">
                {filtered.length} report{filtered.length !== 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
