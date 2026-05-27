'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import {
  getCompanyById, updateCompany, getTransactionsByCompany,
  getValuationsByCompany, upsertValuation, updateTransaction, deleteTransaction, createTransaction, getCompanyUpdates,
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

function CompanyDetailInner({ params }: { params: Promise<{ id: string; companyId: string }> }) {
  const { id: fundId, companyId } = React.use(params);
  const searchParams = useSearchParams();
  const fromTab = searchParams.get('from') || 'portfolio'; // 'portfolio' or 'invested'

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
    legalName: '', ceoName: '', ceoEmail: '', ceoPhone: '',
    headline: '', about: '',
  });

  // New valuation form
  const [showAddTxnForm, setShowAddTxnForm] = useState(false);
  const [newTxnForm, setNewTxnForm] = useState({ date: new Date().toISOString().split('T')[0], type: 'Investment', amount: '', instrument: 'SAFE', description: '', round: '' });
  const [savingNewTxn, setSavingNewTxn] = useState(false);
  const [editingTxn, setEditingTxn] = useState<DbTransaction | null>(null);
  const [savingTxnEdit, setSavingTxnEdit] = useState(false);
  const [editingVal, setEditingVal] = useState<DbValuation | null>(null);
  const [savingValEdit, setSavingValEdit] = useState(false);
  const [showValForm, setShowValForm] = useState(false);
  const [valForm, setValForm] = useState({
    date: new Date().toISOString().split('T')[0],
    quarter: 'Q1 2026',
    investmentValue: '',   // your stake's current worth — drives MOIC
    companyValue: '',      // optional full enterprise value
    method: 'Recent Funding Round',
    round: '',
    notes: '',
  });
  const [savingVal, setSavingVal] = useState(false);

  // New update form
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [editingUpdate, setEditingUpdate] = useState<DbCompanyUpdate | null>(null);
  const [savingUpdateEdit, setSavingUpdateEdit] = useState(false);
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
          legalName: (co as any).legal_name ?? '',
          ceoName:  co.contact_name  ?? '',
          ceoEmail: co.contact_email ?? '',
          ceoPhone: co.contact_phone ?? '',
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
        ...(form.legalName ? { legal_name: form.legalName } : {}),
        contact_name:  form.ceoName  || undefined,
        contact_email: form.ceoEmail || undefined,
        contact_phone: form.ceoPhone || undefined,
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

  const handleAddNewTxn = async () => {
    if (!newTxnForm.amount || !newTxnForm.date) return;
    setSavingNewTxn(true);
    try {
      const parts: string[] = [];
      if (newTxnForm.description) parts.push(newTxnForm.description);
      if (newTxnForm.round) parts.push(newTxnForm.round);

      await createTransaction({
        fund_id:      fundId,
        company_id:   companyId,
        company_name: company!.name,
        date:         newTxnForm.date,
        type:         newTxnForm.type as any,
        amount:       Number(newTxnForm.amount),
        instrument:   newTxnForm.instrument as any,
        description:  parts.join(' · ') || undefined,
      });
      const t = await getTransactionsByCompany(companyId);
      setTxns(t);
      setNewTxnForm({ date: new Date().toISOString().split('T')[0], type: 'Investment', amount: '', instrument: 'SAFE', description: '', round: '' });
      setShowAddTxnForm(false);
    } catch (err: any) {
      alert('Failed to add transaction: ' + err.message);
    } finally {
      setSavingNewTxn(false);
    }
  };

  const handleDeleteTxn = async (txnId: string) => {
    if (!confirm('Delete this transaction? This cannot be undone.')) return;
    try {
      await deleteTransaction(txnId);
      setTxns(t => t.filter(x => x.id !== txnId));
    } catch (err: any) {
      alert('Failed to delete transaction: ' + err.message);
    }
  };

  const handleSaveTxnEdit = async () => {
    if (!editingTxn) return;
    setSavingTxnEdit(true);
    try {
      const updated = await updateTransaction(editingTxn.id, {
        date:        editingTxn.date,
        type:        editingTxn.type,
        amount:      editingTxn.amount,
        instrument:  editingTxn.instrument,
        description: editingTxn.description || undefined,
      });
      setTxns(t => t.map(x => x.id === updated.id ? updated : x));
      setEditingTxn(null);
    } catch (err: any) {
      alert('Failed to update transaction: ' + err.message);
    } finally {
      setSavingTxnEdit(false);
    }
  };

  const handleDeleteVal = async (valId: string) => {
    if (!confirm('Delete this valuation entry?')) return;
    try {
      const { supabase } = await import('@/lib/supabase');
      await supabase.from('valuations').delete().eq('id', valId);
      setVals(v => v.filter(x => x.id !== valId));
    } catch (err: any) {
      alert('Failed to delete valuation: ' + err.message);
    }
  };

  const handleSaveValEdit = async () => {
    if (!editingVal) return;
    setSavingValEdit(true);
    try {
      await upsertValuation({
        company_id:  companyId,
        fund_id:     fundId,
        quarter:     editingVal.quarter,
        quarter_end: QUARTER_END[editingVal.quarter] ?? editingVal.quarter_end,
        value:       editingVal.value,
        moic:        editingVal.moic,
        irr:         editingVal.irr,   // preserved from original calculation
        round:       editingVal.round || undefined,
        notes:       editingVal.notes || undefined,
      });
      // Find the latest valuation after upsert and sync companies.unrealised
      const allVals = await getValuationsByCompany(companyId);
      const latest  = allVals[0]; // sorted newest-first
      if (latest) {
        await updateCompany(companyId, {
          unrealised: latest.value,
          moic:       latest.moic,
          irr:        latest.irr,
        });
      }
      const co = await getCompanyById(companyId);
      if (co) setCompany(co);
      setVals(allVals);
      setEditingVal(null);
    } catch (err: any) {
      alert('Failed to update valuation: ' + err.message);
    } finally {
      setSavingValEdit(false);
    }
  };

  const handleAddValuation = async () => {
    if (!valForm.investmentValue) return;
    setSavingVal(true);
    try {
      const newValuation = Number(valForm.investmentValue);
      // Compute IRR using CAGR: (currentValue / invested) ^ (1/years) - 1
      // Uses earliest investment date and valuation date
      const investDate = investmentTxns[0]?.date ? new Date(investmentTxns[0].date) : null;
      const valDate    = valForm.date ? new Date(valForm.date) : new Date();
      const years      = investDate
        ? (valDate.getTime() - investDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
        : 0;
      const newIrr = (years > 0.01 && newValuation > 0 && totalInvested > 0)
        ? ((newValuation / totalInvested) ** (1 / years) - 1) * 100
        : 0;

      // Derive quarter from date
      const d = new Date(valForm.date);
      const m = d.getMonth();
      const y = d.getFullYear();
      const qNum = m < 3 ? 1 : m < 6 ? 2 : m < 9 ? 3 : 4;
      const derivedQuarter = `Q${qNum} ${y}`;
      const derivedQuarterEnd = QUARTER_END[derivedQuarter] ?? valForm.date;

      // Auto-calculate MOIC from entry valuation cap
      const entryVal = investmentTxns[0]?.valuation_cap ?? null;
      const newMoic  = entryVal && entryVal > 0 ? newValuation / entryVal : 0;
      const coValue  = valForm.companyValue ? Number(valForm.companyValue) : newValuation;

      await upsertValuation({
        company_id:  companyId,
        fund_id:     fundId,
        quarter:     derivedQuarter,
        quarter_end: derivedQuarterEnd,
        value:       newValuation,   // investment value (your stake)
        moic:        newMoic,
        irr:         newIrr,
        round:       valForm.round || undefined,
        notes:       valForm.notes ? `[${valForm.method}] ${valForm.notes}` : `[${valForm.method}]`,
      });
      // Keep companies.unrealised in sync so portfolio/fund overview stays accurate
      await updateCompany(companyId, {
        unrealised: newValuation,
        moic:       newMoic,
        irr:        newIrr,
      });
      const [v, co] = await Promise.all([
        getValuationsByCompany(companyId),
        getCompanyById(companyId),
      ]);
      setVals(v);
      if (co) setCompany(co);
      setValForm({ date: new Date().toISOString().split('T')[0], quarter: 'Q1 2026', investmentValue: '', companyValue: '', method: 'Recent Funding Round', round: '', notes: '' });
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

  const handleSaveUpdateEdit = async () => {
    if (!editingUpdate) return;
    setSavingUpdateEdit(true);
    try {
      const { supabase } = await import('@/lib/supabase');
      await supabase.from('company_updates').update({
        title: editingUpdate.title,
        body:  editingUpdate.body,
        date:  editingUpdate.date,
      }).eq('id', editingUpdate.id);
      const u = await getCompanyUpdates(companyId);
      setUpdates(u);
      setEditingUpdate(null);
    } catch (err: any) {
      alert('Failed to update: ' + err.message);
    } finally {
      setSavingUpdateEdit(false);
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

  // Latest quarterly valuation — valuations are sorted newest-first from DB
  const latestVal = valuations[0] ?? null;

  // Current value: use latest valuation entry if exists, else fall back to company.unrealised
  const currentValue = latestVal ? latestVal.value : (company.unrealised || 0);

  // Entry valuation: use the earliest investment transaction's valuation_cap
  // This is the valuation at which the GP first invested
  const investmentTxns = txns
    .filter(t => t.type === 'Investment')
    .sort((a, b) => a.date.localeCompare(b.date));
  const entryValuation = investmentTxns[0]?.valuation_cap ?? null;

  // MOIC = Current Value / Entry Valuation (correct VC definition)
  // Falls back to stored company.moic only if we can't compute it live
  const computedMoic = (entryValuation && entryValuation > 0 && currentValue > 0)
    ? currentValue / entryValuation
    : null;
  const displayMoic = computedMoic ?? (company.moic > 0 ? company.moic : null);

  // DPI = total distributions / total invested
  const totalDistributions = txns.filter(t => t.type === 'Distribution').reduce((s,t) => s + t.amount, 0);
  const dpi = totalInvested > 0 && totalDistributions > 0 ? totalDistributions / totalInvested : null;

  const tabs: { key: Tab; label: string }[] = fromTab === 'invested'
    ? [
        { key: 'overview',     label: 'Overview' },
        { key: 'transactions', label: 'Transactions' },
      ]
    : [
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
            <Link href={`/funds/${fundId}?tab=${fromTab}`} className="hover:text-[#2d5be3]">
              ← {fromTab === 'invested' ? 'Invested Capital' : 'Portfolio'}
            </Link>
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
        {fromTab === 'invested' && (
          <button onClick={() => setEditing(!editing)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
            {editing ? '✕ Cancel' : '✏️ Edit Company'}
          </button>
        )}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Invested Capital', value: fmtFull(totalInvested),                                                          cls: '' },
          { label: 'Current Value',    value: currentValue > 0 ? fmtFull(currentValue) : '—',                                  cls: '' },
          { label: 'MOIC',             value: displayMoic != null ? `${displayMoic.toFixed(2)}x` : '—',                        cls: displayMoic != null ? moicColor(displayMoic) : 'text-[#9b9890]' },
          { label: 'IRR',              value: company.irr !== 0 ? `${company.irr.toFixed(1)}%` : '—',                          cls: irrColor(company.irr) },
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

      {/* ── Edit Transaction Modal ── */}
      {editingTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditingTxn(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6">
            <h3 className="text-[16px] font-semibold mb-4">Edit Transaction</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-[12px] font-medium mb-1">Date</label>
                <input type="date" value={editingTxn.date}
                  onChange={e => setEditingTxn(t => t ? {...t, date: e.target.value} : null)}
                  className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]" />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">Type</label>
                <select value={editingTxn.type}
                  onChange={e => setEditingTxn(t => t ? {...t, type: e.target.value as any} : null)}
                  className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]">
                  <option>Investment</option><option>Distribution</option><option>Exit</option><option>Fee</option><option>Other</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">Amount (USD)</label>
                <input type="number" value={editingTxn.amount}
                  onChange={e => setEditingTxn(t => t ? {...t, amount: Number(e.target.value)} : null)}
                  className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]" />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">Instrument</label>
                <select value={editingTxn.instrument}
                  onChange={e => setEditingTxn(t => t ? {...t, instrument: e.target.value as any} : null)}
                  className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]">
                  <option>SAFE</option><option>Convertible Note</option><option>Preferred Stock</option><option>Common Stock</option><option>Equity</option><option>Other</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[12px] font-medium mb-1">Description</label>
                <input value={editingTxn.description || ''}
                  onChange={e => setEditingTxn(t => t ? {...t, description: e.target.value} : null)}
                  className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingTxn(null)}
                className="px-4 py-2 rounded-[7px] text-[13px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">Cancel</button>
              <button onClick={handleSaveTxnEdit} disabled={savingTxnEdit}
                className="px-4 py-2 rounded-[7px] text-[13px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors disabled:opacity-60">
                {savingTxnEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
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
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Legal Name</label>
                <input value={form.legalName} onChange={set('legalName')} placeholder="e.g. Acme Technologies Inc." className={inputCls} />
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
                { label: 'Legal Name',      value: (company as any).legal_name || '—' },
                { label: 'Status',          value: company.status },
                { label: 'Sector',          value: company.sector || '—' },
                { label: 'Stage',           value: company.stage  || '—' },
                { label: 'Website',         value: company.website ? <a href={company.website} target="_blank" rel="noopener" className="text-[#2d5be3] hover:underline">{company.website}</a> : '—' },
                { label: 'Investment Date', value: company.investment_date || '—' },
                { label: 'Security Type',   value: company.security_type || '—' },
                { label: 'Round',           value: company.round || '—' },
                { label: 'Valuation',       value: company.valuation ? `${fmtFull(company.valuation)} (${company.valuation_type || 'Post-money'})` : '—' },
                { label: 'Investment Terms', value: (() => {
                  const desc = txns.find(t => t.type === 'Investment')?.description || '';
                  if (!desc) return '—';
                  // Strip headline (anything before ' | SAFE' or ' | Post-money' or ' | Pre-money')
                  const termsPart = desc.split(' | ').filter(p =>
                    p.startsWith('SAFE') ||
                    p.includes('valuation') ||
                    p.includes('discount') ||
                    p.includes('Series') ||
                    p.includes('Growth Stage')
                  ).join(' · ');
                  return termsPart || desc;
                })() },
                { label: 'CEO Name',        value: company.contact_name  || '—' },
                { label: 'CEO Email',       value: company.contact_email || '—' },
                { label: 'CEO Phone',       value: company.contact_phone || '—' },
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
            <div>
              <div className="text-[13.5px] font-semibold">Transactions <span className="text-[#9b9890] font-normal text-[12px]">({txns.length})</span></div>
              {fromTab === 'portfolio' && (
                <div className="text-[11.5px] text-[#9b9890] mt-0.5">Read-only — add new transactions from the Invested Capital tab</div>
              )}
            </div>
            {fromTab === 'invested' && (
              <button onClick={() => setShowAddTxnForm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">
                + Add Transaction
              </button>
            )}
          </div>

          {/* Inline Add Transaction form — only in invested mode */}
          {fromTab === 'invested' && showAddTxnForm && (
            <div className="px-5 py-4 border-b border-[#e8e6df] bg-[#f9f8f5]">
              <div className="text-[13px] font-semibold mb-1">New Transaction for {company?.name}</div>
              <p className="text-[11.5px] text-[#9b9890] mb-3">Company is pre-selected. Fill in the transaction details below.</p>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="block text-[11.5px] font-medium mb-1">Date *</label>
                  <input type="date" value={newTxnForm.date}
                    onChange={e => setNewTxnForm(f => ({...f, date: e.target.value}))}
                    className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]" />
                </div>
                <div>
                  <label className="block text-[11.5px] font-medium mb-1">Type *</label>
                  <select value={newTxnForm.type}
                    onChange={e => setNewTxnForm(f => ({...f, type: e.target.value}))}
                    className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]">
                    <option>Investment</option>
                    <option>Distribution</option>
                    <option>Exit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11.5px] font-medium mb-1">Amount (USD) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[12px]">$</span>
                    <input type="number" value={newTxnForm.amount}
                      onChange={e => setNewTxnForm(f => ({...f, amount: e.target.value}))}
                      placeholder="0"
                      className="w-full pl-6 pr-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11.5px] font-medium mb-1">Instrument</label>
                  <select value={newTxnForm.instrument}
                    onChange={e => setNewTxnForm(f => ({...f, instrument: e.target.value}))}
                    className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]">
                    <option>SAFE</option>
                    <option>Convertible Note</option>
                    <option>Preferred Stock</option>
                    <option>Common Stock</option>
                    <option>Equity</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11.5px] font-medium mb-1">Round</label>
                  <select value={newTxnForm.round}
                    onChange={e => setNewTxnForm(f => ({...f, round: e.target.value}))}
                    className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]">
                    <option value="">Select…</option>
                    {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11.5px] font-medium mb-1">Terms / Notes</label>
                  <input value={newTxnForm.description}
                    onChange={e => setNewTxnForm(f => ({...f, description: e.target.value}))}
                    placeholder="e.g., with valuation cap, 20% discount"
                    className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleAddNewTxn} disabled={savingNewTxn || !newTxnForm.amount || !newTxnForm.date}
                  className="px-3 py-1.5 rounded-[7px] text-[12px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors disabled:opacity-60">
                  {savingNewTxn ? 'Saving...' : 'Save Transaction'}
                </button>
                <button onClick={() => setShowAddTxnForm(false)}
                  className="px-3 py-1.5 rounded-[7px] text-[12px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          <table className="w-full border-collapse">
            <thead><tr>
              {['Date','Type','Instrument','Amount','Description', ...(fromTab === 'invested' ? ['Actions'] : [])].map(h => (
                <th key={h} className="text-[11px] font-medium text-[#6b6860] text-left px-4 py-2.5 border-b border-[#e8e6df] bg-[#f9f8f5]">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {txns.length === 0 ? (
                <tr><td colSpan={fromTab === 'invested' ? 6 : 5} className="px-4 py-8 text-center text-[12.5px] text-[#9b9890]">
                  {fromTab === 'invested' ? 'No transactions yet. Click "+ Add Transaction" to record one.' : 'No transactions recorded.'}
                </td></tr>
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
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860] max-w-[240px] whitespace-normal leading-relaxed">{t.description || '—'}</td>
                  {fromTab === 'invested' && (
                    <td className="px-4 py-2.5 border-b border-[#e8e6df] whitespace-nowrap">
                      <div className="flex gap-2">
                        <button onClick={() => setEditingTxn({...t})} className="text-[11.5px] text-[#2d5be3] hover:underline">Edit</button>
                        <button onClick={() => handleDeleteTxn(t.id)} className="text-[11.5px] text-red-500 hover:text-red-700">Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {txns.length > 0 && (
            <div className="px-5 py-3 border-t border-[#e8e6df] bg-[#f9f8f5] flex gap-8 text-[12px]">
              <div><span className="text-[#6b6860]">Total Invested: </span><span className="font-mono font-semibold text-red-600">-{fmtFull(txns.filter(t=>t.type==='Investment').reduce((s,t)=>s+t.amount,0))}</span></div>
              <div><span className="text-[#6b6860]">Total Distributions: </span><span className="font-mono font-semibold text-green-600">+{fmtFull(txns.filter(t=>t.type==='Distribution').reduce((s,t)=>s+t.amount,0))}</span></div>
            </div>
          )}
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
            <button onClick={() => {
              // Pre-populate with latest known investment value
              const lastVal = valuations[0]?.value ?? currentValue ?? 0;
              setValForm(f => ({...f, investmentValue: lastVal > 0 ? String(lastVal) : ''}));
              setShowValForm(true);
            }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">
              + Add Valuation
            </button>
          </div>

          {showValForm && (
            <div className="border-b border-[#e8e6df]">
              <div className="flex">
                {/* ── Left: form ── */}
                <div className="flex-1 px-5 py-5">
                  <div className="text-[13.5px] font-semibold mb-4">New Valuation</div>

                  {/* Row 1 — Date + Method */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-[11.5px] font-medium mb-1">Valuation Date *</label>
                      <input type="date" value={valForm.date}
                        onChange={e => setValForm(f => ({...f, date: e.target.value}))}
                        className={inputCls} />
                      {valForm.date && (() => {
                        const d = new Date(valForm.date);
                        const q = `Q${d.getMonth()<3?1:d.getMonth()<6?2:d.getMonth()<9?3:4} ${d.getFullYear()}`;
                        const qEnd = {'Q1':'-03-31','Q2':'-06-30','Q3':'-09-30','Q4':'-12-31'}[`Q${d.getMonth()<3?1:d.getMonth()<6?2:d.getMonth()<9?3:4}`];
                        return <p className="text-[11px] text-[#9b9890] mt-1">📅 Impacts: {q} ({d.getFullYear()}{qEnd})</p>;
                      })()}
                    </div>
                    <div>
                      <label className="block text-[11.5px] font-medium mb-1">Valuation Method</label>
                      <select value={valForm.method} onChange={e => setValForm(f => ({...f, method: e.target.value}))} className={inputCls}>
                        {['Recent Funding Round','Manual Valuation','Metrics Based','Share Price','Discounted Cash Flow','Comparable Multiples'].map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Row 2 — Investment Value + Total Company Value */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-[11.5px] font-medium mb-1">Investment Value *</label>
                      <div className="relative mb-2">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[12px]">$</span>
                        <input type="number" value={valForm.investmentValue}
                          onChange={e => setValForm(f => ({...f, investmentValue: e.target.value}))}
                          placeholder="0" className={inputCls + ' pl-6'} />
                      </div>
                      {/* ±% quick adjust — only active when value > 0 */}
                      <div className="flex gap-1.5 flex-wrap">
                        {[-10,-5,5,10].map(pct => (
                          <button key={pct} type="button"
                            onClick={() => setValForm(f => {
                              const cur = Number(f.investmentValue) || 0;
                              if (!cur) return f;
                              return {...f, investmentValue: String(Math.round(cur * (1 + pct/100)))};
                            })}
                            className={`px-2.5 py-1 rounded-[6px] text-[11px] font-medium border transition-colors ${
                              Number(valForm.investmentValue) > 0
                                ? 'border-[#e8e6df] bg-white hover:bg-[#f0f4ff] hover:border-[#2d5be3] hover:text-[#2d5be3] cursor-pointer'
                                : 'border-[#e8e6df] bg-[#f9f8f5] text-[#c0bfbb] cursor-not-allowed'
                            }`}>
                            {pct > 0 ? '+' : ''}{pct}%
                          </button>
                        ))}
                        <button type="button"
                          onClick={() => {
                            const lastVal = valuations[0]?.value ?? currentValue ?? 0;
                            setValForm(f => ({...f, investmentValue: lastVal > 0 ? String(lastVal) : ''}));
                          }}
                          className="px-2.5 py-1 rounded-[6px] text-[11px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors text-[#9b9890]">
                          Reset
                        </button>
                      </div>
                      <p className="text-[11px] text-[#9b9890] mt-1.5">Your stake's current worth. Drives MOIC.</p>
                      {valForm.investmentValue && Number(valForm.investmentValue) > 0 && (() => {
                        const entryVal = investmentTxns[0]?.valuation_cap ?? null;
                        const moic = entryVal && entryVal > 0 ? (Number(valForm.investmentValue) / entryVal) : null;
                        return moic != null ? (
                          <p className="text-[11.5px] mt-1">
                            <span className={`font-semibold ${moic >= 1 ? 'text-green-600' : 'text-red-500'}`}>MOIC: {moic.toFixed(2)}x</span>
                          </p>
                        ) : null;
                      })()}
                    </div>
                    <div>
                      <label className="block text-[11.5px] font-medium mb-1">Total Company Value <span className="text-[#9b9890] font-normal">(optional)</span></label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[12px]">$</span>
                        <input type="number" value={valForm.companyValue}
                          onChange={e => setValForm(f => ({...f, companyValue: e.target.value}))}
                          placeholder="Full enterprise value"
                          className="w-full pl-6 pr-3 py-2.5 rounded-[7px] border border-dashed border-[#c8c6bf] bg-white text-[13px] font-sans outline-none focus:border-[#2d5be3] transition-colors" />
                      </div>
                      <p className="text-[11px] text-[#9b9890] mt-1.5">100% company value. For reporting only.</p>
                    </div>
                  </div>

                  {/* Row 3 — Round + IRR preview */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-[11.5px] font-medium mb-1">Round (optional)</label>
                      <select value={valForm.round} onChange={e => setValForm(f => ({...f, round: e.target.value}))} className={inputCls}>
                        <option value="">Select…</option>
                        {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11.5px] font-medium mb-1">IRR (auto-calculated)</label>
                      <div className="w-full px-3 py-2.5 rounded-[7px] border border-[#e8e6df] bg-[#f9f8f5] text-[13px] text-[#6b6860]">
                        {(() => {
                          const investDate = investmentTxns[0]?.date ? new Date(investmentTxns[0].date) : null;
                          const valDate    = valForm.date ? new Date(valForm.date) : new Date();
                          const years      = investDate
                            ? (valDate.getTime() - investDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
                            : 0;
                          const iv = Number(valForm.investmentValue);
                          if (!iv || !totalInvested || years < 0.01) return <span className="text-[#9b9890]">Enter value + date</span>;
                          const irr = ((iv / totalInvested) ** (1 / years) - 1) * 100;
                          return <span className={irr >= 0 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>{irr.toFixed(1)}%</span>;
                        })()}
                      </div>
                      <p className="text-[11px] text-[#9b9890] mt-1">CAGR from investment date</p>
                    </div>
                  </div>

                  {/* Row 4 — Notes */}
                  <div className="mb-4">
                    <label className="block text-[11.5px] font-medium mb-1">Notes & Methodology (optional)</label>
                    <textarea value={valForm.notes} rows={3}
                      onChange={e => setValForm(f => ({...f, notes: e.target.value}))}
                      placeholder="Document assumptions or methodology..."
                      className={inputCls + ' resize-y'} />
                    <p className="text-[11px] text-[#9b9890] mt-1">Optional notes for this valuation</p>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={handleAddValuation} disabled={savingVal || !valForm.investmentValue || !valForm.date}
                      className="px-5 py-2 rounded-[7px] text-[13px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors disabled:opacity-60">
                      {savingVal ? 'Saving...' : 'Create Valuation'}
                    </button>
                    <button onClick={() => setShowValForm(false)}
                      className="px-5 py-2 rounded-[7px] text-[13px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>

                {/* ── Right panel ── */}
                <div className="w-[260px] border-l border-[#e8e6df] flex flex-col flex-shrink-0">
                  {/* Company summary */}
                  <div className="px-4 py-4 border-b border-[#e8e6df]">
                    <div className="text-[12.5px] font-semibold text-[#1a1917] mb-3">{company.name}</div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[12px]">
                        <span className="text-[#9b9890]">Total Invested</span>
                        <span className="font-mono font-medium">{fmtFull(totalInvested)}</span>
                      </div>
                      <div className="flex justify-between text-[12px]">
                        <span className="text-[#9b9890]">Entry Val Cap</span>
                        <span className="font-mono font-medium">
                          {investmentTxns[0]?.valuation_cap ? fmtFull(investmentTxns[0].valuation_cap) : '—'}
                        </span>
                      </div>
                      {valForm.investmentValue && Number(valForm.investmentValue) > 0 && (
                        <div className="flex justify-between text-[12px] pt-1 border-t border-[#e8e6df]">
                          <span className="text-[#9b9890]">New Value</span>
                          <span className="font-mono font-semibold text-green-600">{fmtFull(Number(valForm.investmentValue))}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Previous valuations */}
                  {valuations.length > 0 && (
                    <div className="px-4 py-4 border-b border-[#e8e6df]">
                      <div className="text-[10.5px] font-semibold text-[#9b9890] uppercase tracking-wide mb-2.5">📊 Previous Valuations</div>
                      <div className="space-y-2">
                        {valuations.slice(0, 5).map(v => (
                          <div key={v.id} className="bg-[#f9f8f5] rounded-lg px-3 py-2">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[11px] font-medium text-[#1a1917]">{v.quarter}</span>
                              <span className={`text-[11px] font-semibold ${moicColor(v.moic)}`}>{v.moic > 0 ? `${v.moic.toFixed(2)}x` : '—'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[12px] font-semibold">{fmtFull(v.value)}</span>
                              <span className="text-[10px] text-[#9b9890]">{v.notes?.replace(/^\[.*?\]\s*/,'').slice(0,20) || v.round || 'manual'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Valuation tips */}
                  <div className="px-4 py-4 bg-amber-50 flex-1">
                    <div className="text-[11.5px] font-semibold text-amber-700 mb-2">💡 Valuation Tips</div>
                    <ul className="space-y-1.5 text-[11px] text-amber-800">
                      <li>• Consider recent funding rounds</li>
                      <li>• Review comparable company metrics</li>
                      <li>• Account for company progress since last valuation</li>
                      <li>• Document your methodology in notes</li>
                      <li>• Account for dilution when entering investment value</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          <table className="w-full border-collapse">
            <thead><tr>
              {['Quarter','Company Value','MOIC','IRR','Round','Notes','Actions'].map(h => (
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
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] whitespace-nowrap">
                    <div className="flex gap-2">
                      <button onClick={() => setEditingVal({...v})}
                        className="text-[11.5px] text-[#2d5be3] hover:underline">Edit</button>
                      <button onClick={() => handleDeleteVal(v.id)}
                        className="text-[11.5px] text-red-500 hover:text-red-700">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Edit Valuation Modal ── */}
      {editingVal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditingVal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6">
            <h3 className="text-[16px] font-semibold mb-4">Edit Valuation — {editingVal.quarter}</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-[12px] font-medium mb-1">Quarter</label>
                <select value={editingVal.quarter}
                  onChange={e => setEditingVal(v => v ? {...v, quarter: e.target.value} : null)}
                  className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]">
                  {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">Company Value (USD)</label>
                <input type="number" value={editingVal.value}
                  onChange={e => setEditingVal(v => v ? {...v, value: Number(e.target.value)} : null)}
                  className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]" />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">MOIC</label>
                <input type="number" step="0.01" value={editingVal.moic}
                  onChange={e => setEditingVal(v => v ? {...v, moic: Number(e.target.value)} : null)}
                  className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]" />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">IRR (auto-calculated)</label>
                <div className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] bg-[#f9f8f5] text-[13px] text-[#6b6860]">
                  {editingVal.moic > 0 ? (
                    <span className={editingVal.irr >= 0 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                      {editingVal.irr.toFixed(1)}%
                    </span>
                  ) : <span className="text-[#9b9890]">—</span>}
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">Round</label>
                <select value={editingVal.round || ''}
                  onChange={e => setEditingVal(v => v ? {...v, round: e.target.value} : null)}
                  className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]">
                  <option value="">Select…</option>
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">Notes</label>
                <input value={editingVal.notes || ''}
                  onChange={e => setEditingVal(v => v ? {...v, notes: e.target.value} : null)}
                  className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingVal(null)}
                className="px-4 py-2 rounded-[7px] text-[13px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">Cancel</button>
              <button onClick={handleSaveValEdit} disabled={savingValEdit}
                className="px-4 py-2 rounded-[7px] text-[13px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors disabled:opacity-60">
                {savingValEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
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
                  {editingUpdate?.id === u.id ? (
                    // ── Inline edit form ──
                    <div>
                      <div className="grid grid-cols-4 gap-3 mb-3">
                        <div className="col-span-3">
                          <label className="block text-[11.5px] font-medium mb-1">Title</label>
                          <input value={editingUpdate.title}
                            onChange={e => setEditingUpdate(x => x ? {...x, title: e.target.value} : null)}
                            className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]" />
                        </div>
                        <div>
                          <label className="block text-[11.5px] font-medium mb-1">Date</label>
                          <input type="date" value={editingUpdate.date}
                            onChange={e => setEditingUpdate(x => x ? {...x, date: e.target.value} : null)}
                            className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]" />
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className="block text-[11.5px] font-medium mb-1">Notes</label>
                        <textarea value={editingUpdate.body || ''}
                          onChange={e => setEditingUpdate(x => x ? {...x, body: e.target.value} : null)}
                          rows={3}
                          className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] resize-y" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleSaveUpdateEdit} disabled={savingUpdateEdit}
                          className="px-3 py-1.5 rounded-[7px] text-[12px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors disabled:opacity-60">
                          {savingUpdateEdit ? 'Saving...' : 'Save'}
                        </button>
                        <button onClick={() => setEditingUpdate(null)}
                          className="px-3 py-1.5 rounded-[7px] text-[12px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // ── Read view ──
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-[13.5px]">{u.title}</span>
                          <span className="text-[11px] text-[#9b9890]">{u.date}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#f9f8f5] border border-[#e8e6df] text-[#6b6860]">GP Only</span>
                        </div>
                        {u.body && <p className="text-[12.5px] text-[#6b6860] leading-relaxed">{u.body}</p>}
                      </div>
                      <div className="flex gap-2 ml-4 flex-shrink-0">
                        <button onClick={() => setEditingUpdate({...u})}
                          className="text-[11.5px] text-[#2d5be3] hover:underline">Edit</button>
                        <button onClick={() => handleDeleteUpdate(u.id)}
                          className="text-[11.5px] text-red-500 hover:text-red-700">Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string; companyId: string }> }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-[#6b6860]">Loading...</div>}>
      <CompanyDetailInner params={params} />
    </Suspense>
  );
}
