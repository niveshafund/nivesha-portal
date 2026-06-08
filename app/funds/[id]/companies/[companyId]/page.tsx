'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { can } from '@/lib/rbac';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import {
  getCompanyById, updateCompany, deleteCompany, getTransactionsByCompany,
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

type Tab = 'overview' | 'transactions' | 'valuations' | 'updates' | 'dataroom';

type DocType = 'NDA' | 'Term Sheet' | 'SAFE' | 'Financial' | 'Pitch Deck' | 'Legal' | 'Other';
type CompanyDoc = { id: string; name: string; file_path: string; file_size: number; file_type: string; doc_type: DocType; notes: string; uploaded_by: string; created_at: string; };

function CompanyDetailInner({ params }: { params: Promise<{ id: string; companyId: string }> }) {
  const { id: fundId, companyId } = React.use(params);
  const searchParams = useSearchParams();
  const fromTab = searchParams.get('from') || 'portfolio'; // 'portfolio' or 'invested'
  const router = useRouter();

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
    name: '', legalName: '', sector: '', stage: '', website: '', status: 'Active',
    ceoName: '', ceoEmail: '', ceoPhone: '',
    headline: '', about: '',
    // Investment/round fields
    investmentDate: '', securityType: '', round: '', invested: '',
    valuation: '', valuationType: 'Post-money',
    discount: '', valuationCap: '',
  });

  // New valuation form
  const [showAddTxnForm, setShowAddTxnForm] = useState(false);
  const [newTxnForm, setNewTxnForm] = useState({ date: new Date().toISOString().split('T')[0], type: 'Investment', amount: '', instrument: 'SAFE', safeType: 'with valuation cap and discount', discount: '', valuationCap: '', valuationType: 'Post-money', sharePrice: '', numShares: '', description: '', round: '' });
  const [savingNewTxn, setSavingNewTxn] = useState(false);
  const [editingTxn, setEditingTxn] = useState<DbTransaction | null>(null);
  const [savingTxnEdit, setSavingTxnEdit] = useState(false);
  const [editingVal, setEditingVal] = useState<DbValuation | null>(null);
  const [savingValEdit, setSavingValEdit] = useState(false);
  const [showValForm, setShowValForm] = useState(false);
  const [valForm, setValForm] = useState({
    date: new Date().toISOString().split('T')[0],
    method: 'Recent Funding Round',
    investmentValue: '',
    companyValue: '',
    round: '',
    notes: '',
    transaction_id: '',
  });
  const [savingVal, setSavingVal] = useState(false);

  // Data Room
  const [docs, setDocs]               = useState<CompanyDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docFilter, setDocFilter]     = useState<string>('All');
  const [docSearch, setDocSearch]     = useState('');
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadForm, setUploadForm]   = useState<{ doc_type: DocType; notes: string }>({ doc_type: 'Other', notes: '' });
  const [uploadFile, setUploadFile]   = useState<File | null>(null);
  const [dragOver, setDragOver]       = useState(false);
  const { role: rawRole } = useAuth();

  // ── Confirm modal ─────────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  function withConfirm(message: string, onConfirm: () => void) {
    setConfirmModal({ message, onConfirm });
  }
  const role = rawRole ?? undefined;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New update form
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [editingUpdate, setEditingUpdate] = useState<DbCompanyUpdate | null>(null);
  const [savingUpdateEdit, setSavingUpdateEdit] = useState(false);
  const [updateForm, setUpdateForm] = useState({ title: '', body: '', date: new Date().toISOString().split('T')[0] });
  const [savingUpdate, setSavingUpdate] = useState(false);

  useEffect(() => { load(); }, [companyId]);

  async function loadDocs() {
    setDocsLoading(true);
    try {
      const { data, error } = await supabase
        .from('company_documents')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (!error && data) setDocs(data as CompanyDoc[]);
    } finally {
      setDocsLoading(false);
    }
  }

  useEffect(() => {
    if (tab === 'dataroom') loadDocs();
  }, [tab]);

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
          name:          co.name,
          legalName:     (co as any).legal_name ?? '',
          sector:        co.sector    ?? '',
          stage:         co.stage     ?? '',
          website:       co.website   ?? '',
          status:        co.status,
          ceoName:       co.contact_name  ?? '',
          ceoEmail:      co.contact_email ?? '',
          ceoPhone:      (co as any).contact_phone ?? '',
          headline:      co.headline  ?? '',
          about:         co.about     ?? '',
          // Investment fields
          investmentDate: co.investment_date ?? '',
          securityType:   co.security_type   ?? '',
          round:          co.round           ?? '',
          invested:       co.invested        ? String(co.invested) : '',
          valuation:      co.valuation       ? String(co.valuation) : '',
          valuationType:  co.valuation_type  ?? 'Post-money',
          discount:       '',
          valuationCap:   '',
        });
      }

      setTxns(t);
      setVals(v);
      setUpdates(u);

      // Pull discount/cap from first investment transaction after txns are available
      const firstInvTxn = t.find((x: any) => x.type === 'Investment');
      if (firstInvTxn) {
        setForm(f => ({
          ...f,
          discount:       firstInvTxn.discount_pct  ? String(firstInvTxn.discount_pct)  : '',
          valuationCap:   firstInvTxn.valuation_cap ? String(firstInvTxn.valuation_cap) : '',
          // Use transaction date if company investment_date is not set
          investmentDate: f.investmentDate || firstInvTxn.date || '',
        }));
      }
    } finally {
      setLoading(false);
    }
  }

  const detectDocType = (filename: string): DocType => {
    const lower = filename.toLowerCase();
    if (lower.includes('nda') || lower.includes('non-disclosure')) return 'NDA';
    if (lower.includes('term') && lower.includes('sheet')) return 'Term Sheet';
    if (lower.includes('safe')) return 'SAFE';
    if (lower.includes('financial') || lower.includes('financials') || lower.includes('p&l') || lower.includes('balance')) return 'Financial';
    if (lower.includes('pitch') || lower.includes('deck')) return 'Pitch Deck';
    if (lower.includes('agreement') || lower.includes('contract') || lower.includes('legal')) return 'Legal';
    return 'Other';
  };

  const handleUploadDoc = async () => {
    if (!uploadFile) return;
    setUploadingDoc(true);
    try {
      const docName = uploadFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');
      const autoDocType = detectDocType(uploadFile.name);
      const ext = uploadFile.name.split('.').pop();
      const path = `${companyId}/${Date.now()}-${docName.replace(/\s+/g,'-')}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('company-documents')
        .upload(path, uploadFile, { upsert: false });
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase.from('company_documents').insert({
        company_id:  companyId,
        fund_id:     fundId,
        name:        docName,
        file_path:   path,
        file_size:   uploadFile.size,
        file_type:   uploadFile.type,
        doc_type:    autoDocType,
        notes:       uploadForm.notes || null,
        uploaded_by: 'GP',
      });
      if (dbErr) throw dbErr;

      setUploadForm({ doc_type: 'Other', notes: '' });
      setUploadFile(null);
      setShowUploadForm(false);
      await loadDocs();
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDoc = async (doc: CompanyDoc) => {
    withConfirm(`Delete "${doc.name}"?`, async () => {
      await supabase.storage.from('company-documents').remove([doc.file_path]);
      await supabase.from('company_documents').delete().eq('id', doc.id);
      await loadDocs();
    });
  };

  const handleViewDoc = async (doc: CompanyDoc) => {
    const { data } = await supabase.storage
      .from('company-documents')
      .createSignedUrl(doc.file_path, 3600);
    if (!data?.signedUrl) return;
    const isPdf = doc.file_path.toLowerCase().endsWith('.pdf') || doc.file_type === 'application/pdf';
    const url = isPdf
      ? data.signedUrl
      : `https://docs.google.com/viewer?url=${encodeURIComponent(data.signedUrl)}&embedded=false`;
    window.open(url, '_blank');
  };

  const handleDownloadDoc = async (doc: CompanyDoc) => {
    const filename = doc.name + '.' + doc.file_path.split('.').pop();
    const { data } = await supabase.storage
      .from('company-documents')
      .createSignedUrl(doc.file_path, 3600);
    if (!data?.signedUrl) return;
    // Fetch as blob so the browser downloads instead of navigating (fixes PDF cross-origin issue)
    const blob = await fetch(data.signedUrl).then(r => r.blob());
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  };

  const fmtFileSize = (bytes: number) => {
    if (bytes > 1_000_000) return `${(bytes/1_000_000).toFixed(1)} MB`;
    if (bytes > 1_000)     return `${(bytes/1_000).toFixed(0)} KB`;
    return `${bytes} B`;
  };

  const set = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const handleDeleteCompany = () => {
    withConfirm(
      `Delete ${company?.name ?? 'this company'}? This will also delete all its transactions and valuations. This cannot be undone.`,
      async () => {
        try {
          await deleteCompany(companyId);
          router.push(`/funds/${fundId}?tab=invested`);
        } catch (err: any) {
          alert('Failed to delete company: ' + err.message);
        }
      }
    );
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateCompany(companyId, {
        name:            form.name.trim(),
        sector:          form.sector   || undefined,
        stage:           form.stage    || undefined,
        website:         form.website  || undefined,
        status:          form.status   as any,
        contact_name:    form.ceoName  || undefined,
        contact_email:   form.ceoEmail || undefined,
        headline:        form.headline || undefined,
        about:           form.about    || undefined,
        ...(form.legalName      ? { legal_name:      form.legalName }               as any : {}),
        ...(form.investmentDate ? { investment_date:  form.investmentDate }          as any : {}),
        ...(form.securityType   ? { security_type:    form.securityType }            as any : {}),
        ...(form.round          ? { round:            form.round }                   as any : {}),
        ...(form.invested       ? { invested:         Number(form.invested) }        as any : {}),
        ...(form.valuation      ? { valuation:        Number(form.valuation),
                                    valuation_type:   form.valuationType }           as any : {}),
      });

      // Update discount/cap and date on the first investment transaction
      const firstInvTxn = txns.find(x => x.type === 'Investment');
      if (firstInvTxn) {
        await updateTransaction(firstInvTxn.id, {
          ...(form.discount      ? { discount_pct:  Number(form.discount) }     as any : {}),
          ...(form.valuationCap  ? { valuation_cap: Number(form.valuationCap) } as any : {}),
          ...(form.investmentDate? { date:           form.investmentDate }       as any : {}),
        });
      }
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
      // Build description from SAFE terms
      const parts: string[] = [];
      if (newTxnForm.instrument === 'SAFE' || newTxnForm.instrument === 'Convertible Note') {
        if (newTxnForm.safeType) parts.push(newTxnForm.safeType);
        if (newTxnForm.discount) parts.push(`${newTxnForm.discount}% discount`);
        if (newTxnForm.valuationCap) parts.push(`${newTxnForm.valuationType} valuation cap: $${Number(newTxnForm.valuationCap).toLocaleString()}`);
      } else if (['Preferred Stock','Common Stock','Equity'].includes(newTxnForm.instrument)) {
        if (newTxnForm.sharePrice) parts.push(`$${newTxnForm.sharePrice} per share`);
        if (newTxnForm.numShares) parts.push(`${Number(newTxnForm.numShares).toLocaleString()} shares`);
        if (newTxnForm.valuationCap) parts.push(`Post-money valuation: $${Number(newTxnForm.valuationCap).toLocaleString()}`);
      }
      if (newTxnForm.description) parts.push(newTxnForm.description);
      if (newTxnForm.round) parts.push(newTxnForm.round);

      await createTransaction({
        fund_id:       fundId,
        company_id:    companyId,
        company_name:  company!.name,
        date:          newTxnForm.date,
        type:          newTxnForm.type as any,
        amount:        Number(newTxnForm.amount),
        instrument:    newTxnForm.instrument as any,
        description:   parts.join(' · ') || undefined,
        discount_pct:  newTxnForm.discount ? Number(newTxnForm.discount) : undefined,
        valuation_cap: newTxnForm.valuationCap ? Number(newTxnForm.valuationCap) : undefined,
      });
      const t = await getTransactionsByCompany(companyId);
      setTxns(t);
      // Sync unrealised — only if no valuations exist (valuations take precedence)
      if (valuations.length === 0) {
        const newUnrealised = t.filter(x => x.type === 'Investment').reduce((s, x) => s + x.amount, 0);
        await updateCompany(companyId, { unrealised: newUnrealised });
      }
      setNewTxnForm({ date: new Date().toISOString().split('T')[0], type: 'Investment', amount: '', instrument: 'SAFE', safeType: 'with valuation cap and discount', discount: '', valuationCap: '', valuationType: 'Post-money', sharePrice: '', numShares: '', description: '', round: '' });
      setShowAddTxnForm(false);
    } catch (err: any) {
      alert('Failed to add transaction: ' + err.message);
    } finally {
      setSavingNewTxn(false);
    }
  };

  const handleDeleteTxn = async (txnId: string) => {
    withConfirm('Delete this transaction? This cannot be undone.', async () => {
      try {
        await deleteTransaction(txnId);
        const remaining = txns.filter(x => x.id !== txnId);
        setTxns(remaining);
        if (valuations.length === 0) {
          const newUnrealised = remaining.filter(x => x.type === 'Investment').reduce((s, x) => s + x.amount, 0);
          await updateCompany(companyId, { unrealised: newUnrealised });
        }
      } catch (err: any) {
        alert('Failed to delete transaction: ' + err.message);
      }
    });
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
      const updatedTxns = txns.map(x => x.id === updated.id ? updated : x);
      setTxns(updatedTxns);
      if (valuations.length === 0) {
        const newUnrealised = updatedTxns.filter(x => x.type === 'Investment').reduce((s, x) => s + x.amount, 0);
        await updateCompany(companyId, { unrealised: newUnrealised });
      }
      setEditingTxn(null);
    } catch (err: any) {
      alert('Failed to update transaction: ' + err.message);
    } finally {
      setSavingTxnEdit(false);
    }
  };

  const handleDeleteVal = async (valId: string) => {
    withConfirm('Delete this valuation entry?', async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        await supabase.from('valuations').delete().eq('id', valId);
        setVals(v => v.filter(x => x.id !== valId));
      } catch (err: any) {
        alert('Failed to delete valuation: ' + err.message);
      }
    });
  };

  const handleSaveValEdit = async () => {
    if (!editingVal) return;
    setSavingValEdit(true);
    try {
      const editCoVal = (editingVal as any).company_value ? Number((editingVal as any).company_value) : null;
      await upsertValuation({
        company_id:  companyId,
        fund_id:     fundId,
        quarter:     editingVal.quarter,
        quarter_end: QUARTER_END[editingVal.quarter] ?? editingVal.quarter_end,
        value:       editingVal.value,
        round:       editingVal.round || undefined,
        notes:       editingVal.notes || undefined,
        ...(editCoVal ? { company_value: editCoVal } as any : {}),
      });
      // Sync companies unrealised
      const allVals = await getValuationsByCompany(companyId);
      const totalUnrealised = allVals.reduce((s, v) => s + v.value, 0);
      await updateCompany(companyId, {
        unrealised: totalUnrealised,
        ...(editCoVal ? { valuation: editCoVal } : {}),
      });
      const [v, co] = await Promise.all([getValuationsByCompany(companyId), getCompanyById(companyId)]);
      setVals(v);
      if (co) setCompany(co);
      setEditingVal(null);
    } catch (err: any) {
      alert('Failed to update valuation: ' + err.message);
    } finally {
      setSavingValEdit(false);
    }
  };

  const handleAddValuation = async () => {
    if (!valForm.investmentValue || !valForm.date) return;
    setSavingVal(true);
    try {
      const newVal = Number(valForm.investmentValue);
      const companyVal = valForm.companyValue ? Number(valForm.companyValue) : null;

      // Derive quarter from date
      const d = new Date(valForm.date);
      const qNum = d.getMonth() < 3 ? 1 : d.getMonth() < 6 ? 2 : d.getMonth() < 9 ? 3 : 4;
      const derivedQuarter = `Q${qNum} ${d.getFullYear()}`;
      const derivedQuarterEnd = QUARTER_END[derivedQuarter] ?? valForm.date;

      // Find the selected transaction (or first investment if none selected)
      const selectedTxn = valForm.transaction_id
        ? investmentTxns.find(t => t.id === valForm.transaction_id)
        : investmentTxns[0];
      const txnAmount = selectedTxn?.amount ?? totalInvested;

      // Auto-calculate MOIC = investment value / this transaction amount
      const newMoic = txnAmount > 0 ? newVal / txnAmount : 0;

      // Auto-calculate IRR (CAGR) based on selected transaction date
      const investDate = selectedTxn?.date ? new Date(selectedTxn.date) : null;
      const valDate = new Date(valForm.date);
      const years = investDate ? (valDate.getTime() - investDate.getTime()) / (1000*60*60*24*365.25) : 0;
      const newIrr = years > 0.01 && newVal > 0 && txnAmount > 0
        ? ((newVal / txnAmount) ** (1/years) - 1) * 100 : 0;

      await upsertValuation({
        company_id:     companyId,
        fund_id:        fundId,
        transaction_id: valForm.transaction_id || undefined,
        quarter:        derivedQuarter,
        quarter_end:    derivedQuarterEnd,
        value:          newVal,
        moic:           newMoic,
        irr:            years >= 1 ? newIrr : undefined,
        round:          valForm.round || undefined,
        notes:          valForm.notes ? `[${valForm.method}] ${valForm.notes}` : `[${valForm.method}]`,
        ...(companyVal ? { company_value: companyVal } as any : {}),
      });

      // Sync companies.unrealised with combined valuation value
      const allVals = await getValuationsByCompany(companyId);
      const totalUnrealised = allVals.reduce((s, v) => s + v.value, 0);
      await updateCompany(companyId, {
        unrealised: totalUnrealised,
        ...(companyVal ? { valuation: companyVal } : {}),
      });

      const [v, co] = await Promise.all([getValuationsByCompany(companyId), getCompanyById(companyId)]);
      setVals(v);
      if (co) setCompany(co);
      setValForm({ date: new Date().toISOString().split('T')[0], method: 'Recent Funding Round', investmentValue: '', companyValue: '', round: '', notes: '', transaction_id: '' });
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
    withConfirm('Delete this update?', async () => {
      try {
        await deleteCompanyUpdate(updateId);
        setUpdates(u => u.filter(x => x.id !== updateId));
      } catch (err: any) {
        alert('Failed to delete: ' + err.message);
      }
    });
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
  const totalInvested     = txns.filter(t => t.type === 'Investment').reduce((s,t) => s + t.amount, 0);
  const latestVal         = valuations[0] ?? null;
  const investmentTxns    = txns.filter(t => t.type === 'Investment').sort((a,b) => a.date.localeCompare(b.date));
  const currentValue      = latestVal ? latestVal.value : (company.unrealised || 0);
  const computedMoic      = currentValue > 0 && totalInvested > 0 ? currentValue / totalInvested : null;
  const investDate        = investmentTxns[0]?.date ? new Date(investmentTxns[0].date) : null;
  const today             = new Date();
  const years             = investDate ? (today.getTime() - investDate.getTime()) / (1000*60*60*24*365.25) : 0;
  const computedIrr       = years > 0.01 && currentValue > 0 && totalInvested > 0
    ? ((currentValue / totalInvested) ** (1/years) - 1) * 100 : null;

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
        { key: 'dataroom',     label: 'Data Room' },
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
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(!editing)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
              {editing ? '✕ Cancel' : '✏️ Edit Company'}
            </button>
            <button onClick={handleDeleteCompany}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-red-200 text-red-600 bg-white hover:bg-red-50 transition-colors">
              🗑 Delete Company
            </button>
          </div>
        )}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Invested Capital', value: fmtFull(totalInvested), cls: '' },
          { label: 'Current Value',    value: currentValue > 0 ? fmtFull(currentValue) : '—', cls: '' },
          { label: 'MOIC',             value: computedMoic != null ? `${computedMoic.toFixed(2)}x` : '—', cls: computedMoic != null ? moicColor(computedMoic) : 'text-[#9b9890]' },
          { label: 'IRR',              value: computedIrr != null ? `${computedIrr.toFixed(1)}%` : '—', cls: computedIrr != null ? irrColor(computedIrr) : 'text-[#9b9890]' },
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
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Legal Name <span className="font-normal">(optional)</span></label>
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

              {/* ── Round / Investment Details ── */}
              <div className="col-span-2 pt-3 border-t border-[#f0efe9]">
                <div className="text-[12px] font-semibold text-[#6b6860] uppercase tracking-wide mb-3">Round Details</div>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Investment Date</label>
                <input type="date" value={form.investmentDate} onChange={set('investmentDate')} className={inputCls} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Security Type</label>
                <select value={form.securityType} onChange={set('securityType')} className={inputCls}>
                  <option value="">Select…</option>
                  {['SAFE','Convertible Note','Preferred Stock','Common Stock'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Round</label>
                <select value={form.round} onChange={set('round')} className={inputCls}>
                  <option value="">Select…</option>
                  {['Series Pre-seed','Series Seed','Series A','Series B','Series C','Series D','Series E','Growth Stage','Other'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Investment Amount (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[12px]">$</span>
                  <input type="number" value={form.invested} onChange={set('invested')} placeholder="0" className={inputCls + ' pl-6'} />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Valuation</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[12px]">$</span>
                  <input type="number" value={form.valuation} onChange={set('valuation')} placeholder="0" className={inputCls + ' pl-6'} />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Valuation Type</label>
                <select value={form.valuationType} onChange={set('valuationType')} className={inputCls}>
                  <option value="Pre-money">Pre-money</option>
                  <option value="Post-money">Post-money</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Discount % <span className="font-normal">(SAFE/Note)</span></label>
                <input type="number" value={form.discount} onChange={set('discount')} placeholder="e.g. 20" className={inputCls} />
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
              {/* Row 1: Date, Type, Amount */}
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
              </div>

              {/* Row 2: Instrument, Round, Notes */}
              <div className="grid grid-cols-3 gap-3 mb-3">
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
                  <label className="block text-[11.5px] font-medium mb-1">Notes</label>
                  <input value={newTxnForm.description}
                    onChange={e => setNewTxnForm(f => ({...f, description: e.target.value}))}
                    placeholder="Additional notes"
                    className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]" />
                </div>
              </div>

              {/* Preferred Stock / Common Stock terms */}
              {(newTxnForm.instrument === 'Preferred Stock' || newTxnForm.instrument === 'Common Stock' || newTxnForm.instrument === 'Equity') && (
                <div className="border border-[#2d5be3]/20 rounded-[7px] bg-[#f5f7ff] p-3 mb-3">
                  <div className="text-[11.5px] font-semibold text-[#2d5be3] mb-2">{newTxnForm.instrument} Terms</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11.5px] font-medium mb-1">Share Price (optional)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[12px]">$</span>
                        <input type="number" step="0.0001" value={newTxnForm.sharePrice}
                          onChange={e => setNewTxnForm(f => ({...f, sharePrice: e.target.value}))}
                          placeholder="e.g. 1.33"
                          className="w-full pl-6 pr-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] bg-white" />
                      </div>
                      <p className="text-[11px] text-[#9b9890] mt-1">Price per share</p>
                    </div>
                    <div>
                      <label className="block text-[11.5px] font-medium mb-1">Number of Shares (optional)</label>
                      <input type="number" value={newTxnForm.numShares}
                        onChange={e => setNewTxnForm(f => ({...f, numShares: e.target.value}))}
                        placeholder="e.g. 150075"
                        className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] bg-white" />
                      {newTxnForm.sharePrice && newTxnForm.numShares && (
                        <p className="text-[11px] text-[#9b9890] mt-1">
                          Total: ${(Number(newTxnForm.sharePrice) * Number(newTxnForm.numShares)).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[11.5px] font-medium mb-1">Post-Money Valuation (optional)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[12px]">$</span>
                        <input type="number" value={newTxnForm.valuationCap}
                          onChange={e => setNewTxnForm(f => ({...f, valuationCap: e.target.value}))}
                          placeholder="e.g. 10000000"
                          className="w-full pl-6 pr-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] bg-white" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SAFE / Convertible Note terms */}
              {(newTxnForm.instrument === 'SAFE' || newTxnForm.instrument === 'Convertible Note') && (
                <div className="border border-[#2d5be3]/20 rounded-[7px] bg-[#f5f7ff] p-3 mb-3">
                  <div className="text-[11.5px] font-semibold text-[#2d5be3] mb-2">
                    {newTxnForm.instrument} Terms
                  </div>
                  {/* SAFE Structure */}
                  <div className="mb-3">
                    <label className="block text-[11.5px] font-medium mb-1.5">Structure</label>
                    <div className="flex flex-col gap-1.5">
                      {['with valuation cap and discount','with valuation cap, no discount','with discount, no valuation cap'].map(s => (
                        <button key={s} type="button"
                          onClick={() => setNewTxnForm(f => ({...f, safeType: s}))}
                          className={'px-3 py-1.5 rounded-[7px] text-[12px] font-medium border text-left transition-all ' +
                            (newTxnForm.safeType === s ? 'bg-[#2d5be3] text-white border-[#2d5be3]' : 'bg-white text-[#6b6860] border-[#e8e6df] hover:border-[#2d5be3]')}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Valuation Cap */}
                    {newTxnForm.safeType !== 'with discount, no valuation cap' && (
                      <div>
                        <label className="block text-[11.5px] font-medium mb-1">Valuation Cap</label>
                        <div className="flex gap-2 items-center">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[12px]">$</span>
                            <input type="number" value={newTxnForm.valuationCap}
                              onChange={e => setNewTxnForm(f => ({...f, valuationCap: e.target.value}))}
                              placeholder="e.g. 5000000"
                              className="w-full pl-6 pr-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] bg-white" />
                          </div>
                          <div className="flex border border-[#e8e6df] rounded-[7px] overflow-hidden flex-shrink-0">
                            {(['Pre-money','Post-money'] as const).map(v => (
                              <button key={v} type="button"
                                onClick={() => setNewTxnForm(f => ({...f, valuationType: v}))}
                                className={'px-2 py-2 text-[11px] font-medium transition-colors ' +
                                  (newTxnForm.valuationType === v ? 'bg-[#2d5be3] text-white' : 'bg-white text-[#6b6860] hover:bg-[#f9f8f5]')}>
                                {v}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Discount % */}
                    {newTxnForm.safeType !== 'with valuation cap, no discount' && (
                      <div>
                        <label className="block text-[11.5px] font-medium mb-1">Discount %</label>
                        <div className="relative">
                          <input type="number" step="0.5" min="0" max="50"
                            value={newTxnForm.discount}
                            onChange={e => setNewTxnForm(f => ({...f, discount: e.target.value}))}
                            placeholder="e.g. 20"
                            className="w-full px-3 py-2 pr-7 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] bg-white" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[12px]">%</span>
                        </div>
                        <p className="text-[11px] text-[#9b9890] mt-1">Typically 15–20%</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
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
            <button onClick={() => setShowValForm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">
              + Add Valuation
            </button>
          </div>

          {showValForm && (
            <div className="border-b border-[#e8e6df]">
              <div className="flex">
                {/* Left: form */}
                <div className="flex-1 px-5 py-5">
                  <div className="text-[13.5px] font-semibold mb-4">New Valuation</div>

                  {/* Transaction selector — only shown when multiple investments exist */}
                  {investmentTxns.length > 1 && (
                    <div className="mb-4 p-3 bg-[#eef2fd] border border-[#c7d7f9] rounded-xl">
                      <label className="block text-[11.5px] font-medium mb-1 text-[#2d5be3]">
                        Which investment are you valuing? *
                      </label>
                      <p className="text-[11px] text-[#6b6860] mb-2">
                        This company has multiple investments — select the specific tranche.
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {investmentTxns.map(t => (
                          <button key={t.id} type="button"
                            onClick={() => setValForm(f => ({...f, transaction_id: t.id}))}
                            className={'px-3 py-2 rounded-[7px] text-[12.5px] text-left border transition-all ' +
                              (valForm.transaction_id === t.id
                                ? 'bg-[#2d5be3] text-white border-[#2d5be3]'
                                : 'bg-white text-[#1a1915] border-[#e8e6df] hover:border-[#2d5be3]')}>
                            <span className="font-medium">${t.amount.toLocaleString()}</span>
                            <span className="ml-2 opacity-75">{t.instrument} · {t.date}</span>
                            {t.valuation_cap && <span className="ml-2 opacity-75">@ ${(t.valuation_cap/1_000_000).toFixed(0)}M cap</span>}
                          </button>
                        ))}
                      </div>
                      {!valForm.transaction_id && (
                        <p className="text-[11px] text-amber-600 mt-1.5">Please select a transaction above</p>
                      )}
                    </div>
                  )}

                  {/* Date + Method */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-[11.5px] font-medium mb-1">Valuation Date *</label>
                      <input type="date" value={valForm.date}
                        onChange={e => setValForm(f => ({...f, date: e.target.value}))}
                        className={inputCls} />
                      {valForm.date && (() => {
                        const d = new Date(valForm.date);
                        const q = `Q${d.getMonth()<3?1:d.getMonth()<6?2:d.getMonth()<9?3:4} ${d.getFullYear()}`;
                        return <p className="text-[11px] text-[#9b9890] mt-1">📅 Quarter: {q}</p>;
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

                  {/* Investment Value + Company Value */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-[11.5px] font-medium mb-1">Investment Value *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[12px]">$</span>
                        <input type="number" value={valForm.investmentValue}
                          onChange={e => setValForm(f => ({...f, investmentValue: e.target.value}))}
                          placeholder="Your stake's current worth"
                          className={inputCls + ' pl-6'} />
                      </div>
                      <p className="text-[11px] text-[#9b9890] mt-1">Your stake's current worth. Drives MOIC.</p>
                      {valForm.investmentValue && Number(valForm.investmentValue) > 0 && (() => {
                        const selectedTxn = valForm.transaction_id
                          ? investmentTxns.find(t => t.id === valForm.transaction_id)
                          : investmentTxns[0];
                        const txnAmount = selectedTxn?.amount ?? totalInvested;
                        const moic = txnAmount > 0 ? Number(valForm.investmentValue) / txnAmount : 0;
                        const d = new Date(valForm.date);
                        const inv = selectedTxn?.date ? new Date(selectedTxn.date) : null;
                        const yrs = inv ? (d.getTime()-inv.getTime())/(1000*60*60*24*365.25) : 0;
                        const irr = yrs > 0.01 ? ((Number(valForm.investmentValue)/txnAmount)**(1/yrs)-1)*100 : null;
                        return <p className="text-[11.5px] mt-1">
                          <span className={`font-semibold ${moic>=1?'text-green-600':'text-red-500'}`}>MOIC: {moic.toFixed(2)}x</span>
                          {irr != null && <span className={`ml-2 font-semibold ${irr>=0?'text-green-600':'text-red-500'}`}>IRR: {irr.toFixed(1)}%</span>}
                        </p>;
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
                      <p className="text-[11px] text-[#9b9890] mt-1">100% company value. For reporting only.</p>
                    </div>
                  </div>

                  {/* Round + Notes */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-[11.5px] font-medium mb-1">Round (optional)</label>
                      <select value={valForm.round} onChange={e => setValForm(f => ({...f, round: e.target.value}))} className={inputCls}>
                        <option value="">Select…</option>
                        {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11.5px] font-medium mb-1">Notes (optional)</label>
                      <input value={valForm.notes} onChange={e => setValForm(f => ({...f, notes: e.target.value}))}
                        placeholder="Document assumptions…" className={inputCls} />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={handleAddValuation} disabled={savingVal || !valForm.investmentValue || !valForm.date || (investmentTxns.length > 1 && !valForm.transaction_id)}
                      className="px-5 py-2 rounded-[7px] text-[13px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors disabled:opacity-60">
                      {savingVal ? 'Saving...' : 'Create Valuation'}
                    </button>
                    <button onClick={() => setShowValForm(false)}
                      className="px-5 py-2 rounded-[7px] text-[13px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>

                {/* Right panel */}
                <div className="w-[240px] border-l border-[#e8e6df] flex flex-col flex-shrink-0">
                  <div className="px-4 py-4 border-b border-[#e8e6df]">
                    <div className="text-[12.5px] font-semibold mb-3">{company.name}</div>
                    <div className="space-y-2 text-[12px]">
                      <div className="flex justify-between"><span className="text-[#9b9890]">Total Invested</span><span className="font-mono font-medium">{fmtFull(totalInvested)}</span></div>
                      <div className="flex justify-between"><span className="text-[#9b9890]">Entry Val Cap</span><span className="font-mono">{investmentTxns[0]?.valuation_cap ? fmtFull(investmentTxns[0].valuation_cap) : '—'}</span></div>
                      {valForm.investmentValue && Number(valForm.investmentValue) > 0 && (
                        <div className="flex justify-between pt-1 border-t border-[#e8e6df]">
                          <span className="text-[#9b9890]">New Value</span>
                          <span className="font-mono font-semibold text-green-600">{fmtFull(Number(valForm.investmentValue))}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {valuations.length > 0 && (
                    <div className="px-4 py-4 border-b border-[#e8e6df]">
                      <div className="text-[10.5px] font-semibold text-[#9b9890] uppercase tracking-wide mb-2.5">📊 Previous Valuations</div>
                      <div className="space-y-2">
                        {valuations.slice(0,4).map(v => (
                          <div key={v.id} className="bg-[#f9f8f5] rounded-lg px-3 py-2">
                            <div className="flex justify-between mb-0.5">
                              <span className="text-[11px] font-medium">{v.quarter}</span>
                              <span className={`text-[11px] font-semibold ${moicColor(v.moic ?? 0)}`}>{(v.moic ?? 0)>0?`${(v.moic ?? 0).toFixed(2)}x`:'—'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-mono text-[12px] font-semibold">{fmtFull(v.value)}</span>
                              <span className="text-[10px] text-[#9b9890]">{v.notes?.match(/^\[(.+?)\]/)?.[1]||v.round||'manual'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="px-4 py-4 bg-amber-50 flex-1">
                    <div className="text-[11.5px] font-semibold text-amber-700 mb-2">💡 Valuation Tips</div>
                    <ul className="space-y-1.5 text-[11px] text-amber-800">
                      <li>• Consider recent funding rounds</li>
                      <li>• Review comparable company metrics</li>
                      <li>• Account for company progress</li>
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
              {['Quarter','Investment Value','Company Valuation','Method','MOIC','IRR','Round','Actions'].map(h => (
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
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px] font-medium text-green-700">{fmtFull(v.value)}</td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px] text-[#6b6860]">{(v as any).company_value ? fmtFull(Number((v as any).company_value)) : '—'}</td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860]">{v.notes?.match(/^\[(.+?)\]/)?.[1] || '—'}</td>
                  <td className={`px-4 py-2.5 border-b border-[#e8e6df] text-[12.5px] ${moicColor(v.moic ?? 0)}`}>{(v.moic ?? 0) > 0 ? `${(v.moic ?? 0).toFixed(2)}x` : '—'}</td>
                  <td className={`px-4 py-2.5 border-b border-[#e8e6df] text-[12.5px] ${irrColor(v.irr ?? 0)}`}>{(v.irr ?? 0) !== 0 ? `${(v.irr ?? 0).toFixed(1)}%` : '—'}</td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860]">{v.round || '—'}</td>
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
                <label className="block text-[12px] font-medium mb-1">Investment Value (USD) *</label>
                <p className="text-[11px] text-[#9b9890] mb-1">Your stake's current worth</p>
                <input type="number" value={editingVal.value}
                  onChange={e => {
                    const newVal = Number(e.target.value);
                    const newMoic = totalInvested > 0 ? newVal / totalInvested : 0;
                    const yrs = years;
                    const newIrr = yrs > 0.01 && newVal > 0 && totalInvested > 0
                      ? ((newVal / totalInvested) ** (1/yrs) - 1) * 100 : 0;
                    setEditingVal(v => v ? {...v, value: newVal, moic: newMoic, irr: newIrr} : null);
                  }}
                  className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3]" />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">Total Company Value (optional)</label>
                <p className="text-[11px] text-[#9b9890] mb-1">100% enterprise value</p>
                <input type="number" value={(editingVal as any).company_value || ''}
                  onChange={e => setEditingVal(v => v ? {...v, company_value: e.target.value} as any : null)}
                  className="w-full px-3 py-2 rounded-[7px] border border-dashed border-[#c8c6bf] text-[13px] outline-none focus:border-[#2d5be3]" />
              </div>
              <div>
                <label className="block text-[12px] font-medium mb-1">MOIC (auto-calculated)</label>
                <div className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] bg-[#f9f8f5] text-[#6b6860]">
                  {(editingVal.moic ?? 0) > 0 ? (editingVal.moic ?? 0).toFixed(2) + 'x' : '—'}
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

      {/* ══ DATA ROOM ══ */}
      {tab === 'dataroom' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[13.5px] font-semibold">Data Room</div>
              <div className="text-[11.5px] text-[#9b9890] mt-0.5">Documents, agreements, and files for this company</div>
            </div>
            {can.uploadDocument(role) && (
              <button onClick={() => setShowUploadForm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">
                + Upload Document
              </button>
            )}
          </div>

          {/* Filter + Search bar */}
          <div className="flex gap-2 mb-4">
            <div className="flex gap-1">
              {(['All','NDA','Term Sheet','SAFE','Financial','Pitch Deck','Legal','Other'] as const).map(f => (
                <button key={f} onClick={() => setDocFilter(f)}
                  className={`px-2.5 py-1 rounded-[6px] text-[11.5px] font-medium transition-colors ${docFilter === f ? 'bg-[#2d5be3] text-white' : 'bg-white border border-[#e8e6df] text-[#6b6860] hover:bg-[#f9f8f5]'}`}>
                  {f}
                </button>
              ))}
            </div>
            <input value={docSearch} onChange={e => setDocSearch(e.target.value)}
              placeholder="Search documents…"
              className="ml-auto px-3 py-1.5 rounded-[7px] border border-[#e8e6df] text-[12px] outline-none focus:border-[#2d5be3] w-52" />
          </div>

          {/* Upload form */}
          {showUploadForm && can.uploadDocument(role) && (
            <div className="bg-white border border-[#e8e6df] rounded-xl p-5 mb-4">
              {/* Drag-and-drop / click-to-browse zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) setUploadFile(f); }}
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-colors mb-3 py-8 px-6 ${dragOver ? 'border-[#2d5be3] bg-[#eef2fd]' : uploadFile ? 'border-green-400 bg-green-50' : 'border-[#d4d2cb] bg-[#fafaf8] hover:border-[#2d5be3] hover:bg-[#f5f7fe]'}`}>
                <input ref={fileInputRef} type="file" className="hidden" onChange={e => setUploadFile(e.target.files?.[0] ?? null)} />
                {uploadFile ? (
                  <>
                    <div className="text-2xl">📄</div>
                    <div className="text-[13px] font-semibold text-green-700">{uploadFile.name}</div>
                    <div className="text-[11.5px] text-[#9b9890]">{fmtFileSize(uploadFile.size)} · click to change</div>
                  </>
                ) : (
                  <>
                    <div className="text-2xl">☁️</div>
                    <div className="text-[13px] font-medium text-[#3d3b35]">Drag &amp; drop a file here, or <span className="text-[#2d5be3]">browse</span></div>
                    <div className="text-[11.5px] text-[#9b9890]">PDF, DOCX, XLSX, PNG, JPG and more</div>
                  </>
                )}
              </div>

              {/* Optional note */}
              <input value={uploadForm.notes} onChange={e => setUploadForm(f => ({...f, notes: e.target.value}))}
                placeholder="Add a note (optional) — e.g. Signed NDA from April 2025"
                className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3] mb-3" />

              <div className="flex gap-2">
                <button onClick={handleUploadDoc} disabled={uploadingDoc || !uploadFile}
                  className="px-3 py-1.5 rounded-[7px] text-[12px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors disabled:opacity-60">
                  {uploadingDoc ? 'Uploading…' : 'Upload'}
                </button>
                <button onClick={() => { setShowUploadForm(false); setUploadFile(null); setDragOver(false); setUploadForm({ doc_type: 'Other', notes: '' }); }}
                  className="px-3 py-1.5 rounded-[7px] text-[12px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {docsLoading ? (
            <div className="flex items-center justify-center py-12 text-[#9b9890] text-[13px]">
              <svg className="animate-spin w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Loading documents…
            </div>
          ) : (() => {
            const filtered = docs
              .filter(d => docFilter === 'All' || d.doc_type === docFilter)
              .filter(d => !docSearch || d.name.toLowerCase().includes(docSearch.toLowerCase()) || d.notes?.toLowerCase().includes(docSearch.toLowerCase()));
            return filtered.length === 0 ? (
              <div className="bg-white border border-[#e8e6df] rounded-xl p-10 text-center">
                <div className="text-2xl mb-2">📁</div>
                <div className="text-[13px] font-medium mb-1">{docs.length === 0 ? 'No documents yet' : 'No documents match your filter'}</div>
                <p className="text-[12px] text-[#9b9890]">{docs.length === 0 ? 'Upload NDAs, term sheets, SAFEs, financials, and other company documents' : 'Try a different filter or search term'}</p>
              </div>
            ) : (
              <div className="bg-white border border-[#e8e6df] rounded-xl overflow-hidden">
                <table className="w-full border-collapse">
                  <thead><tr>
                    {['Name','Type','Size','Notes','Uploaded','Actions'].map(h => (
                      <th key={h} className="text-[11px] font-medium text-[#6b6860] text-left px-4 py-2.5 border-b border-[#e8e6df] bg-[#f9f8f5]">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filtered.map(doc => (
                      <tr key={doc.id} className="hover:bg-[#f9f8f5] transition-colors">
                        <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                          <span className="text-[12.5px] font-medium text-[#1a1915]">{doc.name}</span>
                        </td>
                        <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#f9f8f5] border border-[#e8e6df] text-[#6b6860]">{doc.doc_type}</span>
                        </td>
                        <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#9b9890] font-mono">{fmtFileSize(doc.file_size)}</td>
                        <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860] max-w-[200px] truncate">{doc.notes || '—'}</td>
                        <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[11.5px] text-[#9b9890]">{new Date(doc.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
                        <td className="px-4 py-2.5 border-b border-[#e8e6df] whitespace-nowrap">
                          <div className="flex gap-2">
                            {can.viewDocument(role) && (
                              <button onClick={() => handleViewDoc(doc)}
                                className="text-[11.5px] text-[#2d5be3] hover:underline">View</button>
                            )}
                            {can.downloadDocument(role) && (
                              <button onClick={() => handleDownloadDoc(doc)}
                                className="text-[11.5px] text-[#6b6860] hover:text-[#3d3b35] hover:underline">Download</button>
                            )}
                            {can.deleteDocument(role) && (
                              <button onClick={() => handleDeleteDoc(doc)}
                                className="text-[11.5px] text-red-500 hover:text-red-700">Delete</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2 border-t border-[#e8e6df] bg-[#f9f8f5] text-[11.5px] text-[#9b9890]">
                  {filtered.length} document{filtered.length !== 1 ? 's' : ''}
                </div>
              </div>
            );
          })()}
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

      {/* ── Confirm Modal ── */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setConfirmModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="text-[14px] font-semibold mb-2">Are you sure?</div>
            <p className="text-[13px] text-[#6b6860] mb-5">{confirmModal.message}</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-[8px] text-[12.5px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                Cancel
              </button>
              <button
                onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
                className="px-4 py-2 rounded-[8px] text-[12.5px] font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">
                Delete
              </button>
            </div>
          </div>
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