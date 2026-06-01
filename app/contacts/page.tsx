'use client';
// app/contacts/page.tsx

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { can } from '@/lib/rbac';
import * as XLSX from 'xlsx';

type Fund = { id: string; name: string };
type Contact = {
  id: string;
  fund_id: string;
  contact_type: 'company' | 'lp';
  company_id?: string;
  company_name?: string;
  lp_id?: string;
  lp_name?: string;
  first_name: string;
  last_name: string;
  title?: string;
  email?: string;
  phone?: string;
  notes?: string;
  created_at: string;
  isPrimary?: boolean; // derived from company/LP record
};

type DbCompanyRaw = {
  id: string; fund_id: string; name: string;
  contact_name?: string; contact_email?: string; contact_phone?: string;
};
type DbLPRaw = {
  id: string; fund_id: string; name: string;
  email?: string; phone?: string;
};

type Tab = 'company' | 'lp';

const inputCls = 'w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 bg-white';

export default function ContactsPage() {
  const { role } = useAuth();
  const canWrite = can.editCompany(role ?? undefined);

  const [tab, setTab]               = useState<Tab>('company');
  const [funds, setFunds]           = useState<Fund[]>([]);
  const [contacts, setContacts]     = useState<Contact[]>([]);
  const [loading, setLoading]       = useState(true);
  const [fundFilter, setFundFilter] = useState('all');
  const [search, setSearch]         = useState('');
  const [showAdd, setShowAdd]       = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting]   = useState(false);
  const [importError, setImportError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null);

  // Company/LP options for the add form
  const [companies, setCompanies]   = useState<DbCompanyRaw[]>([]);
  const [lps, setLps]               = useState<DbLPRaw[]>([]);

  const [form, setForm] = useState({
    fund_id: '', entity_id: '', first_name: '', last_name: '',
    title: '', email: '', phone: '', notes: '',
  });

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: fundsData }, { data: contactsData }, { data: companiesData }, { data: lpsData }] = await Promise.all([
      supabase.from('funds').select('id, name').order('name'),
      supabase.from('contacts').select('*').order('created_at', { ascending: false }),
      supabase.from('companies').select('id, name, fund_id, contact_name, contact_email, contact_phone').order('name'),
      supabase.from('lps').select('id, name, fund_id, email, phone').order('name'),
    ]);

    setFunds(fundsData ?? []);
    setCompanies((companiesData ?? []) as DbCompanyRaw[]);
    setLps((lpsData ?? []) as DbLPRaw[]);

    // Build primary contacts derived from companies
    const primaryCompanyContacts: Contact[] = ((companiesData ?? []) as DbCompanyRaw[])
      .filter(c => c.contact_name)
      .map(c => {
        const nameParts = (c.contact_name ?? '').trim().split(' ');
        return {
          id: `primary-company-${c.id}`,
          fund_id: c.fund_id,
          contact_type: 'company' as const,
          company_id: c.id,
          company_name: c.name,
          first_name: nameParts[0] ?? '',
          last_name: nameParts.slice(1).join(' ') ?? '',
          title: 'Primary Contact',
          email: c.contact_email,
          phone: c.contact_phone,
          created_at: new Date(0).toISOString(),
          isPrimary: true,
        };
      });

    // Build primary contacts derived from LPs
    const primaryLPContacts: Contact[] = ((lpsData ?? []) as DbLPRaw[])
      .filter(l => l.email || l.phone)
      .map(l => ({
        id: `primary-lp-${l.id}`,
        fund_id: l.fund_id,
        contact_type: 'lp' as const,
        lp_id: l.id,
        lp_name: l.name,
        first_name: l.name,
        last_name: '',
        title: 'Primary Contact',
        email: l.email,
        phone: l.phone,
        created_at: new Date(0).toISOString(),
        isPrimary: true,
      }));

    // Merge: primary contacts first, then additional contacts from contacts table
    const additional = (contactsData ?? []) as Contact[];
    setContacts([...primaryCompanyContacts, ...primaryLPContacts, ...additional]);
    setLoading(false);
  }

  // Filtered contacts
  const filtered = contacts.filter(c => {
    if (c.contact_type !== tab) return false;
    if (fundFilter !== 'all' && c.fund_id !== fundFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.first_name.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.company_name?.toLowerCase().includes(q) ||
        c.lp_name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function handleSave() {
    if (!form.first_name.trim()) return;
    setSaving(true);
    try {
      const entityField = tab === 'company'
        ? { company_id: form.entity_id, company_name: companies.find(c => c.id === form.entity_id)?.name }
        : { lp_id: form.entity_id, lp_name: lps.find(l => l.id === form.entity_id)?.name };

      const payload = {
        fund_id: form.fund_id,
        contact_type: tab,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        title: form.title.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
        ...entityField,
      };

      if (editContact) {
        await supabase.from('contacts').update(payload as any).eq('id', editContact.id);
      } else {
        await supabase.from('contacts').insert(payload as any);
      }

      setShowAdd(false);
      setEditContact(null);
      resetForm();
      await loadAll();
      setSuccessMsg(editContact ? 'Contact updated' : 'Contact added');
      setTimeout(() => setSuccessMsg(''), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteContact) return;
    await supabase.from('contacts').delete().eq('id', deleteContact.id);
    setDeleteContact(null);
    await loadAll();
  }

  function resetForm() {
    setForm({ fund_id: '', entity_id: '', first_name: '', last_name: '', title: '', email: '', phone: '', notes: '' });
  }

  function openEdit(c: Contact) {
    setEditContact(c);
    setForm({
      fund_id: c.fund_id,
      entity_id: (c.company_id ?? c.lp_id) || '',
      first_name: c.first_name,
      last_name: c.last_name,
      title: c.title ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      notes: c.notes ?? '',
    });
    setShowAdd(true);
  }

  // Export to CSV
  function handleExport() {
    const rows = filtered.map(c => ({
      'Fund': funds.find(f => f.id === c.fund_id)?.name ?? '',
      [tab === 'company' ? 'Company' : 'LP']: c.company_name ?? c.lp_name ?? '',
      'First Name': c.first_name,
      'Last Name': c.last_name,
      'Title': c.title ?? '',
      'Email': c.email ?? '',
      'Phone': c.phone ?? '',
      'Notes': c.notes ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
    XLSX.writeFile(wb, `${tab}-contacts.xlsx`);
  }

  // Download template
  function handleDownloadTemplate() {
    const entityCol = tab === 'company' ? 'Company Name' : 'LP Name';
    const headers = ['Fund Name', entityCol, 'First Name', 'Last Name', 'Title', 'Email', 'Phone', 'Notes'];

    // Pre-fill with existing entities
    const entities = tab === 'company'
      ? companies.filter(c => fundFilter === 'all' || c.fund_id === fundFilter)
      : lps.filter(l => fundFilter === 'all' || l.fund_id === fundFilter);

    const rows = entities.map(e => ({
      'Fund Name': funds.find(f => f.id === e.fund_id)?.name ?? '',
      [entityCol]: e.name,
      'First Name': '',
      'Last Name': '',
      'Title': '',
      'Email': '',
      'Phone': '',
      'Notes': '',
    }));

    // Add example row
    rows.unshift({
      'Fund Name': funds[0]?.name ?? 'Fund Name',
      [entityCol]: entities[0]?.name ?? (tab === 'company' ? 'Company Name' : 'LP Name'),
      'First Name': 'John',
      'Last Name': 'Doe',
      'Title': 'CEO',
      'Email': 'john@example.com',
      'Phone': '+1234567890',
      'Notes': 'Primary contact',
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, `${tab}-contacts-template.xlsx`);
  }

  // Import from Excel
  async function handleImport() {
    if (!importFile) return;
    setImporting(true);
    setImportError('');
    try {
      const buf = await importFile.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws) as any[];

      const entityCol = tab === 'company' ? 'Company Name' : 'LP Name';
      const toInsert = [];

      for (const row of rows) {
        const fundName = row['Fund Name']?.trim();
        const entityName = row[entityCol]?.trim();
        const firstName = row['First Name']?.trim();
        if (!firstName) continue;

        const fund = funds.find(f => f.name.toLowerCase() === fundName?.toLowerCase());
        const entity = tab === 'company'
          ? companies.find(c => c.name.toLowerCase() === entityName?.toLowerCase())
          : lps.find(l => l.name.toLowerCase() === entityName?.toLowerCase());

        toInsert.push({
          fund_id: fund?.id ?? funds[0]?.id,
          contact_type: tab,
          ...(tab === 'company'
            ? { company_id: entity?.id, company_name: entityName }
            : { lp_id: entity?.id, lp_name: entityName }),
          first_name: firstName,
          last_name: row['Last Name']?.trim() ?? '',
          title: row['Title']?.trim() || null,
          email: row['Email']?.trim() || null,
          phone: row['Phone']?.trim() || null,
          notes: row['Notes']?.trim() || null,
        });
      }

      if (toInsert.length === 0) throw new Error('No valid rows found in file');

      const { error } = await supabase.from('contacts').insert(toInsert);
      if (error) throw error;

      setShowImport(false);
      setImportFile(null);
      await loadAll();
      setSuccessMsg(`Imported ${toInsert.length} contacts`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setImportError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  const entityOptions = tab === 'company'
    ? companies.filter(c => !form.fund_id || c.fund_id === form.fund_id)
    : lps.filter(l => !form.fund_id || l.fund_id === form.fund_id);

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[20px] font-semibold tracking-tight">Contacts & LPs</h1>
      </div>

      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-[8px] px-4 py-3 text-[12.5px] text-green-700 mb-4 flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 flex-shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
          {successMsg}
        </div>
      )}

      {/* CRM section */}
      <div className="bg-white border border-[#e8e6df] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#e8e6df]">
          <div className="text-[16px] font-semibold">CRM</div>
          <p className="text-[12.5px] text-[#9b9890] mt-0.5">Manage portfolio company and investor contacts</p>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-[#e8e6df] flex items-center gap-3 flex-wrap">
          {/* Tabs */}
          <div className="flex gap-1 bg-[#f9f8f5] rounded-[8px] p-1">
            {(['company', 'lp'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-[6px] text-[12.5px] font-medium transition-colors ${tab === t ? 'bg-white shadow-sm text-[#1a1915]' : 'text-[#6b6860] hover:text-[#1a1915]'}`}>
                {t === 'company' ? '🏢 Portfolio Company Contacts' : '👥 Investor (LP) Contacts'}
              </button>
            ))}
          </div>

          {/* Fund filter */}
          <select value={fundFilter} onChange={e => setFundFilter(e.target.value)}
            className="px-3 py-1.5 rounded-[7px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3] bg-white">
            <option value="all">All Funds</option>
            {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>

          {/* Search */}
          <div className="flex items-center gap-1.5 bg-[#f9f8f5] border border-[#e8e6df] rounded-[7px] px-3 h-8 flex-1 max-w-[260px]">
            <svg className="w-3 h-3 text-[#9b9890] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              className="border-none bg-transparent outline-none text-[12.5px] w-full placeholder:text-[#9b9890]" />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export
            </button>
            {canWrite && (
              <>
                <button onClick={() => { setShowImport(true); setImportError(''); setImportFile(null); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Import
                </button>
                <button onClick={() => { setShowAdd(true); setEditContact(null); resetForm(); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">
                  + Add
                </button>
              </>
            )}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-[#9b9890] text-[13px]">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="text-2xl mb-2">{tab === 'company' ? '🏢' : '👥'}</div>
            <div className="text-[13.5px] font-medium mb-1">No contacts yet</div>
            <p className="text-[12.5px] text-[#9b9890]">Add contacts manually or import from Excel</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e8e6df] bg-[#fafaf8]">
                  {(tab === 'company'
                    ? ['Company', 'First Name', 'Last Name', 'Email', 'Phone', 'Title', 'Notes', 'Actions']
                    : ['Fund', 'LP / Firm', 'First Name', 'Last Name', 'Email', 'Phone', 'Title', 'Actions']
                  ).map(h => (
                    <th key={h} className="text-left text-[11px] font-semibold text-[#9b9890] tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8e6df]">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-[#fafaf8] transition-colors">
                    {tab === 'company' ? (
                      <>
                        <td className="px-4 py-3 text-[13px] font-medium">{c.company_name ?? '—'}</td>
                        <td className="px-4 py-3 text-[13px]">{c.first_name}</td>
                        <td className="px-4 py-3 text-[13px]">{c.last_name}</td>
                        <td className="px-4 py-3 text-[13px] text-[#2d5be3]">
                          {c.email ? <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a> : '—'}
                        </td>
                        <td className="px-4 py-3 text-[13px]">{c.phone ?? '—'}</td>
                        <td className="px-4 py-3 text-[13px] text-[#6b6860]">{c.title ?? '—'}</td>
                        <td className="px-4 py-3 text-[12px] text-[#9b9890] max-w-[150px] truncate">{c.notes ?? '—'}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-[13px]">{funds.find(f => f.id === c.fund_id)?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-[13px] font-medium">{c.lp_name ?? '—'}</td>
                        <td className="px-4 py-3 text-[13px]">{c.first_name}</td>
                        <td className="px-4 py-3 text-[13px]">{c.last_name}</td>
                        <td className="px-4 py-3 text-[13px] text-[#2d5be3]">
                          {c.email ? <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a> : '—'}
                        </td>
                        <td className="px-4 py-3 text-[13px]">{c.phone ?? '—'}</td>
                        <td className="px-4 py-3 text-[13px] text-[#6b6860]">{c.title ?? '—'}</td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      {c.isPrimary ? (
                        <span className="px-2 py-0.5 rounded-full text-[10.5px] bg-[#f0efe9] text-[#9b9890]">from record</span>
                      ) : canWrite ? (
                        <div className="flex gap-3">
                          <button onClick={() => openEdit(c)} className="text-[11.5px] text-[#2d5be3] hover:underline">Edit</button>
                          <button onClick={() => setDeleteContact(c)} className="text-[11.5px] text-red-500 hover:underline">Delete</button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-[#e8e6df] bg-[#fafaf8] text-[11.5px] text-[#9b9890]">
              {filtered.length} contact{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setShowAdd(false); setEditContact(null); }}/>
          <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-lg w-full mx-4">
            <div className="text-[15px] font-semibold mb-4">{editContact ? 'Edit Contact' : 'Add Contact'}</div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[11.5px] font-medium mb-1">Fund</label>
                <select value={form.fund_id} onChange={e => setForm(f => ({...f, fund_id: e.target.value, entity_id: ''}))} className={inputCls}>
                  <option value="">Select fund…</option>
                  {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11.5px] font-medium mb-1">{tab === 'company' ? 'Company' : 'LP'}</label>
                <select value={form.entity_id} onChange={e => setForm(f => ({...f, entity_id: e.target.value}))} className={inputCls}>
                  <option value="">Select {tab === 'company' ? 'company' : 'LP'}…</option>
                  {entityOptions.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[11.5px] font-medium mb-1">First Name *</label>
                <input value={form.first_name} onChange={e => setForm(f => ({...f, first_name: e.target.value}))}
                  placeholder="Jane" className={inputCls} />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium mb-1">Last Name</label>
                <input value={form.last_name} onChange={e => setForm(f => ({...f, last_name: e.target.value}))}
                  placeholder="Smith" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[11.5px] font-medium mb-1">Title</label>
                <input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))}
                  placeholder="CEO" className={inputCls} />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium mb-1">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))}
                  placeholder="jane@company.com" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[11.5px] font-medium mb-1">Phone</label>
                <input value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))}
                  placeholder="+1 555 000 0000" className={inputCls} />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium mb-1">Notes</label>
                <input value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                  placeholder="Optional notes" className={inputCls} />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => { setShowAdd(false); setEditContact(null); }}
                className="px-4 py-2 rounded-[8px] text-[12.5px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !form.first_name.trim()}
                className="px-4 py-2 rounded-[8px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] disabled:opacity-60 transition-colors">
                {saving ? 'Saving…' : editContact ? 'Update' : 'Add Contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowImport(false)}/>
          <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-md w-full mx-4">
            <div className="text-[15px] font-semibold mb-1">
              Bulk Upload {tab === 'company' ? 'Portfolio Company' : 'Investor (LP)'} Contacts
            </div>
            <p className="text-[12.5px] text-[#9b9890] mb-5">Upload multiple contacts at once using an Excel or CSV file</p>

            {/* Step 1 */}
            <div className="border border-[#e8e6df] rounded-xl p-4 mb-3">
              <div className="text-[13px] font-semibold mb-1">Step 1: Download Template</div>
              <p className="text-[12px] text-[#9b9890] mb-3">
                Download the Excel template pre-filled with your {tab === 'company' ? 'portfolio companies' : 'LPs'}.
              </p>
              <div className="flex gap-2 text-[11px] text-green-600 mb-3">
                <span>✓ Pre-filled with exact {tab === 'company' ? 'company' : 'LP'} names</span>
                <span>✓ Example row included</span>
                <span>✓ Instructions included</span>
              </div>
              <button onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[7px] text-[12.5px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download Template ({tab === 'company' ? companies.length : lps.length} rows)
              </button>
            </div>

            {/* Step 2 */}
            <div className="border border-[#e8e6df] rounded-xl p-4 mb-4">
              <div className="text-[13px] font-semibold mb-1">Step 2: Upload Your File</div>
              <p className="text-[12px] text-[#9b9890] mb-3">Select your completed Excel or CSV file</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => setImportFile(e.target.files?.[0] ?? null)} />
              <button onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[7px] text-[12.5px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Select File
              </button>
              {importFile && <p className="text-[11.5px] text-green-600 mt-2">✓ {importFile.name}</p>}
              {importError && <p className="text-[11.5px] text-red-500 mt-2">{importError}</p>}
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowImport(false)}
                className="px-4 py-2 rounded-[8px] text-[12.5px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                Cancel
              </button>
              <button onClick={handleImport} disabled={!importFile || importing}
                className="px-4 py-2 rounded-[8px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] disabled:opacity-60 transition-colors">
                {importing ? 'Uploading…' : 'Upload Contacts'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDeleteContact(null)}/>
          <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="text-[14px] font-semibold mb-2">Delete contact?</div>
            <p className="text-[13px] text-[#6b6860] mb-5">
              Remove <span className="font-medium">{deleteContact.first_name} {deleteContact.last_name}</span> from contacts? This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteContact(null)}
                className="px-4 py-2 rounded-[8px] text-[12.5px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">Cancel</button>
              <button onClick={handleDelete}
                className="px-4 py-2 rounded-[8px] text-[12.5px] font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
