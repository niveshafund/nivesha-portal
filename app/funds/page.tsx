'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FUNDS, Fund, FundStatus, fmt, fmtFull, moicColor, irrColor, statusBadge } from '@/lib/data';

const SECTORS = [
  'Healthcare Tech', 'Fintech', 'SpaceTech', 'B2B SaaS', 'AI / ML',
  'CleanTech', 'EdTech', 'Consumer Tech', 'DeepTech', 'Cybersecurity',
  'Logistics', 'PropTech', 'AgTech', 'Robotics', 'Blockchain',
];

type NewFund = {
  name: string;
  vintage: string;
  committed: string;
  managementFee: string;
  carriedInterest: string;
  status: FundStatus;
  focus: string[];
  startDate: string;
};

const empty: NewFund = {
  name: '', vintage: String(new Date().getFullYear()),
  committed: '', managementFee: '2', carriedInterest: '20',
  status: 'Active', focus: [], startDate: '',
};

export default function FundsPage() {
  const [funds, setFunds] = useState<Fund[]>(FUNDS);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<NewFund>(empty);
  const [errors, setErrors] = useState<Partial<NewFund>>({});

  const validate = (): boolean => {
    const e: Partial<NewFund> = {};
    if (!form.name.trim())      e.name = 'Fund name is required';
    if (!form.committed.trim()) e.committed = 'Fund size is required';
    if (isNaN(Number(form.committed)) || Number(form.committed) <= 0)
      e.committed = 'Enter a valid amount';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCreate = () => {
    if (!validate()) return;
    const committed = Number(form.committed);
    const newFund: Fund = {
      id: `fund-${Date.now()}`,
      name: form.name.trim(),
      vintage: Number(form.vintage),
      committed,
      called: 0,
      invested: 0,
      nav: 0,
      distributions: 0,
      moic: 0,
      irr: 0,
      dpi: 0,
      managementFee: Number(form.managementFee),
      carriedInterest: Number(form.carriedInterest),
      status: form.status,
      focus: form.focus,
      lpCount: 0,
      companyCount: 0,
      startDate: form.startDate || `${form.vintage}`,
    };
    setFunds([...funds, newFund]);
    setShowModal(false);
    setForm(empty);
    setErrors({});
  };

  const toggleSector = (s: string) => {
    setForm(f => ({
      ...f,
      focus: f.focus.includes(s) ? f.focus.filter(x => x !== s) : [...f.focus, s],
    }));
  };

  const totalCommitted = funds.reduce((s, f) => s + f.committed, 0);
  const totalInvested  = funds.reduce((s, f) => s + f.invested,  0);
  const totalNAV       = funds.reduce((s, f) => s + f.nav,       0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Funds</h1>
          <p className="text-[12.5px] text-[#6b6860] mt-0.5">
            Manage your investment funds and track their performance
          </p>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white text-[#1a1917] hover:bg-[#f9f8f5] transition-colors">
            ↑ Import
          </button>
          <Link
            href="/funds/new"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors"
          >
            + New Fund
          </Link>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total Funds',       value: String(funds.length),  mono: false },
          { label: 'Total Committed',   value: fmt(totalCommitted),   mono: true },
          { label: 'Total Invested',    value: fmt(totalInvested),    mono: true },
          { label: 'Total NAV',         value: fmt(totalNAV),         mono: true },
        ].map(k => (
          <div key={k.label} className="bg-white border border-[#e8e6df] rounded-xl p-4">
            <label className="text-[11.5px] text-[#6b6860] block mb-1.5">{k.label}</label>
            <div className={`text-[20px] font-semibold tracking-tight ${k.mono ? 'font-mono' : ''}`}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Funds table */}
      <div className="bg-white border border-[#e8e6df] rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Fund Name', 'Vintage', 'Committed', 'Called', 'NAV', 'MOIC', 'IRR', 'Status', 'Companies', 'LPs', 'Focus', 'Actions'].map(h => (
                  <th key={h} className="text-[11px] font-medium text-[#6b6860] text-left px-3 py-2.5 border-b-2 border-[#e8e6df] bg-[#f9f8f5] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {funds.map(f => (
                <tr key={f.id} className="hover:bg-[#f9f8f5] transition-colors">
                  <td className="px-3 py-3 border-b border-[#e8e6df]">
                    <div className="font-medium text-[13px]">{f.name}</div>
                    <div className="text-[11px] text-[#9b9890] mt-0.5">
                      {f.managementFee}% mgmt · {f.carriedInterest}% carry
                    </div>
                  </td>
                  <td className="px-3 py-3 border-b border-[#e8e6df] font-mono text-[12px]">{f.vintage}</td>
                  <td className="px-3 py-3 border-b border-[#e8e6df] font-mono text-[12px]">{fmt(f.committed)}</td>
                  <td className="px-3 py-3 border-b border-[#e8e6df]">
                    <div className="font-mono text-[12px]">{fmt(f.called)}</div>
                    {f.committed > 0 && (
                      <div className="mt-1 h-1 bg-[#f0f0ed] rounded-full w-20">
                        <div
                          className="h-1 bg-[#2d5be3] rounded-full"
                          style={{ width: `${Math.min(100, (f.called / f.committed) * 100)}%` }}
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 border-b border-[#e8e6df] font-mono text-[12px]">{f.nav > 0 ? fmt(f.nav) : '—'}</td>
                  <td className={`px-3 py-3 border-b border-[#e8e6df] text-[12.5px] ${moicColor(f.moic)}`}>
                    {f.moic > 0 ? `${f.moic.toFixed(2)}x` : '—'}
                  </td>
                  <td className={`px-3 py-3 border-b border-[#e8e6df] text-[12.5px] ${irrColor(f.irr)}`}>
                    {f.irr !== 0 ? `${f.irr.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-3 py-3 border-b border-[#e8e6df]">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusBadge(f.status)}`}>
                      {f.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 border-b border-[#e8e6df] text-[12.5px] text-center">{f.companyCount}</td>
                  <td className="px-3 py-3 border-b border-[#e8e6df] text-[12.5px] text-center">{f.lpCount}</td>
                  <td className="px-3 py-3 border-b border-[#e8e6df]">
                    <div className="flex flex-wrap gap-1">
                      {f.focus.slice(0, 2).map(s => (
                        <span key={s} className="px-1.5 py-0.5 rounded text-[10px] bg-[#eef2fd] text-[#2d5be3] font-medium">
                          {s}
                        </span>
                      ))}
                      {f.focus.length > 2 && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#f9f8f5] text-[#6b6860]">
                          +{f.focus.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 border-b border-[#e8e6df]">
                    <Link
                      href={`/funds/${f.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors whitespace-nowrap"
                    >
                      View Details →
                    </Link>
                  </td>
                </tr>
              ))}
              {/* Totals row */}
              <tr className="bg-[#f9f8f5] font-semibold">
                <td className="px-3 py-2.5 text-[12.5px]">TOTAL</td>
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5 font-mono text-[12px]">{fmt(totalCommitted)}</td>
                <td className="px-3 py-2.5 font-mono text-[12px]">{fmt(totalInvested)}</td>
                <td className="px-3 py-2.5 font-mono text-[12px]">{fmt(totalNAV)}</td>
                <td colSpan={7} className="px-3 py-2.5 text-right text-[11px] text-[#9b9890] font-normal">
                  {funds.length} fund{funds.length !== 1 ? 's' : ''}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#e8e6df]">
          <span className="text-[12px] text-[#6b6860]">
            Showing 1–{funds.length} of {funds.length} entries
          </span>
          <div className="flex gap-1.5">
            <button disabled className="px-2.5 py-1 rounded-[5px] border border-[#e8e6df] text-[11.5px] opacity-35 cursor-default">Previous</button>
            <span className="px-2.5 py-1 text-[11.5px]">Page 1 of 1</span>
            <button disabled className="px-2.5 py-1 rounded-[5px] border border-[#e8e6df] text-[11.5px] opacity-35 cursor-default">Next</button>
          </div>
        </div>
      </div>

      {/* ── CREATE FUND MODAL ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { setShowModal(false); setForm(empty); setErrors({}); }}
          />
          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e6df]">
              <div>
                <h2 className="text-[16px] font-semibold">Create New Fund</h2>
                <p className="text-[12px] text-[#6b6860] mt-0.5">Set up a new investment fund</p>
              </div>
              <button
                onClick={() => { setShowModal(false); setForm(empty); setErrors({}); }}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f9f8f5] text-[#6b6860] text-lg transition-colors"
              >
                ×
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-5">

              {/* Fund Name */}
              <div>
                <label className="block text-[12.5px] font-medium mb-1.5">
                  Fund Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Nivesha Ventures Fund II"
                  className={`w-full px-3 py-2 rounded-[7px] border text-[13px] font-sans outline-none transition-colors ${
                    errors.name ? 'border-red-400 bg-red-50' : 'border-[#e8e6df] focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10'
                  }`}
                />
                {errors.name && <p className="text-[11px] text-red-500 mt-1">{errors.name}</p>}
              </div>

              {/* Vintage + Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12.5px] font-medium mb-1.5">Vintage Year</label>
                  <select
                    value={form.vintage}
                    onChange={e => setForm(f => ({ ...f, vintage: e.target.value }))}
                    className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] font-sans outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 transition-colors"
                  >
                    {[2020,2021,2022,2023,2024,2025,2026,2027].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12.5px] font-medium mb-1.5">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as FundStatus }))}
                    className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] font-sans outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 transition-colors"
                  >
                    <option value="Fundraising">Fundraising</option>
                    <option value="Active">Active</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
              </div>

              {/* Fund Size */}
              <div>
                <label className="block text-[12.5px] font-medium mb-1.5">
                  Fund Size / Committed Capital (USD) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6860] text-[13px]">$</span>
                  <input
                    type="number"
                    value={form.committed}
                    onChange={e => setForm(f => ({ ...f, committed: e.target.value }))}
                    placeholder="e.g. 10000000"
                    className={`w-full pl-6 pr-3 py-2 rounded-[7px] border text-[13px] font-sans outline-none transition-colors ${
                      errors.committed ? 'border-red-400 bg-red-50' : 'border-[#e8e6df] focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10'
                    }`}
                  />
                </div>
                {form.committed && !isNaN(Number(form.committed)) && (
                  <p className="text-[11px] text-[#6b6860] mt-1">{fmtFull(Number(form.committed))}</p>
                )}
                {errors.committed && <p className="text-[11px] text-red-500 mt-1">{errors.committed}</p>}
              </div>

              {/* Management Fee + Carry */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12.5px] font-medium mb-1.5">Management Fee (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      value={form.managementFee}
                      onChange={e => setForm(f => ({ ...f, managementFee: e.target.value }))}
                      className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] font-sans outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 transition-colors pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6860] text-[13px]">%</span>
                  </div>
                  <p className="text-[11px] text-[#9b9890] mt-1">Typically 2% per year</p>
                </div>
                <div>
                  <label className="block text-[12.5px] font-medium mb-1.5">Carried Interest (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="1"
                      value={form.carriedInterest}
                      onChange={e => setForm(f => ({ ...f, carriedInterest: e.target.value }))}
                      className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] font-sans outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 transition-colors pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b6860] text-[13px]">%</span>
                  </div>
                  <p className="text-[11px] text-[#9b9890] mt-1">Typically 20%</p>
                </div>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-[12.5px] font-medium mb-1.5">Investment Period Start</label>
                <input
                  type="month"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] font-sans outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 transition-colors"
                />
              </div>

              {/* Focus Sectors */}
              <div>
                <label className="block text-[12.5px] font-medium mb-2">
                  Focus Sectors
                  <span className="text-[11px] text-[#9b9890] font-normal ml-1.5">Select all that apply</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SECTORS.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSector(s)}
                      className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-all ${
                        form.focus.includes(s)
                          ? 'bg-[#2d5be3] text-white border-[#2d5be3]'
                          : 'bg-white text-[#6b6860] border-[#e8e6df] hover:border-[#2d5be3] hover:text-[#2d5be3]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {form.focus.length > 0 && (
                  <p className="text-[11px] text-[#6b6860] mt-1.5">
                    Selected: {form.focus.join(', ')}
                  </p>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#e8e6df] bg-[#f9f8f5] rounded-b-2xl">
              <p className="text-[11.5px] text-[#9b9890]">
                LPs and companies can be added after creating the fund
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowModal(false); setForm(empty); setErrors({}); }}
                  className="px-4 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f0f0ed] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  className="px-4 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors"
                >
                  Create Fund
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
