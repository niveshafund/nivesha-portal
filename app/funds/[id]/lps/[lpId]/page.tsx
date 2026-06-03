'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getLPById, updateLP, deleteLP, getLPTransactions, addLPTransaction, deleteLPTransaction, DbLP, DbLPTransaction } from '@/lib/db';
import { supabase } from '@/lib/supabase';

const fmtFull = (n: number | undefined | null) => n == null ? '$0' : `$${n.toLocaleString()}`;
const fmtPct  = (n: number) => `${n.toFixed(2)}%`;

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
  'DC',
];

export default function LPDetailPage({ params }: { params: Promise<{ id: string; lpId: string }> }) {
  const { id: fundId, lpId } = React.use(params);
  const router = useRouter();
  const [lp, setLP] = useState<DbLP | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [txns, setTxns] = useState<DbLPTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddTxn, setShowAddTxn] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmTxnId, setConfirmTxnId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '', email: '', phone: '', type: 'Individual',
    commitment: '', joinDate: '',
    addressLine1: '', addressLine2: '', city: '',
    state: '', zip: '', country: 'USA', notes: '', gp_contact: '',
  });

  const [activeTab, setActiveTab] = useState<'details' | 'documents'>('details');

  // Documents
  type LPDoc = { id: string; name: string; file_path: string; file_size: number; file_type: string; doc_type: string; notes: string | null; uploaded_by: string; created_at: string; };
  const LP_DOC_TYPES = ['LPA', 'K-1', 'Quarterly Report', 'Capital Call Notice', 'Distribution Notice', 'Subscription Agreement', 'Side Letter', 'Other'];
  const [docs, setDocs] = useState<LPDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadForm, setUploadForm] = useState({ doc_type: 'Other', notes: '' });
  const [docSearch, setDocSearch] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('All Types');

  const txnForm_placeholder = { date: '', amount: '', type: 'Capital Call', notes: '' };
  const [txnForm, setTxnForm] = useState(txnForm_placeholder);
  const [txnError, setTxnError] = useState<string | null>(null);
  const [addingTxn, setAddingTxn] = useState(false);

  useEffect(() => { load(); loadDocs(); }, [lpId]);

  async function load() {
    try {
      const [lpData, txnsData] = await Promise.all([getLPById(lpId), getLPTransactions(lpId)]);
      if (lpData) {
        setLP(lpData);
        setForm({
          name:         lpData.name,
          email:        lpData.email ?? '',
          phone:        lpData.phone ?? '',
          type:         lpData.type,
          commitment:   String(lpData.commitment),
          joinDate:     lpData.join_date ?? '',
          addressLine1: lpData.address_line1 ?? '',
          addressLine2: lpData.address_line2 ?? '',
          city:         lpData.city ?? '',
          state:        lpData.state ?? '',
          zip:          lpData.zip ?? '',
          country:      lpData.country ?? 'USA',
          notes:        lpData.notes ?? '',
          gp_contact:   lpData.gp_contact ?? '',
        });
      }
      setTxns(txnsData);
    } finally {
      setLoading(false);
    }
  }

  async function loadDocs() {
    setDocsLoading(true);
    try {
      const { data } = await supabase.from('lp_documents').select('*').eq('lp_id', lpId).order('created_at', { ascending: false });
      setDocs(data ?? []);
    } finally {
      setDocsLoading(false);
    }
  }

  const handleUploadDoc = async () => {
    if (!uploadFile) return;
    setUploadingDoc(true);
    try {
      const ext = uploadFile.name.split('.').pop();
      const safeName = uploadFile.name.replace(/[^a-z0-9.]/gi, '-');
      const path = `${lpId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from('lp-documents').upload(path, uploadFile, { upsert: false });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from('lp_documents').insert({
        lp_id: lpId, fund_id: fundId,
        name: uploadFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' '),
        file_path: path, file_size: uploadFile.size, file_type: uploadFile.type,
        doc_type: uploadForm.doc_type, notes: uploadForm.notes || null, uploaded_by: 'GP',
      });
      if (dbErr) throw dbErr;
      setUploadFile(null);
      setUploadForm({ doc_type: 'Other', notes: '' });
      setShowUploadForm(false);
      await loadDocs();
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDoc = async (doc: LPDoc) => {
    if (!confirm(`Delete "${doc.name}"?`)) return;
    await supabase.storage.from('lp-documents').remove([doc.file_path]);
    await supabase.from('lp_documents').delete().eq('id', doc.id);
    await loadDocs();
  };

  const handleViewDoc = async (doc: LPDoc) => {
    const { data } = await supabase.storage.from('lp-documents').createSignedUrl(doc.file_path, 3600);
    if (!data?.signedUrl) return;
    const isPdf = doc.file_path.toLowerCase().endsWith('.pdf');
    const url = isPdf ? data.signedUrl : `https://docs.google.com/viewer?url=${encodeURIComponent(data.signedUrl)}&embedded=false`;
    window.open(url, '_blank');
  };

  const handleDownloadDoc = async (doc: LPDoc) => {
    const { data } = await supabase.storage.from('lp-documents').createSignedUrl(doc.file_path, 3600);
    if (!data?.signedUrl) return;
    const blob = await fetch(data.signedUrl).then(r => r.blob());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = doc.name + '.' + doc.file_path.split('.').pop();
    a.click();
  };

  const handleDeleteDoc_noop = handleDeleteDoc; // suppress unused warning

  const handleViewDoc_noop = handleViewDoc;

  const handleDownloadDoc_noop = handleDownloadDoc;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const DOC_TYPE_COLORS: Record<string, string> = {
    'LPA': 'bg-purple-100 text-purple-700',
    'K-1': 'bg-green-100 text-green-700',
    'Quarterly Report': 'bg-blue-100 text-blue-700',
    'Capital Call Notice': 'bg-amber-100 text-amber-700',
    'Distribution Notice': 'bg-teal-100 text-teal-700',
    'Subscription Agreement': 'bg-indigo-100 text-indigo-700',
    'Side Letter': 'bg-pink-100 text-pink-700',
    'Other': 'bg-gray-100 text-gray-600',
  };

  const handleDelete = async () => {
    if (txns.length > 0) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/lp/${lpId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to delete LP');
      router.push(`/funds/${fundId}`);
    } catch (err: any) {
      alert('Failed to delete LP: ' + err.message);
      setDeleting(false);
    }
  };

  const handleExport = () => {
    if (!lp) return;
    const headers = ['Investor Name*','Investing As','Commitment Amount*','Currency*','Called Capital','Distributions','Commitment Date','Email','Phone','Address Line 1','Address Line 2','City','State','ZIP Code','Country','GP Contact','Notes'];
    const row = [lp.name,'',lp.commitment,'USD',lp.called,lp.distributions,lp.join_date||'',lp.email||'',lp.phone||'',lp.address_line1||'',lp.address_line2||'',lp.city||'',lp.state||'',lp.zip||'',lp.country||'',lp.gp_contact||'',lp.notes||''];
    const csv = [headers.join(','), row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${lp.name.replace(/[^a-z0-9]/gi,'_')}_LP.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  const set = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const setTxn = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setTxnForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true); setSaveError(null);
    try {
      const updated = await updateLP(lpId, {
        name:          form.name.trim(),
        email:         form.email || undefined,
        phone:         form.phone || undefined,
        type:          form.type as any,
        commitment:    Number(form.commitment),
        join_date:     form.joinDate || undefined,
        address_line1: form.addressLine1 || undefined,
        address_line2: form.addressLine2 || undefined,
        city:          form.city || undefined,
        state:         form.state || undefined,
        zip:           form.zip || undefined,
        country:       form.country || undefined,
        notes:         form.notes || undefined,
        gp_contact:    form.gp_contact || undefined,
      });
      setLP(updated);
      setEditing(false);
    } catch (err: any) {
      setSaveError(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleAddTxn = async () => {
    if (!txnForm.date || !txnForm.amount) { setTxnError('Date and amount are required'); return; }
    setAddingTxn(true); setTxnError(null);
    try {
      await addLPTransaction({ lp_id: lpId, fund_id: fundId, date: txnForm.date, amount: Number(txnForm.amount), type: txnForm.type as any, notes: txnForm.notes || undefined });
      await load();
      setTxnForm({ date: '', amount: '', type: 'Capital Call', notes: '' });
      setShowAddTxn(false);
    } catch (err: any) {
      setTxnError(err.message ?? 'Failed to add transaction');
    } finally {
      setAddingTxn(false);
    }
  };

  const handleDeleteTxn = async (txnId: string) => {
    // Show confirm modal instead of browser confirm()
    setConfirmTxnId(txnId);
  };

  const confirmDeleteTxn = async () => {
    if (!confirmTxnId) return;
    try {
      await deleteLPTransaction(confirmTxnId, lpId);
      await load();
    } catch (err: any) {
      alert('Failed to delete: ' + err.message);
    } finally {
      setConfirmTxnId(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-[#6b6860]">
      <svg className="animate-spin w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      Loading LP...
    </div>
  );

  if (!lp) return (
    <div className="p-8 text-center">
      <p className="text-[#9b9890] mb-3">LP not found.</p>
      <Link href={`/funds/${fundId}`} className="text-[#2d5be3] hover:underline">← Back to Fund</Link>
    </div>
  );

  const totalCalled = txns.filter(t => t.type === 'Capital Call').reduce((s, t) => s + t.amount, 0);
  const uncalled    = lp.commitment - totalCalled;
  const callPct     = lp.commitment > 0 ? (totalCalled / lp.commitment) * 100 : 0;

  const inputCls    = 'w-full px-3 py-2.5 rounded-[7px] border border-[#e8e6df] bg-white text-[13px] font-sans outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 transition-colors';
  const isUSA = form.country === 'USA' || form.country === 'US' || form.country === 'United States';

  return (
    <div className="max-w-4xl">

      {/* ── Confirm Delete Transaction Modal ── */}
      {confirmTxnId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setConfirmTxnId(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="text-[14px] font-semibold mb-2">Delete this entry?</div>
            <p className="text-[13px] text-[#6b6860] mb-5">
              This will permanently remove this capital call record. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmTxnId(null)}
                className="px-4 py-2 rounded-[8px] text-[12.5px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                Cancel
              </button>
              <button onClick={confirmDeleteTxn}
                className="px-4 py-2 rounded-[8px] text-[12.5px] font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 text-[12.5px] text-[#6b6860] mb-2">
            <Link href={`/funds/${fundId}?tab=lps`} className="hover:text-[#2d5be3]">← Limited Partners</Link>
            <span>/</span>
            <span className="text-[#1a1917] font-medium">{lp.name}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-[#2d5be3] text-white font-bold flex items-center justify-center text-[14px]">
              {lp.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-[20px] font-semibold tracking-tight">{lp.name}</h1>
              <p className="text-[12px] text-[#6b6860]">{lp.type} · {lp.email}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">↓ Export</button>
          <button onClick={() => setEditing(!editing)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
            {editing ? '✕ Cancel Edit' : '✏️ Edit LP'}
          </button>
        </div>
      </div>

      {saveError && <div className="bg-red-50 border border-red-200 rounded-[7px] px-4 py-3 text-[12.5px] text-red-700 mb-4">⚠️ {saveError}</div>}

      {/* Tab navigation */}
      <div className="flex gap-0 border-b border-[#e8e6df] mb-5">
        {(['details', 'documents'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={'px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors capitalize ' +
              (activeTab === tab ? 'border-[#2d5be3] text-[#2d5be3]' : 'border-transparent text-[#6b6860] hover:text-[#1a1917]')}>
            {tab === 'documents' ? `Documents (${docs.length})` : 'Details'}
          </button>
        ))}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Commitment',    value: fmtFull(lp.commitment) },
          { label: 'Called',        value: fmtFull(totalCalled) },
          { label: 'Uncalled',      value: fmtFull(uncalled) },
          { label: 'Distributions', value: fmtFull(lp.distributions) },
          { label: '% of Fund',     value: fmtPct(lp.ownership_pct) },
          { label: 'Status',        value: lp.status },
        ].map(k => (
          <div key={k.label} className="bg-white border border-[#e8e6df] rounded-xl p-4">
            <label className="text-[11px] text-[#6b6860] block mb-1">{k.label}</label>
            <div className="text-[16px] font-semibold font-mono">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Capital deployment bar */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-semibold">Capital Called</span>
          <span className="text-[12px] text-[#6b6860]">{callPct.toFixed(0)}% of commitment</span>
        </div>
        <div className="h-2 bg-[#f0f0ed] rounded-full mb-2">
          <div className="h-2 bg-[#2d5be3] rounded-full" style={{ width: `${Math.min(100, callPct)}%` }} />
        </div>
        <div className="flex justify-between text-[11.5px] text-[#9b9890]">
          <span>Called: {fmtFull(totalCalled)}</span>
          <span>Remaining: {fmtFull(uncalled)}</span>
          <span>Total: {fmtFull(lp.commitment)}</span>
        </div>
      </div>

      {/* Capital Call Transactions */}
      <div className="bg-white border border-[#e8e6df] rounded-xl mb-5">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6df]">
          <div>
            <div className="text-[13.5px] font-semibold">Capital Call History</div>
            <div className="text-[11.5px] text-[#9b9890] mt-0.5">{txns.length} installment{txns.length !== 1 ? 's' : ''}</div>
          </div>
          <button onClick={() => setShowAddTxn(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">
            + Add Capital Call
          </button>
        </div>

        {showAddTxn && (
          <div className="px-5 py-4 border-b border-[#e8e6df] bg-[#f9f8f5]">
            <div className="text-[13px] font-semibold mb-3">New Capital Call</div>
            {txnError && <p className="text-[11px] text-red-500 mb-2">{txnError}</p>}
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div>
                <label className="block text-[11.5px] font-medium mb-1">Date *</label>
                <input type="date" value={txnForm.date} onChange={setTxn('date')} className={inputCls} />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium mb-1">Amount (USD) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[12px]">$</span>
                  <input type="number" value={txnForm.amount} onChange={setTxn('amount')} placeholder="0" className={inputCls + ' pl-6'} />
                </div>
              </div>
              <div>
                <label className="block text-[11.5px] font-medium mb-1">Type</label>
                <select value={txnForm.type} onChange={setTxn('type')} className={inputCls}>
                  <option value="Capital Call">Capital Call</option>
                  <option value="Distribution">Distribution</option>
                  <option value="Return of Capital">Return of Capital</option>
                </select>
              </div>
              <div>
                <label className="block text-[11.5px] font-medium mb-1">Notes</label>
                <input type="text" value={txnForm.notes} onChange={setTxn('notes')} placeholder="Optional" className={inputCls} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddTxn} disabled={addingTxn} className="px-3 py-1.5 rounded-[7px] text-[12px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors disabled:opacity-60">
                {addingTxn ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => { setShowAddTxn(false); setTxnError(null); }} className="px-3 py-1.5 rounded-[7px] text-[12px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">Cancel</button>
            </div>
          </div>
        )}

        <table className="w-full border-collapse">
          <thead><tr>
            {['Date','Type','Amount','Cumulative Called','Notes',''].map(h => (
              <th key={h} className="text-[11px] font-medium text-[#6b6860] text-left px-4 py-2.5 border-b border-[#e8e6df] bg-[#f9f8f5]">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {txns.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[12.5px] text-[#9b9890]">No capital calls yet. Click "Add Capital Call" to record the first installment.</td></tr>
            ) : txns.map((t, i) => {
              const cumulative = txns.slice(0, i + 1).filter(x => x.type === 'Capital Call').reduce((s, x) => s + x.amount, 0);
              return (
                <tr key={t.id} className="hover:bg-[#f9f8f5] transition-colors">
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860]">{t.date}</td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${t.type === 'Capital Call' ? 'bg-blue-50 text-blue-700' : t.type === 'Distribution' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{t.type}</span>
                  </td>
                  <td className={`px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px] font-medium ${t.type === 'Capital Call' ? 'text-[#1a1917]' : 'text-green-600'}`}>
                    {t.type === 'Distribution' ? '+' : ''}{fmtFull(t.amount)}
                  </td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px] text-[#6b6860]">{fmtFull(cumulative)}</td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860]">{t.notes || '—'}</td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                    <button onClick={() => handleDeleteTxn(t.id)} className="text-[11px] text-red-500 hover:text-red-700 transition-colors">Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* LP Details */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[15px] font-semibold">Investor Details</h2>
          {editing && (
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors disabled:opacity-60 flex items-center gap-1.5">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {editing ? (
            <>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Name</label>
                <input value={form.name} onChange={set('name')} className={inputCls} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Email</label>
                <input type="email" value={form.email} onChange={set('email')} className={inputCls} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Phone</label>
                <input type="tel" value={form.phone} onChange={set('phone')} className={inputCls} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Commitment ($)</label>
                <input type="number" value={form.commitment} onChange={set('commitment')} className={inputCls} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Address Line 1</label>
                <input value={form.addressLine1} onChange={set('addressLine1')} className={inputCls} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Address Line 2</label>
                <input value={form.addressLine2} onChange={set('addressLine2')} className={inputCls} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">City</label>
                <input value={form.city} onChange={set('city')} className={inputCls} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">State / ZIP</label>
                <div className="flex gap-2">
                  {isUSA ? (
                    <select value={form.state} onChange={set('state')} className={inputCls + ' w-[160px] min-w-[160px]'}>
                      <option value="">— State —</option>
                      {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <input value={form.state} onChange={set('state')} placeholder="State / Province" className={inputCls + ' flex-1'} />
                  )}
                  <input value={form.zip} onChange={set('zip')} placeholder="ZIP" className={inputCls + ' w-28'} />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Country</label>
                <select value={form.country} onChange={set('country')} className={inputCls}>
                  <option value="USA">USA</option>
                  <option value="India">India</option>
                  <option value="UK">UK</option>
                  <option value="Canada">Canada</option>
                  <option value="Singapore">Singapore</option>
                  <option value="UAE">UAE</option>
                  <option value="Australia">Australia</option>
                  <option value="Germany">Germany</option>
                  <option value="France">France</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">Notes</label>
                <textarea value={form.notes} onChange={set('notes')} rows={2} className={inputCls + ' resize-y'} />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#9b9890] mb-1">GP Contact</label>
                <input value={form.gp_contact} onChange={set('gp_contact')} placeholder="e.g. Mohan Verma" className={inputCls} />
              </div>
            </>
          ) : (
            <>
              {[
                { label: 'Name',       value: lp.name },
                { label: 'Email',      value: lp.email || '—' },
                { label: 'Phone',      value: lp.phone || '—' },
                { label: 'Type',       value: lp.type },
                { label: 'Entity Name', value: (() => { const m = lp.notes?.match(/^(Institution|Family Office|Corporate):\s*([^\n|]+)/); return m ? m[2].trim() : '—'; })() },
                { label: 'Commitment', value: fmtFull(lp.commitment) },
                { label: 'Join Date',  value: lp.join_date || '—' },
                { label: 'Address',    value: [lp.address_line1, lp.address_line2, lp.city, lp.state, lp.zip, lp.country].filter(Boolean).join(', ') || '—' },
                { label: 'GP Contact', value: lp.gp_contact || '—' },
                { label: 'Notes',      value: lp.notes?.replace(/^(Institution|Family Office|Corporate):[^\n|]+[\n|]?\s*/, '') || '—' },
              ].map(row => (
                <div key={row.label} className="border-b border-[#f0f0ed] pb-3">
                  <div className="text-[11.5px] text-[#9b9890] mb-0.5">{row.label}</div>
                  <div className="text-[13px] font-medium">{row.value}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {activeTab === 'details' && (<>

      {/* Danger Zone */}
      <div className="bg-white border border-red-200 rounded-xl p-6 mt-5">
        <h2 className="text-[15px] font-semibold text-red-600 mb-1">Danger Zone</h2>
        <p className="text-[12px] text-[#9b9890] mb-4">Delete this LP record. Only possible if no capital calls have been recorded.</p>
        {txns.length > 0 ? (
          <div className="bg-red-50 border border-red-200 rounded-[7px] px-4 py-3 text-[12.5px] text-red-700">
            ⛔ Cannot delete — this LP has {txns.length} capital call{txns.length !== 1 ? 's' : ''} recorded. Remove all capital calls first before deleting the LP.
          </div>
        ) : !showDelete ? (
          <button onClick={() => setShowDelete(true)} className="px-4 py-2 rounded-[7px] text-[12.5px] font-medium border border-red-300 text-red-600 bg-white hover:bg-red-50 transition-colors">
            Delete This LP
          </button>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-[7px] p-4">
            <p className="text-[12.5px] text-red-700 font-medium mb-1">Are you sure you want to delete <strong>{lp?.name}</strong>?</p>
            <p className="text-[12px] text-red-500 mb-3">This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowDelete(false)} className="px-3 py-1.5 rounded-[7px] text-[12px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="px-3 py-1.5 rounded-[7px] text-[12px] font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center gap-1.5">
                {deleting ? (<><svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Deleting...</>) : 'Yes, Delete LP'}
              </button>
            </div>
          </div>
        )}
      </div>

      </>)}

      {activeTab === 'documents' && (
        <div>
          {/* Upload section */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[15px] font-semibold">LP Documents</h2>
              <p className="text-[12px] text-[#6b6860] mt-0.5">LPA, K-1s, quarterly reports and other LP-specific documents</p>
            </div>
            <button onClick={() => setShowUploadForm(!showUploadForm)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">
              ↑ Upload Document
            </button>
          </div>

          {showUploadForm && (
            <div className="bg-white border border-[#e8e6df] rounded-xl p-4 mb-4">
              <h3 className="text-[13.5px] font-semibold mb-3">Upload Document</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[12px] font-medium mb-1">Document Type</label>
                  <select value={uploadForm.doc_type} onChange={e => setUploadForm(f => ({...f, doc_type: e.target.value}))}
                    className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3]">
                    {LP_DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium mb-1">Notes (optional)</label>
                  <input value={uploadForm.notes} onChange={e => setUploadForm(f => ({...f, notes: e.target.value}))}
                    placeholder="e.g. FY2024 K-1"
                    className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3]" />
                </div>
              </div>
              <div className="border-2 border-dashed border-[#e8e6df] rounded-xl p-4 text-center mb-3 cursor-pointer hover:border-[#2d5be3] hover:bg-[#f0f4ff] transition-all"
                onClick={() => document.getElementById('lp-doc-upload')?.click()}>
                {uploadFile ? (
                  <p className="text-[13px] text-[#2d5be3] font-medium">{uploadFile.name} ({formatFileSize(uploadFile.size)})</p>
                ) : (
                  <>
                    <p className="text-[13px] text-[#6b6860]">Click to select file</p>
                    <p className="text-[11.5px] text-[#9b9890] mt-0.5">PDF, Word, Excel, images supported</p>
                  </>
                )}
                <input id="lp-doc-upload" type="file" className="hidden"
                  onChange={e => setUploadFile(e.target.files?.[0] ?? null)} />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowUploadForm(false); setUploadFile(null); }}
                  className="px-4 py-1.5 rounded-[7px] text-[12.5px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5]">Cancel</button>
                <button onClick={handleUploadDoc} disabled={uploadingDoc || !uploadFile}
                  className="px-4 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] disabled:opacity-60">
                  {uploadingDoc ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </div>
          )}

          {/* Search + filter */}
          <div className="flex gap-2 mb-3">
            <input value={docSearch} onChange={e => setDocSearch(e.target.value)}
              placeholder="Search documents…"
              className="flex-1 px-3 py-1.5 rounded-[7px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3]" />
            <select value={docTypeFilter} onChange={e => setDocTypeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-[7px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3]">
              <option>All Types</option>
              {LP_DOC_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          {/* Document list */}
          {docsLoading ? (
            <div className="text-center py-10 text-[12.5px] text-[#9b9890]">Loading…</div>
          ) : (() => {
            const filtered = docs
              .filter(d => docTypeFilter === 'All Types' || d.doc_type === docTypeFilter)
              .filter(d => !docSearch || d.name.toLowerCase().includes(docSearch.toLowerCase()));
            if (filtered.length === 0) return (
              <div className="bg-white border border-[#e8e6df] rounded-xl p-10 text-center">
                <div className="text-[32px] mb-2">📄</div>
                <div className="text-[13px] font-medium mb-1">{docs.length === 0 ? 'No documents yet' : 'No documents match your filter'}</div>
                <p className="text-[12px] text-[#9b9890]">{docs.length === 0 ? 'Upload LPA, K-1s, quarterly reports and other LP-specific documents' : 'Try a different filter'}</p>
              </div>
            );
            return (
              <div className="space-y-2">
                {filtered.map(doc => (
                  <div key={doc.id} className="bg-white border border-[#e8e6df] rounded-xl px-4 py-3 flex items-center justify-between hover:bg-[#f9f8f5] transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-[20px]">
                        {doc.file_type?.includes('pdf') ? '📕' : doc.file_type?.includes('word') || doc.file_path.endsWith('.docx') ? '📘' : doc.file_type?.includes('sheet') || doc.file_path.endsWith('.xlsx') ? '📗' : '📄'}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium truncate">{doc.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={'px-1.5 py-0.5 rounded text-[10px] font-medium ' + (DOC_TYPE_COLORS[doc.doc_type] ?? 'bg-gray-100 text-gray-600')}>
                            {doc.doc_type}
                          </span>
                          <span className="text-[11px] text-[#9b9890]">{formatFileSize(doc.file_size)}</span>
                          <span className="text-[11px] text-[#9b9890]">{new Date(doc.created_at).toLocaleDateString()}</span>
                          {doc.notes && <span className="text-[11px] text-[#6b6860] truncate">{doc.notes}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
                      <button onClick={() => handleViewDoc(doc)}
                        className="px-2.5 py-1 rounded-[6px] text-[11.5px] border border-[#e8e6df] bg-white hover:bg-[#f0f4ff] text-[#2d5be3] transition-colors">
                        View
                      </button>
                      <button onClick={() => handleDownloadDoc(doc)}
                        className="px-2.5 py-1 rounded-[6px] text-[11.5px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                        ↓
                      </button>
                      <button onClick={() => handleDeleteDoc(doc)}
                        className="px-2.5 py-1 rounded-[6px] text-[11.5px] border border-red-200 bg-white hover:bg-red-50 text-red-500 transition-colors">
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

    </div>
  );
}
