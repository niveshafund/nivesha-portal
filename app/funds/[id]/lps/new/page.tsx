'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createLP, getLPsByFund, getFundMembersByRole, DbFundMember } from '@/lib/db';

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
  'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
  'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
  'Virginia','Washington','West Virginia','Wisconsin','Wyoming','Washington D.C.',
];

const COUNTRIES = [
  'USA','India','United Kingdom','Canada','Australia','Singapore','Germany',
  'France','Netherlands','Israel','Sweden','Switzerland','UAE','Japan',
  'South Korea','Brazil','Mexico','South Africa','Nigeria','Kenya','Other',
];

const LP_TYPES = ['Individual','Institution','Family Office','Corporate'];

type Form = {
  name: string;
  email: string;
  phone: string;
  type: string;
  commitment: string;
  joinDate: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  notes: string;
  gp_contact: string;
};

const empty: Form = {
  name: '', email: '', phone: '', type: 'Individual',
  commitment: '', joinDate: '',
  addressLine1: '', addressLine2: '', city: '',
  state: '', zip: '', country: 'USA', notes: '', gp_contact: '',
};

export default function AddLPPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: fundId } = React.use(params);
  const router = useRouter();
  const [form, setForm] = useState<Form>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [gps, setGPs] = useState<DbFundMember[]>([]);

  // Load GPs for this fund dynamically from fund_members
  useEffect(() => {
    getFundMembersByRole(fundId, 'GP')
      .then(setGPs)
      .catch(() => setGPs([]));
  }, [fundId]);

  const set = (k: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!form.name.trim())       e.name = 'Investor name is required';
    if (!form.commitment.trim()) e.commitment = 'Commitment amount is required';
    else if (isNaN(Number(form.commitment)) || Number(form.commitment) <= 0)
      e.commitment = 'Enter a valid positive amount';
    if (form.email && !/\S+@\S+\.\S+/.test(form.email))
      e.email = 'Enter a valid email address';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const existingLPs = await getLPsByFund(fundId);
      const totalCommitted = existingLPs.reduce((s, lp) => s + lp.commitment, 0) + Number(form.commitment);
      const ownershipPct = totalCommitted > 0 ? (Number(form.commitment) / totalCommitted) * 100 : 0;

      await createLP({
        fund_id:       fundId,
        name:          form.name.trim(),
        email:         form.email || undefined,
        phone:         form.phone || undefined,
        type:          form.type as any,
        commitment:    Number(form.commitment),
        called:        0,
        distributions: 0,
        ownership_pct: ownershipPct,
        status:        'Active',
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
      router.push(`/funds/${fundId}?tab=lps`);
    } catch (err: any) {
      setSaveError(err.message ?? 'Failed to add limited partner');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = (field: keyof Form) =>
    'w-full px-3 py-2.5 rounded-[7px] border text-[13px] font-sans outline-none transition-colors ' +
    (errors[field]
      ? 'border-red-400 bg-red-50'
      : 'border-[#e8e6df] bg-white focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10');

  const selectedGP = gps.find(g => g.name === form.gp_contact);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/funds/${fundId}`} className="w-7 h-7 flex items-center justify-center rounded-full border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors text-[#6b6860]">←</Link>
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Add Limited Partner</h1>
          <p className="text-[12.5px] text-[#6b6860] mt-0.5">Add a new investor to this fund</p>
        </div>
      </div>

      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-[7px] px-4 py-3 text-[12.5px] text-red-700 mb-4">
          ⚠️ {saveError}
        </div>
      )}

      {/* Investor Information */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-6 mb-4">
        <h2 className="text-[15px] font-semibold mb-5">Investor Information</h2>

        <div className="mb-5">
          <label className="block text-[13px] font-medium mb-1">Investor Name <span className="text-red-500">*</span></label>
          <input type="text" value={form.name} onChange={set('name')} placeholder="e.g., Sunil Potti" className={inputCls('name')} />
          {errors.name && <p className="text-[11px] text-red-500 mt-1">{errors.name}</p>}
        </div>

        <div className="mb-5">
          <label className="block text-[13px] font-medium mb-2">Investor Type</label>
          <div className="flex flex-wrap gap-2">
            {LP_TYPES.map(t => (
              <button key={t} type="button" onClick={() => setForm(f => ({ ...f, type: t }))}
                className={'px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border transition-all ' +
                  (form.type === t ? 'bg-[#2d5be3] text-white border-[#2d5be3]' : 'bg-white text-[#6b6860] border-[#e8e6df] hover:border-[#2d5be3]')}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* GP Contact — dynamic from fund_members */}
        <div className="mb-5">
          <label className="block text-[13px] font-medium mb-1">
            GP Contact <span className="text-[#9b9890] font-normal">(optional)</span>
          </label>
          <p className="text-[12px] text-[#9b9890] mb-2">The partner who brought this LP into the fund</p>
          {gps.length === 0 ? (
            <p className="text-[12px] text-[#9b9890] italic">
              No GPs added to this fund yet.{' '}
              <Link href={`/funds/${fundId}?tab=members`} className="text-[#2d5be3] hover:underline">Add GPs in the Members tab →</Link>
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {gps.map(gp => (
                <button
                  key={gp.id}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, gp_contact: f.gp_contact === gp.name ? '' : gp.name }))}
                  className={'px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border transition-all ' +
                    (form.gp_contact === gp.name
                      ? 'bg-[#2d5be3] text-white border-[#2d5be3]'
                      : 'bg-white text-[#6b6860] border-[#e8e6df] hover:border-[#2d5be3]')}
                >
                  {gp.name}
                  {gp.title && <span className="ml-1 opacity-70 text-[10.5px]">· {gp.title}</span>}
                </button>
              ))}
            </div>
          )}
          {selectedGP?.email && (
            <p className="text-[11px] text-[#6b6860] mt-1.5">{selectedGP.email}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-[13px] font-medium mb-1">Email <span className="text-[#9b9890] font-normal">(optional)</span></label>
            <input type="email" value={form.email} onChange={set('email')} placeholder="investor@example.com" className={inputCls('email')} />
            {errors.email && <p className="text-[11px] text-red-500 mt-1">{errors.email}</p>}
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1">Phone <span className="text-[#9b9890] font-normal">(optional)</span></label>
            <input type="tel" value={form.phone} onChange={set('phone')} placeholder="+1 (555) 000-0000" className={inputCls('phone')} />
          </div>
        </div>
      </div>

      {/* Fund Economics */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-6 mb-4">
        <h2 className="text-[15px] font-semibold mb-5">Fund Economics</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[13px] font-medium mb-1">Commitment Amount (USD) <span className="text-red-500">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[13px]">$</span>
              <input type="number" value={form.commitment} onChange={set('commitment')} placeholder="0"
                className={inputCls('commitment') + ' pl-6'} />
            </div>
            {form.commitment && Number(form.commitment) > 0 && (
              <p className="text-[11px] text-[#6b6860] mt-1">${Number(form.commitment).toLocaleString()}</p>
            )}
            {errors.commitment && <p className="text-[11px] text-red-500 mt-1">{errors.commitment}</p>}
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1">Commitment Date <span className="text-[#9b9890] font-normal">(optional)</span></label>
            <input type="date" value={form.joinDate} onChange={set('joinDate')} className={inputCls('joinDate')} />
          </div>
        </div>
      </div>

      {/* Mailing Address */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-6 mb-4">
        <h2 className="text-[15px] font-semibold mb-1">Mailing Address <span className="text-[#9b9890] font-normal text-[13px]">(optional)</span></h2>
        <p className="text-[12px] text-[#9b9890] mb-5">Used for quarterly reports and K-1 tax documents</p>
        <div className="mb-4">
          <label className="block text-[13px] font-medium mb-1">Address Line 1</label>
          <input type="text" value={form.addressLine1} onChange={set('addressLine1')} placeholder="123 Main Street" className={inputCls('addressLine1')} />
        </div>
        <div className="mb-4">
          <label className="block text-[13px] font-medium mb-1">Address Line 2</label>
          <input type="text" value={form.addressLine2} onChange={set('addressLine2')} placeholder="Suite 100, Apt B" className={inputCls('addressLine2')} />
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-[13px] font-medium mb-1">City</label>
            <input type="text" value={form.city} onChange={set('city')} placeholder="San Francisco" className={inputCls('city')} />
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1">State</label>
            <select value={form.state} onChange={set('state')} className={inputCls('state')}>
              <option value="">Select…</option>
              {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1">ZIP Code</label>
            <input type="text" value={form.zip} onChange={set('zip')} placeholder="94105" className={inputCls('zip')} />
          </div>
        </div>
        <div>
          <label className="block text-[13px] font-medium mb-1">Country</label>
          <select value={form.country} onChange={set('country')} className={inputCls('country')}>
            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-6 mb-6">
        <h2 className="text-[15px] font-semibold mb-5">Notes <span className="text-[#9b9890] font-normal text-[13px]">(optional)</span></h2>
        <textarea value={form.notes} onChange={set('notes')} rows={4}
          placeholder="Any additional notes about this investor…"
          className={inputCls('notes') + ' resize-y'} />
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-between pb-8">
        <p className="text-[12px] text-[#9b9890]">Fields marked <span className="text-red-500">*</span> are required</p>
        <div className="flex gap-3">
          <Link href={`/funds/${fundId}`} className="px-5 py-2 rounded-[7px] text-[13px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
            Cancel
          </Link>
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2 rounded-[7px] text-[13px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
            {saving ? (
              <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>Saving...</>
            ) : 'Add Limited Partner'}
          </button>
        </div>
      </div>
    </div>
  );
}
