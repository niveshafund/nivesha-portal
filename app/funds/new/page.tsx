'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createFund } from '@/lib/db';

const SECTORS = [
  'Healthcare Tech','Fintech','SpaceTech','B2B SaaS','AI / ML',
  'CleanTech','EdTech','Consumer Tech','DeepTech','Cybersecurity',
  'Logistics','PropTech','AgTech','Robotics','Blockchain',
];

const CURRENCIES = ['USD ($)','EUR (€)','GBP (£)','INR (₹)','SGD (S$)','AED (د.إ)'];

type Form = {
  name: string; committed: string; currency: string;
  vintage: string; fundLife: string; status: string;
  focus: string; managementFee: string; carriedInterest: string;
  hurdleRate: string; targetSize: string; startDate: string; description: string;
};

const empty: Form = {
  name: '', committed: '', currency: 'USD ($)',
  vintage: String(new Date().getFullYear()), fundLife: '10',
  status: 'Active', focus: '', managementFee: '2',
  carriedInterest: '20', hurdleRate: '8', targetSize: '', startDate: '', description: '',
};

type Errors = Partial<Record<keyof Form, string>>;

export default function NewFundPage() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(empty);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const set = (k: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const validate = (): boolean => {
    const e: Errors = {};
    if (!form.name.trim())      e.name = 'Fund name is required';
    if (!form.committed.trim()) e.committed = 'Commitment amount is required';
    else if (isNaN(Number(form.committed)) || Number(form.committed) <= 0)
      e.committed = 'Enter a valid positive amount';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await createFund({
        name:             form.name.trim(),
        vintage:          Number(form.vintage),
        target_size:      form.targetSize ? Number(form.targetSize) : undefined,
        committed:        Number(form.committed),
        called:           0,
        invested:         0,
        nav:              0,
        distributions:    0,
        moic:             0,
        irr:              0,
        dpi:              0,
        management_fee:   Number(form.managementFee),
        carried_interest: Number(form.carriedInterest),
        hurdle_rate:      Number(form.hurdleRate),
        fund_life:        Number(form.fundLife),
        currency:         form.currency.split(' ')[0],
        status:           form.status as 'Active' | 'Fundraising' | 'Closed',
        focus:            form.focus.split(',').map((s: string) => s.trim()).filter(Boolean),
        description:      form.description || undefined,
        start_date:       form.startDate || undefined,
      });
      router.push('/funds');
    } catch (err: any) {
      console.error('Create fund error:', err);
      setSaveError(err.message ?? 'Failed to create fund. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = (field: keyof Form) =>
    'w-full px-3 py-2.5 rounded-[7px] border text-[13px] font-sans outline-none transition-colors ' +
    (errors[field]
      ? 'border-red-400 bg-red-50'
      : 'border-[#e8e6df] bg-white focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10');

  const toggleSector = (s: string) => {
    const current = form.focus.split(',').map(x => x.trim()).filter(Boolean);
    const next = current.includes(s)
      ? current.filter(x => x !== s).join(', ')
      : [...current, s].join(', ');
    setForm(f => ({ ...f, focus: next }));
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/funds" className="w-7 h-7 flex items-center justify-center rounded-full border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors text-[#6b6860]">←</Link>
        <h1 className="text-[20px] font-semibold tracking-tight">Create New Fund</h1>
      </div>

      {/* Error banner */}
      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-[7px] px-4 py-3 text-[12.5px] text-red-700 mb-4 flex items-start gap-2">
          <span className="flex-shrink-0 mt-0.5">⚠️</span>
          <span>{saveError}</span>
        </div>
      )}

      {/* Fund Details */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-6 mb-4">
        <h2 className="text-[15px] font-semibold mb-5">Fund Details</h2>

        <div className="mb-5">
          <label className="block text-[13px] font-medium mb-1">Fund Name <span className="text-red-500">*</span></label>
          <input type="text" value={form.name} onChange={set('name')} placeholder="e.g., Nivesha Ventures Fund II" className={inputCls('name')} />
          <p className="text-[11.5px] text-[#9b9890] mt-1">Enter the official name of your fund</p>
          {errors.name && <p className="text-[11px] text-red-500 mt-0.5">{errors.name}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-[13px] font-medium mb-1">Commitment Amount <span className="text-red-500">*</span></label>
            <input type="number" value={form.committed} onChange={set('committed')} placeholder="0" className={inputCls('committed')} />
            <p className="text-[11.5px] text-[#9b9890] mt-1">Total committed capital (e.g., 10000000 for $10M)</p>
            {errors.committed && <p className="text-[11px] text-red-500 mt-0.5">{errors.committed}</p>}
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1">Currency</label>
            <select value={form.currency} onChange={set('currency')} className={inputCls('currency')}>
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <p className="text-[11.5px] text-[#9b9890] mt-1">Base currency for fund accounting</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-5">
          <div>
            <label className="block text-[13px] font-medium mb-1">Vintage Year</label>
            <input type="number" value={form.vintage} onChange={set('vintage')} min="2000" max="2030" className={inputCls('vintage')} />
            <p className="text-[11.5px] text-[#9b9890] mt-1">Year of first capital call</p>
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1">Fund Life (Years)</label>
            <input type="number" value={form.fundLife} onChange={set('fundLife')} min="1" max="20" className={inputCls('fundLife')} />
            <p className="text-[11.5px] text-[#9b9890] mt-1">Expected fund duration (typically 10-12 years)</p>
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1">Status</label>
            <select value={form.status} onChange={set('status')} className={inputCls('status')}>
              <option value="Fundraising">Fundraising</option>
              <option value="Active">Active</option>
              <option value="Closed">Closed</option>
            </select>
            <p className="text-[11.5px] text-[#9b9890] mt-1">Current operational status</p>
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-[13px] font-medium mb-1">Target Fund Size</label>
          <input type="number" value={form.targetSize} onChange={set('targetSize')} placeholder="e.g., 10000000" className={inputCls('targetSize')} />
          <p className="text-[11.5px] text-[#9b9890] mt-1">Your GP fundraising goal — shown on the fund card for internal reference</p>
        </div>

        <div className="mb-5">
          <label className="block text-[13px] font-medium mb-1">Investment Focus</label>
          <input type="text" value={form.focus} onChange={set('focus')} placeholder="e.g., B2B SaaS, Healthcare Tech, Fintech" className={inputCls('focus')} />
          <p className="text-[11.5px] text-[#9b9890] mt-1">Primary sectors or themes (optional)</p>
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
            placeholder="e.g., Early-stage venture fund focused on enterprise software companies..."
            className={inputCls('description') + ' resize-y'} />
          <p className="text-[11.5px] text-[#9b9890] mt-1">Additional details about strategy, stage, geography (optional)</p>
        </div>
      </div>

      {/* Fee Structure */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-6 mb-4">
        <h2 className="text-[15px] font-semibold mb-1">Fee Structure</h2>
        <p className="text-[12px] text-[#9b9890] mb-5">Standard fee arrangements for this fund</p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-[13px] font-medium mb-1">Management Fee</label>
            <div className="relative">
              <input type="number" step="0.25" min="0" max="5" value={form.managementFee} onChange={set('managementFee')} className={inputCls('managementFee') + ' pr-7'} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[13px]">%</span>
            </div>
            <p className="text-[11.5px] text-[#9b9890] mt-1">Typically 2% per year</p>
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1">Carried Interest</label>
            <div className="relative">
              <input type="number" step="1" min="0" max="30" value={form.carriedInterest} onChange={set('carriedInterest')} className={inputCls('carriedInterest') + ' pr-7'} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[13px]">%</span>
            </div>
            <p className="text-[11.5px] text-[#9b9890] mt-1">Typically 20%</p>
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1">Hurdle Rate</label>
            <div className="relative">
              <input type="number" step="1" min="0" max="20" value={form.hurdleRate} onChange={set('hurdleRate')} className={inputCls('hurdleRate') + ' pr-7'} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[13px]">%</span>
            </div>
            <p className="text-[11.5px] text-[#9b9890] mt-1">Typically 8%</p>
          </div>
        </div>
      </div>

      {/* Investment Period */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-6 mb-6">
        <h2 className="text-[15px] font-semibold mb-1">Investment Period</h2>
        <p className="text-[12px] text-[#9b9890] mb-5">When does this fund make investments?</p>
        <div className="max-w-xs">
          <label className="block text-[13px] font-medium mb-1">Start Date</label>
          <input type="month" value={form.startDate} onChange={set('startDate')} className={inputCls('startDate')} />
          <p className="text-[11.5px] text-[#9b9890] mt-1">
            Investment period is typically {Math.ceil(Number(form.fundLife || 10) / 2)} years (half of fund life)
          </p>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-end gap-3 pb-8">
        <Link href="/funds" className="px-5 py-2 rounded-[7px] text-[13px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
          Cancel
        </Link>
        <button onClick={handleSave} disabled={saving}
          className="px-5 py-2 rounded-[7px] text-[13px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
          {saving ? (
            <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>Creating...</>
          ) : 'Create Fund'}
        </button>
      </div>
    </div>
  );
}
