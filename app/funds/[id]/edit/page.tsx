'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getFundById, updateFund, deleteFund, getCompaniesByFund, getLPsByFund, DbFund } from '@/lib/db';

const SECTORS = [
  'Healthcare Tech','Fintech','SpaceTech','B2B SaaS','AI / ML',
  'CleanTech','EdTech','Consumer Tech','DeepTech','Cybersecurity',
  'Logistics','PropTech','AgTech','Robotics','Blockchain',
];

export default function EditFundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const router = useRouter();

  const [fund, setFund] = useState<DbFund | null>(null);
  const [companyCount, setCompanyCount] = useState(0);
  const [lpCount, setLpCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: '', committed: '', vintage: '', fundLife: '',
    status: 'Active', focus: '', managementFee: '2',
    carriedInterest: '20', hurdleRate: '8',
    targetSize: '', description: '', startDate: '',
  });

  useEffect(() => {
    async function load() {
      try {
        const [f, companies, lps] = await Promise.all([
          getFundById(id),
          getCompaniesByFund(id),
          getLPsByFund(id),
        ]);
        if (!f) return;
        setFund(f);
        setCompanyCount(companies.length);
        setLpCount(lps.length);
        setForm({
          name:            f.name,
          committed:       String(f.committed),
          vintage:         String(f.vintage),
          fundLife:        String(f.fund_life),
          status:          f.status,
          focus:           (f.focus ?? []).join(', '),
          managementFee:   String(f.management_fee),
          carriedInterest: String(f.carried_interest),
          hurdleRate:      String(f.hurdle_rate),
          targetSize:      f.target_size ? String(f.target_size) : '',
          description:     f.description ?? '',
          startDate:       f.start_date ?? '',
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const set = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const toggleSector = (s: string) => {
    const current = form.focus.split(',').map(x => x.trim()).filter(Boolean);
    const next = current.includes(s)
      ? current.filter(x => x !== s).join(', ')
      : [...current, s].join(', ');
    setForm(f => ({ ...f, focus: next }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Fund name is required';
    if (!form.committed || Number(form.committed) <= 0) e.committed = 'Enter a valid amount';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Re-fetch live counts from Supabase right before deleting — never trust stale state
      const [freshCompanies, freshLPs] = await Promise.all([
        getCompaniesByFund(id),
        getLPsByFund(id),
      ]);
      if (freshCompanies.length > 0 || freshLPs.length > 0) {
        setErrors({
          _: `Cannot delete fund: please remove ${freshCompanies.length > 0 ? `${freshCompanies.length} portfolio compan${freshCompanies.length === 1 ? 'y' : 'ies'}` : ''}${freshCompanies.length > 0 && freshLPs.length > 0 ? ' and ' : ''}${freshLPs.length > 0 ? `${freshLPs.length} limited partner${freshLPs.length === 1 ? '' : 's'}` : ''} first.`
        });
        setShowDelete(false);
        setDeleting(false);
        return;
      }
      await deleteFund(id);
      router.push('/funds');
    } catch (err: any) {
      setErrors({ _: err.message ?? 'Failed to delete fund' });
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await updateFund(id, {
        name:             form.name.trim(),
        committed:        Number(form.committed),
        vintage:          Number(form.vintage),
        fund_life:        Number(form.fundLife),
        status:           form.status as 'Active' | 'Fundraising' | 'Closed',
        focus:            form.focus.split(',').map((s: string) => s.trim()).filter(Boolean),
        management_fee:   Number(form.managementFee),
        carried_interest: Number(form.carriedInterest),
        hurdle_rate:      Number(form.hurdleRate),
        target_size:      form.targetSize ? Number(form.targetSize) : undefined,
        description:      form.description || undefined,
        start_date:       form.startDate || undefined,
      });
      router.push('/funds/' + id);
    } catch (err: any) {
      setErrors({ _: err.message ?? 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = (field: string) =>
    'w-full px-3 py-2.5 rounded-[7px] border text-[13px] font-sans outline-none transition-colors ' +
    (errors[field]
      ? 'border-red-400 bg-red-50'
      : 'border-[#e8e6df] bg-white focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10');

  const readOnlyCls = 'w-full px-3 py-2.5 rounded-[7px] border border-[#e8e6df] bg-[#f9f8f5] text-[13px] text-[#9b9890] cursor-not-allowed';

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-[#6b6860]">
      <svg className="animate-spin w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      Loading fund...
    </div>
  );

  if (!fund) return (
    <div className="p-8 text-center">
      <p className="text-[#9b9890] mb-3">Fund not found.</p>
      <Link href="/funds" className="text-[#2d5be3] hover:underline">← Back to Funds</Link>
    </div>
  );

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={'/funds/' + id} className="w-7 h-7 flex items-center justify-center rounded-full border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors text-[#6b6860]">←</Link>
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Edit Fund</h1>
          <p className="text-[12.5px] text-[#6b6860] mt-0.5">{fund.name}</p>
        </div>
      </div>

      {errors._ && (
        <div className="bg-red-50 border border-red-200 rounded-[7px] px-4 py-3 text-[12.5px] text-red-700 mb-4">
          {errors._}
        </div>
      )}

      {/* Fund Details */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-6 mb-4">
        <h2 className="text-[15px] font-semibold mb-5">Fund Details</h2>

        <div className="mb-5">
          <label className="block text-[13px] font-medium mb-1">Fund Name <span className="text-red-500">*</span></label>
          <input type="text" value={form.name} onChange={set('name')} className={inputCls('name')} />
          {errors.name && <p className="text-[11px] text-red-500 mt-1">{errors.name}</p>}
        </div>

        <div className="mb-5">
          <label className="block text-[13px] font-medium mb-1">Target Fund Size</label>
          <input type="number" value={form.targetSize} onChange={set('targetSize')} placeholder="e.g., 10000000" className={inputCls('targetSize')} />
          <p className="text-[11.5px] text-[#9b9890] mt-1">Your GP fundraising goal — shown on the fund card</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-[13px] font-medium mb-1">Commitment Amount <span className="text-red-500">*</span></label>
            <input type="number" value={form.committed} onChange={set('committed')} className={inputCls('committed')} />
            {errors.committed && <p className="text-[11px] text-red-500 mt-1">{errors.committed}</p>}
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1">Currency</label>
            <input value="USD ($)" readOnly className={readOnlyCls} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-5">
          <div>
            <label className="block text-[13px] font-medium mb-1">Vintage Year</label>
            <input type="number" value={form.vintage} onChange={set('vintage')} min="2000" max="2030" className={inputCls('vintage')} />
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1">Fund Life (Years)</label>
            <input type="number" value={form.fundLife} onChange={set('fundLife')} min="1" max="20" className={inputCls('fundLife')} />
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1">Status</label>
            <select value={form.status} onChange={set('status')} className={inputCls('status')}>
              <option value="Fundraising">Fundraising</option>
              <option value="Active">Active</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-[13px] font-medium mb-1">Investment Focus</label>
          <input type="text" value={form.focus} onChange={set('focus')} placeholder="e.g., B2B SaaS, Healthcare Tech" className={inputCls('focus')} />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {SECTORS.map(s => {
              const active = form.focus.split(',').map(x => x.trim()).includes(s);
              return (
                <button key={s} type="button" onClick={() => toggleSector(s)}
                  className={'px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all ' +
                    (active ? 'bg-[#2d5be3] text-white border-[#2d5be3]' : 'bg-white text-[#6b6860] border-[#e8e6df] hover:border-[#2d5be3] hover:text-[#2d5be3]')}>
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-medium mb-1">Description</label>
          <textarea value={form.description} onChange={set('description')} rows={4}
            className={inputCls('description') + ' resize-y'} placeholder="Strategy, stage, geography..." />
        </div>
      </div>

      {/* Fee Structure */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-6 mb-4">
        <h2 className="text-[15px] font-semibold mb-1">Fee Structure</h2>
        <p className="text-[12px] text-[#9b9890] mb-5">Standard fee arrangements for this fund</p>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Management Fee',   key: 'managementFee',   hint: 'Typically 2% per year' },
            { label: 'Carried Interest', key: 'carriedInterest', hint: 'Typically 20%' },
            { label: 'Hurdle Rate',      key: 'hurdleRate',      hint: 'Typically 8%' },
          ].map(({ label, key, hint }) => (
            <div key={key}>
              <label className="block text-[13px] font-medium mb-1">{label}</label>
              <div className="relative">
                <input type="number" step="0.25" value={(form as any)[key]} onChange={set(key)} className={inputCls(key) + ' pr-7'} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[13px]">%</span>
              </div>
              <p className="text-[11.5px] text-[#9b9890] mt-1">{hint}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Read-only derived data */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-6 mb-6">
        <h2 className="text-[15px] font-semibold mb-1">Derived Data</h2>
        <p className="text-[12px] text-[#9b9890] mb-5">Calculated automatically from other tabs — not editable here.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[13px] font-medium mb-1 text-[#9b9890]">Portfolio Companies</label>
            <input value={`${companyCount} companies (from Portfolio tab)`} readOnly className={readOnlyCls} />
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1 text-[#9b9890]">Limited Partners</label>
            <input value={`${lpCount} LPs (from Limited Partners tab)`} readOnly className={readOnlyCls} />
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1 text-[#9b9890]">Invested Capital</label>
            <input value={`$${fund.invested.toLocaleString()} (from transactions)`} readOnly className={readOnlyCls} />
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1 text-[#9b9890]">NAV / Portfolio Value</label>
            <input value={`$${fund.nav.toLocaleString()} (from valuations)`} readOnly className={readOnlyCls} />
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white border border-red-200 rounded-xl p-6 mb-6">
        <h2 className="text-[15px] font-semibold text-red-600 mb-1">Danger Zone</h2>
        <p className="text-[12px] text-[#9b9890] mb-4">
          Permanently delete this fund. This action cannot be undone.
        </p>

        {/* Blocked message — shown when fund has dependencies */}
        {(companyCount > 0 || lpCount > 0) && (
          <div className="bg-red-50 border border-red-200 rounded-[7px] p-4 mb-4">
            <p className="text-[12.5px] text-red-700 font-semibold mb-1">⛔ This fund cannot be deleted</p>
            <p className="text-[12px] text-red-600 mb-2">You must remove the following before deleting this fund:</p>
            <ul className="text-[12px] text-red-600 space-y-1">
              {companyCount > 0 && (
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  {companyCount} portfolio compan{companyCount === 1 ? 'y' : 'ies'} — remove from the Portfolio tab first
                </li>
              )}
              {lpCount > 0 && (
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  {lpCount} limited partner{lpCount === 1 ? '' : 's'} — remove from the Limited Partners tab first
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Delete button — only shown when fund is empty */}
        {companyCount === 0 && lpCount === 0 && (
          !showDelete ? (
            <button
              onClick={() => setShowDelete(true)}
              className="px-4 py-2 rounded-[7px] text-[12.5px] font-medium border border-red-300 text-red-600 bg-white hover:bg-red-50 transition-colors">
              Delete This Fund
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-[7px] p-4">
              <p className="text-[12.5px] text-red-700 font-medium mb-1">
                Are you sure you want to permanently delete <strong>{fund?.name}</strong>?
              </p>
              <p className="text-[12px] text-red-500 mb-3">This cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDelete(false)}
                  className="px-3 py-1.5 rounded-[7px] text-[12px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 rounded-[7px] text-[12px] font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center gap-1.5">
                  {deleting ? (
                    <><svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>Deleting...</>
                  ) : 'Yes, Delete Fund'}
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-between pb-8">
        <Link href={'/funds/' + id} className="px-5 py-2 rounded-[7px] text-[13px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
          Cancel
        </Link>
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2 rounded-[7px] text-[13px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
          {saving ? (
            <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>Saving...</>
          ) : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
