'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getCompanyById, updateCompany, getTransactionsByCompany,
  getValuationsByCompany, upsertValuation, getCompanyUpdates,
  createCompanyUpdate, deleteCompanyUpdate,
  DbCompany, DbTransaction, DbValuation, DbCompanyUpdate,
} from '@/lib/db';

const fmt     = (n: number) => n >= 1_000_000 ? `$${(n/1_000_000).toFixed(1)}m` : n >= 1_000 ? `$${(n/1_000).toFixed(0)}k` : `$${n.toLocaleString()}`;
const fmtFull = (n: number | null | undefined) => n == null ? '$0' : `$${n.toLocaleString()}`;
const moicColor = (m: number) => m >= 3 ? 'text-green-600' : m >= 1.2 ? 'text-amber-600' : m > 0 && m < 1 ? 'text-red-600' : 'text-[#9b9890]';
const irrColor  = (i: number) => i > 0 ? 'text-green-600' : i < 0 ? 'text-red-600' : 'text-[#9b9890]';

const SECTORS = ['AI / ML','Healthcare Tech','Fintech','B2B SaaS','SpaceTech','CleanTech','EdTech','Consumer Tech','DeepTech','Cybersecurity','Logistics','PropTech','AgTech','Robotics','Blockchain','GovTech','InsurTech','HRTech','Other'];
const STAGES  = ['Series Pre-seed','Series Seed','Series A','Series B','Series C','Series D','Series E','Growth Stage','Other'];
const QUARTERS = ['Q1 2024','Q2 2024','Q3 2024','Q4 2024','Q1 2025','Q2 2025','Q3 2025','Q4 2025','Q1 2026','Q2 2026','Q3 2026','Q4 2026'];
const QUARTER_END: Record<string,string> = {
  'Q1 2024':'2024-03-31','Q2 2024':'2024-06-30','Q3 2024':'2024-09-30','Q4 2024':'2024-12-31',
  'Q1 2025':'2025-03-31','Q2 2025':'2025-06-30','Q3 2025':'2025-09-30','Q4 2025':'2025-12-31',
  'Q1 2026':'2026-03-31','Q2 2026':'2026-06-30','Q3 2026':'2026-09-30','Q4 2026':'2026-12-31',
};

type Tab = 'overview' | 'transactions' | 'valuations' | 'updates';

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string; companyId: string }> }) {
  const { id: fundId, companyId } = React.use(params);

  const [tab, setTab]           = useState<Tab>('overview');
  const [company, setCompany]   = useState<DbCompany | null>(null);
  const [txns, setTxns]         = useState<DbTransaction[]>([]);
  const [valuations, setVals]   = useState<DbValuation[]>([]);
  const [updates, setUpdates]   = useState<DbCompanyUpdate[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Edit form
  const [form, setForm] = useState({
    name: '', sector: '', stage: '', website: '', status: 'Active',
    ceoName: '', ceoEmail: '', ceoPhone: '',
    headline: '', about: '',
  });

  // New valuation form
  const [showValForm, setShowValForm] = useState(false);
  const [valForm, setValForm] = useState({ quarter: 'Q1 2026', value: '', moic: '', irr: '', round: '', notes: '' });
  const [savingVal, setSavingVal] = useState(false);

  // New update form
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [updateForm, setUpdateForm] = useState({ title: '', body: '', date: new Date().toISOString().split('T')[0] });
  const [savingUpdate, setSavingUpdate] = useState(false);

  useEffect(() => { load(); }, [companyId]);

  async function load() {
    try {
      const [co, t, v, u] = await Promise.all([
        getCompanyById(companyId),
        getTransactionsByCompany(companyId),
        getValuationsByCompany(companyId),
        getCompanyUpdates(companyId),
      ]);
      if (co) {
        setCompany(co);
        setForm({
          name:     co.name,
          sector:   co.sector    ?? '',
          stage:    co.stage     ?? '',
          website:  co.website   ?? '',
          status:   co.status,
          ceoName:  co.contact_name  ?? '',
          ceoEmail: co.contact_email ?? '',
          ceoPhone: (co as any).contact_phone ?? '',
          headline: co.headline  ?? '',
          about:    co.about     ?? '',
        });
      }
      setTxns(t);
      setVals(v);
      setUpdates(u);
    } finally {
      setLoading(false);
    }
  }

  const set = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateCompany(companyId, {
        name:          form.name.trim(),
        sector:        form.sector   || undefined,
        stage:         form.stage    || undefined,
        website:       form.website  || undefined,
        status:        form.status   as any,
        contact_name:  form.ceoName  || undefined,
        contact_email: form.ceoEmail || undefined,
        headline:      form.headline || undefined,
        about:         form.about    || undefined,
      });
      setCompany(updated);
      setEditing(false);
    } catch (err: any) {
      setSaveError(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleAddValuation = async () => {
    if (!valForm.value) return;
    setSavingVal(true);
    try {
      await upsertValuation({
        company_id:  companyId,
        fund_id:     fundId,
        quarter:     valForm.quarter,
        quarter_end: QUARTER_END[valForm.quarter] ?? valForm.quarter,
        value:       Number(valForm.value),
        moic:        valForm.moic ? Number(valForm.moic) : 0,
        irr:         valForm.irr  ? Number(valForm.irr)  : 0,
        round:       valForm.round || undefined,
        notes:       valForm.notes || undefined,
      });
      const v = await getValuationsByCompany(companyId);
      setVals(v);
      setValForm({ quarter: 'Q1 2026', value: '', moic: '', irr: '', round: '', notes: '' });
      setShowValForm(false);
    } catch (err: any) {
      alert('Failed to add valuation: ' + err.message);
    } finally {
      setSavingVal(false);
    }
  };

  const handleAddUpdate = async () => {
    if (!updateForm.title.trim()) return;
    setSavingUpdate(true);
    try {
      await createCompanyUpdate({
        company_id: companyId,
        date:       updateForm.date,
        title:      updateForm.title.trim(),
        body:       updateForm.body || undefined,
        is_public:  false,
        created_by: 'GP',
      });
      const u = await getCompanyUpdates(companyId);
      setUpdates(u);
      setUpdateForm({ title: '', body: '', date: new Date().toISOString().split('T')[0] });
      setShowUpdateForm(false);
    } catch (err: any) {
      alert('Failed to add update: ' + err.message);
    } finally {
      setSavingUpdate(false);
    }
  };

  const handleDeleteUpdate = async (updateId: string) => {
    if (!confirm('Delete this update?')) return;
    try {
      await deleteCompanyUpdate(updateId);
      setUpdates(u => u.filter(x => x.id !== updateId));
    } catch (err: any) {
      alert('Failed to delete: ' + err.message);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-[#6b6860]">
      <svg className="animate-spin w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      Loading company...
    </div>
  );

  if (!company) return (
    <div className="p-8 text-center">
      <p className="text-[#9b9890] mb-3">Company not found.</p>
      <Link href={`/funds/${fundId}`} className="text-[#2d5be3] hover:underline">← Back to Fund</Link>
    </div>
  );

  const inputCls = 'w-full px-3 py-2.5 rounded-[7px] border border-[#e8e6df] bg-white text-[13px] font-sans outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 transition-colors';
  const totalInvested = txns.filter(t => t.type === 'Investment').reduce((s,t) => s + t.amount, 0);
  const latestVal     = valuations[0];

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview',     label: 'Overview' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'valuations',   label: 'Valuations' },
    { key: 'updates',      label: 'Updates' },
  ];

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 text-[12.5px] text-[#6b6860] mb-2">
            <Link href={`/funds/${fundId}`} className="hover:text-[#2d5be3]">← Fund</Link>
            <span>/</span>
            <span>Portfolio</span>
            <span>/</span>
            <span className="text-[#1a1917] font-medium">{company.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#2d5be3] text-white font-bold flex items-center justify-center text-[14px]">
              {company.name.slice(0,2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-[20px] font-semibold tracking-tight">{company.name}</h1>
              <div className="flex items-center gap-2 text-[12px] text-[#6b6860] mt-0.5">
                {company.sector && <span>{company.sector}</span>}
                {company.sector && company.stage && <span>·</span>}
                {company.stage  && <span>{company.stage}</span>}
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ml-1 ${company.status === 'Active' ? 'bg-green-50 text-green-700' : company.status === 'Exited' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                  {company.status}
                </span>
              </div>
            </div>
          </div>
        </div>
        <button onClick={() => setEditing(!editing)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
          {editing ? '✕ Cancel' : '✏️ Edit Company'}
        </button>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Invested Capital', value: fmtFull(totalInvested), cls: '' },
          { label: 'Current Value',    value: latestVal ? fmtFull(latestVal.value) : fmtFull(company.unrealised), cls: '' },
          { label: 'MOIC',             value: company.moic > 0 ? `${company.moic.toFixed(2)}x` : '—', cls: moicColor(company.moic) },
          { label: 'IRR',              value: company.irr !== 0 ? `${company.irr.toFixed(1)}%` : '—', cls: irrColor(company.irr) },
        ].map(k => (
          <div key={k.label} className="bg-white border border-[#e8e6df] rounded-xl p-4">
            <label className="text-[11px] text-[#6b6860] block mb-1.5">{k.label}</label>
            <div className={`text-[18px] font-semibold font-mono ${k.cls}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#e8e6df] mb-5">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition-all ${tab === t.key ? 'border-[#2d5be3] text-[#2d5be3]' : 'border-transparent text-[#6b6860] hover:text-[#1a1917]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-[7px] px-4 py-3 text-[12.5px] text-red-700 mb-4">⚠️ {saveError}</div>
      )}

      {/* ══ OVERVIEW ══ */}
      {tab === 'overview' && (
        <div className="bg-white border border-[#e8e6df] rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[15px] font-semibold">Company Details</h2>
            {editing && (
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors disabled:opacity-60 flex items-center gap-1.5">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>

          {editing ? (
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Company Name *</label>
                <input value={form.name} onChange={set('name')} className={inputCls} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Status</label>
                <select value={form.status} onChange={set('status')} className={inputCls}>
                  <option value="Active">Active</option>
                  <option value="Exited">Exited</option>
                  <option value="Written Off">Written Off</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Sector</label>
                <select value={form.sector} onChange={set('sector')} className={inputCls}>
                  <option value="">Select…</option>
                  {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Stage</label>
                <select value={form.stage} onChange={set('stage')} className={inputCls}>
                  <option value="">Select…</option>
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Website</label>
                <input type="url" value={form.website} onChange={set('website')} placeholder="https://" className={inputCls} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">CEO Full Name</label>
                <input value={form.ceoName} onChange={set('ceoName')} className={inputCls} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">CEO Email</label>
                <input type="email" value={form.ceoEmail} onChange={set('ceoEmail')} className={inputCls} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">CEO Phone</label>
                <input type="tel" value={form.ceoPhone} onChange={set('ceoPhone')} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Headline</label>
                <input value={form.headline} onChange={set('headline')} placeholder="One-liner about this investment" className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Investment Thesis / About</label>
                <textarea value={form.about} onChange={set('about')} rows={4} className={inputCls + ' resize-y'} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-12 gap-y-4">
              {[
                { label: 'Company Name',    value: company.name },
                { label: 'Status',          value: company.status },
                { label: 'Sector',          value: company.sector || '—' },
                { label: 'Stage',           value: company.stage  || '—' },
                { label: 'Website',         value: company.website ? <a href={company.website} target="_blank" rel="noopener" className="text-[#2d5be3] hover:underline">{company.website}</a> : '—' },
                { label: 'Investment Date', value: company.investment_date || '—' },
                { label: 'Security Type',   value: company.security_type || '—' },
                { label: 'Round',           value: company.round || '—' },
                { label: 'Valuation',       value: company.valuation ? `${fmtFull(company.valuation)} (${company.valuation_type || 'Post-money'})` : '—' },
                { label: 'CEO Name',        value: company.contact_name  || '—' },
                { label: 'CEO Email',       value: company.contact_email || '—' },
                { label: 'CEO Phone',       value: (company as any).contact_phone || '—' },
                { label: 'Headline',        value: company.headline || '—' },
              ].map(row => (
                <div key={row.label} className="border-b border-[#f0f0ed] pb-3">
                  <div className="text-[11.5px] text-[#9b9890] mb-0.5">{row.label}</div>
                  <div className="text-[13px] font-medium">{row.value}</div>
                </div>
              ))}
              {company.about && (
                <div className="col-span-2 border-b border-[#f0f0ed] pb-3">
                  <div className="text-[11.5px] text-[#9b9890] mb-0.5">Investment Thesis</div>
                  <div className="text-[13px]">{company.about}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ TRANSACTIONS ══ */}
      {tab === 'transactions' && (
        <div className="bg-white border border-[#e8e6df] rounded-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6df]">
            <div className="text-[13.5px] font-semibold">Transactions <span className="text-[#9b9890] font-normal text-[12px]">({txns.length})</span></div>
            <Link href={`/funds/${fundId}/investments/new`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">
              + Add Transaction
            </Link>
          </div>
          <table className="w-full border-collapse">
            <thead><tr>
              {['Date','Type','Instrument','Amount','Description'].map(h => (
                <th key={h} className="text-[11px] font-medium text-[#6b6860] text-left px-4 py-2.5 border-b border-[#e8e6df] bg-[#f9f8f5]">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {txns.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-[12.5px] text-[#9b9890]">No transactions yet.</td></tr>
              ) : txns.map(t => (
                <tr key={t.id} className="hover:bg-[#f9f8f5] transition-colors">
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860]">{t.date}</td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${t.type === 'Investment' ? 'bg-red-50 text-red-600' : t.type === 'Distribution' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>{t.type}</span>
                  </td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860]">{t.instrument}</td>
                  <td className={`px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px] font-medium ${t.type === 'Investment' ? 'text-red-600' : 'text-green-600'}`}>
                    {t.type === 'Investment' ? '-' : '+'}{fmtFull(t.amount)}
                  </td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860] max-w-[300px] truncate">{t.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ══ VALUATIONS ══ */}
      {tab === 'valuations' && (
        <div className="bg-white border border-[#e8e6df] rounded-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6df]">
            <div>
              <div className="text-[13.5px] font-semibold">Quarterly Valuations</div>
              <div className="text-[11.5px] text-[#9b9890] mt-0.5">Update the company valuation as it raises new rounds</div>
            </div>
            <button onClick={() => setShowValForm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">
              + Add Valuation
            </button>
          </div>

          {showValForm && (
            <div className="px-5 py-4 border-b border-[#e8e6df] bg-[#f9f8f5]">
              <div className="text-[13px] font-semibold mb-3">New Valuation</div>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="block text-[11.5px] font-medium mb-1">Quarter *</label>
                  <select value={valForm.quarter} onChange={e => setValForm(f => ({...f, quarter: e.target.value}))} className={inputCls}>
                    {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11.5px] font-medium mb-1">Company Value (USD) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[12px]">$</span>
                    <input type="number" value={valForm.value} onChange={e => setValForm(f => ({...f, value: e.target.value}))}
                      placeholder="0" className={inputCls + ' pl-6'} />
                  </div>
                </div>
                <div>
                  <label className="block text-[11.5px] font-medium mb-1">Round (optional)</label>
                  <select value={valForm.round} onChange={e => setValForm(f => ({...f, round: e.target.value}))} className={inputCls}>
                    <option value="">Select…</option>
                    {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11.5px] font-medium mb-1">MOIC</label>
                  <input type="number" step="0.01" value={valForm.moic} onChange={e => setValForm(f => ({...f, moic: e.target.value}))}
                    placeholder="auto" className={inputCls} />
                </div>
                <div>
                  <label className="block text-[11.5px] font-medium mb-1">IRR (%)</label>
                  <input type="number" step="0.1" value={valForm.irr} onChange={e => setValForm(f => ({...f, irr: e.target.value}))}
                    placeholder="0" className={inputCls} />
                </div>
                <div>
                  <label className="block text-[11.5px] font-medium mb-1">Notes</label>
                  <input value={valForm.notes} onChange={e => setValForm(f => ({...f, notes: e.target.value}))}
                    placeholder="Optional notes" className={inputCls} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleAddValuation} disabled={savingVal}
                  className="px-3 py-1.5 rounded-[7px] text-[12px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors disabled:opacity-60">
                  {savingVal ? 'Saving...' : 'Save Valuation'}
                </button>
                <button onClick={() => setShowValForm(false)}
                  className="px-3 py-1.5 rounded-[7px] text-[12px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          <table className="w-full border-collapse">
            <thead><tr>
              {['Quarter','Company Value','MOIC','IRR','Round','Notes'].map(h => (
                <th key={h} className="text-[11px] font-medium text-[#6b6860] text-left px-4 py-2.5 border-b border-[#e8e6df] bg-[#f9f8f5]">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {valuations.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-[12.5px] text-[#9b9890]">
                  No valuations yet. Add a quarterly valuation to track company value over time.
                </td></tr>
              ) : valuations.map(v => (
                <tr key={v.id} className="hover:bg-[#f9f8f5] transition-colors">
                  <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                    <span className="px-1.5 py-0.5 rounded text-[11px] bg-[#f9f8f5] border border-[#e8e6df]">{v.quarter}</span>
                  </td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px] font-medium">{fmtFull(v.value)}</td>
                  <td className={`px-4 py-2.5 border-b border-[#e8e6df] text-[12.5px] ${moicColor(v.moic)}`}>{v.moic > 0 ? `${v.moic.toFixed(2)}x` : '—'}</td>
                  <td className={`px-4 py-2.5 border-b border-[#e8e6df] text-[12.5px] ${irrColor(v.irr)}`}>{v.irr !== 0 ? `${v.irr.toFixed(1)}%` : '—'}</td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860]">{v.round || '—'}</td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860]">{v.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ══ UPDATES ══ */}
      {tab === 'updates' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[13.5px] font-semibold">Company Updates</div>
              <div className="text-[11.5px] text-[#9b9890] mt-0.5">Internal GP notes — not visible to LPs</div>
            </div>
            <button onClick={() => setShowUpdateForm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">
              + Add Update
            </button>
          </div>

          {showUpdateForm && (
            <div className="bg-white border border-[#e8e6df] rounded-xl p-5 mb-4">
              <div className="text-[13px] font-semibold mb-3">New Update</div>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div className="col-span-3">
                  <label className="block text-[11.5px] font-medium mb-1">Title *</label>
                  <input value={updateForm.title} onChange={e => setUpdateForm(f => ({...f, title: e.target.value}))}
                    placeholder="e.g., Series A closed, New product launch, Board update" className={inputCls} />
                </div>
                <div>
                  <label className="block text-[11.5px] font-medium mb-1">Date</label>
                  <input type="date" value={updateForm.date} onChange={e => setUpdateForm(f => ({...f, date: e.target.value}))} className={inputCls} />
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-[11.5px] font-medium mb-1">Notes (optional)</label>
                <textarea value={updateForm.body} onChange={e => setUpdateForm(f => ({...f, body: e.target.value}))}
                  rows={4} placeholder="Additional details, context, or next steps..." className={inputCls + ' resize-y'} />
              </div>
              <div className="flex gap-2">
                <button onClick={handleAddUpdate} disabled={savingUpdate}
                  className="px-3 py-1.5 rounded-[7px] text-[12px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors disabled:opacity-60">
                  {savingUpdate ? 'Saving...' : 'Save Update'}
                </button>
                <button onClick={() => setShowUpdateForm(false)}
                  className="px-3 py-1.5 rounded-[7px] text-[12px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {updates.length === 0 && !showUpdateForm ? (
            <div className="bg-white border border-[#e8e6df] rounded-xl p-10 text-center">
              <div className="text-2xl mb-2">📝</div>
              <div className="text-[13px] font-medium mb-1">No updates yet</div>
              <p className="text-[12px] text-[#9b9890]">Add internal notes about board meetings, milestones, or any company developments</p>
            </div>
          ) : (
            <div className="space-y-3">
              {updates.map(u => (
                <div key={u.id} className="bg-white border border-[#e8e6df] rounded-xl p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-[13.5px]">{u.title}</span>
                        <span className="text-[11px] text-[#9b9890]">{u.date}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#f9f8f5] border border-[#e8e6df] text-[#6b6860]">GP Only</span>
                      </div>
                      {u.body && <p className="text-[12.5px] text-[#6b6860] leading-relaxed">{u.body}</p>}
                    </div>
                    <button onClick={() => handleDeleteUpdate(u.id)}
                      className="text-[11px] text-red-500 hover:text-red-700 ml-4 flex-shrink-0">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
