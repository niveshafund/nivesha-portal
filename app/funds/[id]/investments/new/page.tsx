'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createCompany, createTransaction } from '@/lib/db';

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
  'India','United Kingdom','Canada','Australia','Singapore','Germany','France',
  'Netherlands','Israel','Sweden','Switzerland','UAE','Japan','South Korea',
  'Brazil','Mexico','South Africa','Nigeria','Kenya','Indonesia','Vietnam','Other',
];

const ENTITY_TYPES = ['C Corporation','LLC','Partnership','S Corporation','Other'];
const SECURITY_TYPES = ['SAFE','Convertible Note','Preferred Stock','Common Stock'];
const SAFE_TYPES = [
  'with valuation cap and discount',
  'with valuation cap, no discount',
  'with discount, no valuation cap',
];

const ROUNDS = ['Series Pre-seed','Series Seed','Series A','Series B','Series C','Series D','Series E','Growth Stage','Other'];
const SECTORS = [
  'AI / ML','Healthcare Tech','Fintech','B2B SaaS','SpaceTech','CleanTech',
  'EdTech','Consumer Tech','DeepTech','Cybersecurity','Logistics','PropTech',
  'AgTech','Robotics','Blockchain','GovTech','InsurTech','HRTech','Other',
];

type Form = {
  companyName: string;
  legalName: string;
  entityType: string;
  jurisdictionType: 'US Based' | 'Non-US Based';
  usState: string;
  country: string;
  website: string;
  ceoName: string;
  ceoEmail: string;
  ceoPhone: string;
  securityType: string;
  round: string;
  amount: string;
  valuation: string;
  valuationType: 'Pre-money' | 'Post-money';
  safeType: string;
  discount: string;
  sharePrice: string;
  numShares: string;
  interestRate: string;
  maturityDate: string;
  investmentDate: string;
  headline: string;
  sector: string;
  about: string;
};

const empty: Form = {
  companyName: '',
  legalName: '',
  entityType: 'C Corporation',
  jurisdictionType: 'US Based',
  usState: '',
  country: '',
  website: '',
  ceoName: '',
  ceoEmail: '',
  ceoPhone: '',
  securityType: '',
  round: '',
  amount: '',
  valuation: '',
  valuationType: 'Post-money',
  safeType: 'with valuation cap and discount',
  discount: '',
  sharePrice: '',
  numShares: '',
  interestRate: '',
  maturityDate: '',
  investmentDate: new Date().toISOString().split('T')[0],
  headline: '',
  sector: '',
  about: '',
};

type Errors = Partial<Record<keyof Form, string>>;

// Build investment terms string for the Description column
function buildInvestmentTerms(form: any): string | undefined {
  const parts: string[] = [];
  if (form.securityType === 'SAFE') {
    if (form.safeType) parts.push(form.safeType);
    if (form.discount) parts.push(`${form.discount}% discount`);
  }
  if (form.securityType === 'Convertible Note') {
    if (form.interestRate) parts.push(`${form.interestRate}% interest`);
    if (form.maturityDate) parts.push(`matures ${form.maturityDate}`);
    if (form.discount) parts.push(`${form.discount}% discount`);
  }
  if (form.securityType === 'Preferred Stock' || form.securityType === 'Common Stock') {
    if (form.sharePrice) parts.push(`$${Number(form.sharePrice).toFixed(4)} per share`);
    if (form.numShares) parts.push(`${Number(form.numShares).toLocaleString()} shares`);
  }
  if (form.valuation) {
    const val = Number(form.valuation);
    parts.push(`${form.valuationType} valuation cap: $${val.toLocaleString()}`);
  }
  if (form.round) parts.push(form.round);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export default function CreateInvestmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const router = useRouter();
  const [form, setForm] = useState<Form>(empty);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const set = (k: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const setVal = (k: keyof Form, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const validate = (): boolean => {
    const e: Errors = {};
    if (!form.companyName.trim())  e.companyName = 'Company name is required';
    if (!form.ceoName.trim())  e.ceoName = 'Contact name is required';
    if (!form.ceoEmail.trim()) e.ceoEmail = 'Contact email is required';
    else if (!/\S+@\S+\.\S+/.test(form.ceoEmail)) e.ceoEmail = 'Enter a valid email';
    if (form.jurisdictionType === 'US Based' && !form.usState) e.usState = 'Please select a state';
    if (form.jurisdictionType === 'Non-US Based' && !form.country) e.country = 'Please select a country';
    if (!form.securityType)        e.securityType = 'Please select a security type';
    if (!form.amount.trim())       e.amount = 'Investment amount is required';
    else if (isNaN(Number(form.amount)) || Number(form.amount) <= 0) e.amount = 'Enter a valid amount';
    if (!form.investmentDate)      e.investmentDate = 'Investment date is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      // Step 1 — Create company record
      const company = await createCompany({
        fund_id:         id,
        name:            form.companyName.trim(),
        legal_name:      form.legalName.trim() || undefined,
        sector:          form.sector     || undefined,
        stage:           form.round      || undefined,
        website:         form.website    || undefined,
        status:          'Active',
        entity_type:     form.entityType,
        jurisdiction:    form.jurisdictionType,
        us_state:        form.jurisdictionType === 'US Based'     ? form.usState  : undefined,
        country:         form.jurisdictionType === 'Non-US Based' ? form.country  : undefined,
        contact_name:    form.ceoName  || undefined,
        contact_email:   form.ceoEmail || undefined,
        contact_phone:   form.ceoPhone || undefined,
        security_type:   form.securityType || undefined,
        round:           form.round        || undefined,
        valuation:       form.valuation ? Number(form.valuation) : undefined,
        valuation_type:  form.valuationType,
        investment_date: form.investmentDate || undefined,
        headline:        form.headline || undefined,
        about:           form.about    || undefined,
        notes:           form.securityType === 'SAFE'
          ? `SAFE: ${form.safeType}${form.discount ? ` | Discount: ${form.discount}%` : ''}`
          : undefined,
        invested:        Number(form.amount),
        unrealised:      form.valuation ? Number(form.valuation) : Number(form.amount),
        distributions:   0,
        moic:            form.valuation ? Number(form.valuation) / Number(form.amount) : 1,
        irr:             0,
      });

      // Step 2 — Record investment transaction
      // discount_pct and valuation_cap are now saved as proper numeric columns
      await createTransaction({
        fund_id:       id,
        company_id:    company.id,
        company_name:  form.companyName.trim(),
        date:          form.investmentDate,
        type:          'Investment',
        amount:        Number(form.amount),
        instrument:    (form.securityType as any) || 'Other',
        description:   buildInvestmentTerms(form),
        notes:         form.about || undefined,
        discount_pct:  form.discount ? Number(form.discount) : undefined,
        valuation_cap: form.valuation ? Number(form.valuation) : undefined,
      });

      router.push('/funds/' + id + '?tab=invested');
    } catch (err: any) {
      console.error('Save investment error:', err);
      setErrors({ companyName: err.message ?? 'Failed to save. Please try again.' });
      setSaving(false);
    }
  };

  const inputCls = (field: keyof Form) =>
    'w-full px-3 py-2.5 rounded-[7px] border text-[13px] font-sans outline-none transition-colors ' +
    (errors[field]
      ? 'border-red-400 bg-red-50'
      : 'border-[#e8e6df] bg-white focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10');

  const SectionHeader = ({ num, title, sub }: { num: number; title: string; sub: string }) => (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-6 h-6 rounded-full bg-[#2d5be3] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{num}</div>
      <div><div className="text-[14px] font-semibold">{title}</div><div className="text-[12px] text-[#9b9890]">{sub}</div></div>
    </div>
  );

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/funds/${id}`} className="w-7 h-7 flex items-center justify-center rounded-full border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors text-[#6b6860]">←</Link>
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">New Company Investment</h1>
          <p className="text-[12.5px] text-[#6b6860] mt-0.5">Record a new portfolio company and initial investment</p>
        </div>
      </div>

      {/* SECTION 1 — Company Details */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-6 mb-4">
        <SectionHeader num={1} title="Company Details" sub="Legal entity and contact information" />

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-[13px] font-medium mb-1">Company Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.companyName} onChange={set('companyName')} placeholder="e.g., Acme" className={inputCls('companyName')} />
            <p className="text-[11px] text-[#9b9890] mt-1">Public / trading name</p>
            {errors.companyName && <p className="text-[11px] text-red-500 mt-1">{errors.companyName}</p>}
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1">Legal Name <span className="text-[#9b9890] font-normal">(optional)</span></label>
            <input type="text" value={form.legalName} onChange={set('legalName')} placeholder="e.g., Acme Technologies Inc." className={inputCls('legalName')} />
            <p className="text-[11px] text-[#9b9890] mt-1">Registered legal entity name</p>
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-[13px] font-medium mb-2">Entity Type</label>
          <div className="flex flex-wrap gap-2">
            {ENTITY_TYPES.map(t => (
              <button key={t} type="button" onClick={() => setVal('entityType', t)}
                className={'px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border transition-all ' + (form.entityType === t ? 'bg-[#2d5be3] text-white border-[#2d5be3]' : 'bg-white text-[#6b6860] border-[#e8e6df] hover:border-[#2d5be3] hover:text-[#2d5be3]')}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-[13px] font-medium mb-2">Jurisdiction</label>
          <div className="flex gap-2 mb-3">
            {(['US Based', 'Non-US Based'] as const).map(j => (
              <button key={j} type="button" onClick={() => setVal('jurisdictionType', j)}
                className={'px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border transition-all ' + (form.jurisdictionType === j ? 'bg-[#2d5be3] text-white border-[#2d5be3]' : 'bg-white text-[#6b6860] border-[#e8e6df] hover:border-[#2d5be3]')}>
                {j}
              </button>
            ))}
          </div>
          {form.jurisdictionType === 'US Based' ? (
            <div>
              <label className="block text-[13px] font-medium mb-1">State of Incorporation <span className="text-red-500">*</span></label>
              <select value={form.usState} onChange={set('usState')} className={inputCls('usState')}>
                <option value="">Select state…</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {errors.usState && <p className="text-[11px] text-red-500 mt-1">{errors.usState}</p>}
            </div>
          ) : (
            <div>
              <label className="block text-[13px] font-medium mb-1">Country <span className="text-red-500">*</span></label>
              <select value={form.country} onChange={set('country')} className={inputCls('country')}>
                <option value="">Select country…</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {errors.country && <p className="text-[11px] text-red-500 mt-1">{errors.country}</p>}
            </div>
          )}
        </div>

        <div className="mb-5">
          <label className="block text-[13px] font-medium mb-1">Website <span className="text-[#9b9890] font-normal">(optional)</span></label>
          <input type="url" value={form.website} onChange={set('website')} placeholder="https://company.com" className={inputCls('website')} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1">
            <label className="block text-[13px] font-medium mb-1">CEO / Contact Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.ceoName} onChange={set('ceoName')} placeholder="Full name" className={inputCls('ceoName')} />
            {errors.ceoName && <p className="text-[11px] text-red-500 mt-1">{errors.ceoName}</p>}
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1">Email <span className="text-red-500">*</span></label>
            <input type="email" value={form.ceoEmail} onChange={set('ceoEmail')} placeholder="ceo@company.com" className={inputCls('ceoEmail')} />
            {errors.ceoEmail && <p className="text-[11px] text-red-500 mt-1">{errors.ceoEmail}</p>}
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1">Phone <span className="text-[#9b9890] font-normal">(optional)</span></label>
            <input type="tel" value={form.ceoPhone} onChange={set('ceoPhone')} placeholder="+1 (555) 000-0000" className={inputCls('ceoPhone')} />
          </div>
        </div>
      </div>

      {/* SECTION 2 — Round Details */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-6 mb-4">
        <SectionHeader num={2} title="Round Details" sub="Investment terms and transaction details" />

        <div className="mb-5">
          <label className="block text-[13px] font-medium mb-2">Security Type <span className="text-red-500">*</span></label>
          <div className="flex flex-wrap gap-2">
            {SECURITY_TYPES.map(t => (
              <button key={t} type="button" onClick={() => setVal('securityType', t)}
                className={'px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border transition-all ' + (form.securityType === t ? 'bg-[#2d5be3] text-white border-[#2d5be3]' : 'bg-white text-[#6b6860] border-[#e8e6df] hover:border-[#2d5be3] hover:text-[#2d5be3]')}>
                {t}
              </button>
            ))}
          </div>
          {errors.securityType && <p className="text-[11px] text-red-500 mt-1">{errors.securityType}</p>}
        </div>

        {/* SAFE sub-type */}
        {form.securityType === 'SAFE' && (
          <div className="mb-5 pl-4 border-l-2 border-[#2d5be3]">
            <label className="block text-[13px] font-medium mb-2">SAFE Structure <span className="text-red-500">*</span></label>
            <div className="flex flex-col gap-2 mb-4">
              {SAFE_TYPES.map(t => (
                <button key={t} type="button" onClick={() => setVal('safeType', t)}
                  className={'px-3 py-2 rounded-[7px] text-[12.5px] font-medium border transition-all text-left ' +
                    (form.safeType === t ? 'bg-[#2d5be3] text-white border-[#2d5be3]' : 'bg-white text-[#6b6860] border-[#e8e6df] hover:border-[#2d5be3] hover:text-[#2d5be3]')}>
                  {t}
                </button>
              ))}
            </div>
            {(form.safeType === 'with valuation cap and discount' || form.safeType === 'with discount, no valuation cap') && (
              <div className="max-w-xs">
                <label className="block text-[13px] font-medium mb-1">Discount %</label>
                <div className="relative">
                  <input type="number" step="0.5" min="0" max="50" value={form.discount} onChange={set('discount')}
                    placeholder="e.g., 20"
                    className="w-full px-3 py-2.5 pr-7 rounded-[7px] border border-[#e8e6df] bg-white text-[13px] font-sans outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 transition-colors" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[13px]">%</span>
                </div>
                <p className="text-[11.5px] text-[#9b9890] mt-1">Discount applied at conversion (typically 15–20%)</p>
              </div>
            )}
          </div>
        )}

        {/* Convertible Note sub-section */}
        {form.securityType === 'Convertible Note' && (
          <div className="mb-5 pl-4 border-l-2 border-[#2d5be3]">
            <p className="text-[13px] font-medium text-[#2d5be3] mb-3">Convertible Note Terms</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-medium mb-1">Interest Rate % <span className="text-[#9b9890] font-normal">(optional)</span></label>
                <div className="relative">
                  <input type="number" step="0.5" min="0" max="30" value={form.interestRate} onChange={set('interestRate')}
                    placeholder="e.g., 6"
                    className="w-full px-3 py-2.5 pr-7 rounded-[7px] border border-[#e8e6df] bg-white text-[13px] font-sans outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 transition-colors" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[13px]">%</span>
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-medium mb-1">Maturity Date <span className="text-[#9b9890] font-normal">(optional)</span></label>
                <input type="date" value={form.maturityDate} onChange={set('maturityDate')}
                  className="w-full px-3 py-2.5 rounded-[7px] border border-[#e8e6df] bg-white text-[13px] font-sans outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 transition-colors" />
              </div>
            </div>
            <div className="max-w-xs mt-4">
              <label className="block text-[13px] font-medium mb-1">Discount % <span className="text-[#9b9890] font-normal">(optional)</span></label>
              <div className="relative">
                <input type="number" step="0.5" min="0" max="50" value={form.discount} onChange={set('discount')}
                  placeholder="e.g., 20"
                  className="w-full px-3 py-2.5 pr-7 rounded-[7px] border border-[#e8e6df] bg-white text-[13px] font-sans outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 transition-colors" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[13px]">%</span>
              </div>
            </div>
          </div>
        )}

        {/* Preferred Stock / Common Stock sub-section */}
        {(form.securityType === 'Preferred Stock' || form.securityType === 'Common Stock') && (
          <div className="mb-5 pl-4 border-l-2 border-[#2d5be3]">
            <p className="text-[13px] font-medium text-[#2d5be3] mb-3">{form.securityType} Terms</p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-[13px] font-medium mb-1">Share Price <span className="text-[#9b9890] font-normal">(optional)</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[13px]">$</span>
                  <input type="number" step="0.01" min="0" value={form.sharePrice} onChange={set('sharePrice')}
                    placeholder="e.g., 1.33"
                    className="w-full pl-6 pr-3 py-2.5 rounded-[7px] border border-[#e8e6df] bg-white text-[13px] font-sans outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 transition-colors" />
                </div>
                <p className="text-[11.5px] text-[#9b9890] mt-1">Price per share</p>
              </div>
              <div>
                <label className="block text-[13px] font-medium mb-1">Number of Shares <span className="text-[#9b9890] font-normal">(optional)</span></label>
                <input type="number" step="1" min="0" value={form.numShares} onChange={set('numShares')}
                  placeholder="e.g., 150075"
                  className="w-full px-3 py-2.5 rounded-[7px] border border-[#e8e6df] bg-white text-[13px] font-sans outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 transition-colors" />
                {form.sharePrice && form.numShares && Number(form.sharePrice) > 0 && Number(form.numShares) > 0 && (
                  <p className="text-[11px] text-[#6b6860] mt-1">
                    Total: ${(Number(form.sharePrice) * Number(form.numShares)).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mb-5">
          <label className="block text-[13px] font-medium mb-2">Round</label>
          <div className="flex flex-wrap gap-2">
            {ROUNDS.map(r => (
              <button key={r} type="button" onClick={() => setVal('round', r)}
                className={'px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border transition-all ' + (form.round === r ? 'bg-[#2d5be3] text-white border-[#2d5be3]' : 'bg-white text-[#6b6860] border-[#e8e6df] hover:border-[#2d5be3] hover:text-[#2d5be3]')}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-[13px] font-medium mb-1">Investment Amount (USD) <span className="text-red-500">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[13px]">$</span>
              <input type="number" value={form.amount} onChange={set('amount')} placeholder="0" className={inputCls('amount') + ' pl-6'} />
            </div>
            {form.amount && !isNaN(Number(form.amount)) && Number(form.amount) > 0 && (
              <p className="text-[11px] text-[#6b6860] mt-1">${Number(form.amount).toLocaleString()}</p>
            )}
            {errors.amount && <p className="text-[11px] text-red-500 mt-1">{errors.amount}</p>}
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1">Investment Date <span className="text-red-500">*</span></label>
            <input type="date" value={form.investmentDate} onChange={set('investmentDate')} className={inputCls('investmentDate')} />
            {errors.investmentDate && <p className="text-[11px] text-red-500 mt-1">{errors.investmentDate}</p>}
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-medium mb-2">Valuation <span className="text-[#9b9890] font-normal text-[12px]">(saved as valuation cap)</span></label>
          <div className="flex gap-3 items-start">
            <div className="flex-1">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[13px]">$</span>
                <input type="number" value={form.valuation} onChange={set('valuation')} placeholder="Enter valuation"
                  className="w-full pl-6 pr-3 py-2.5 rounded-[7px] border border-[#e8e6df] bg-white text-[13px] font-sans outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 transition-colors" />
              </div>
              {form.valuation && !isNaN(Number(form.valuation)) && Number(form.valuation) > 0 && (
                <p className="text-[11px] text-[#6b6860] mt-1">${Number(form.valuation).toLocaleString()}</p>
              )}
            </div>
            <div className="flex border border-[#e8e6df] rounded-[7px] overflow-hidden flex-shrink-0">
              {(['Pre-money', 'Post-money'] as const).map(v => (
                <button key={v} type="button" onClick={() => setVal('valuationType', v)}
                  className={'px-3 py-2.5 text-[12.5px] font-medium transition-colors ' + (form.valuationType === v ? 'bg-[#2d5be3] text-white' : 'bg-white text-[#6b6860] hover:bg-[#f9f8f5]')}>
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3 — Investment Summary */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-6 mb-6">
        <SectionHeader num={3} title="Investment Summary" sub="Deal thesis and key highlights — visible in reports" />

        <div className="mb-5">
          <label className="block text-[13px] font-medium mb-1">Headline <span className="text-[#9b9890] font-normal">(optional)</span></label>
          <input type="text" value={form.headline} maxLength={256} onChange={set('headline')} placeholder="A one-liner about this deal" className={inputCls('headline')} />
          <p className="text-[11px] text-[#9b9890] mt-1 text-right">{form.headline.length} / 256</p>
        </div>

        <div className="mb-5">
          <label className="block text-[13px] font-medium mb-2">Industry / Sector <span className="text-[#9b9890] font-normal">(optional)</span></label>
          <div className="flex flex-wrap gap-1.5">
            {SECTORS.map(s => (
              <button key={s} type="button" onClick={() => setVal('sector', form.sector === s ? '' : s)}
                className={'px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-all ' + (form.sector === s ? 'bg-[#2d5be3] text-white border-[#2d5be3]' : 'bg-white text-[#6b6860] border-[#e8e6df] hover:border-[#2d5be3] hover:text-[#2d5be3]')}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-medium mb-1">About This Investment <span className="text-[#9b9890] font-normal">(optional)</span></label>
          <textarea value={form.about} onChange={set('about')} rows={5}
            placeholder="Why do you like this investment? Add your investment memo, thesis, or key highlights here..."
            className={inputCls('about') + ' resize-y'} />
        </div>
      </div>

      {/* BUTTONS */}
      <div className="flex items-center justify-between pb-8">
        <p className="text-[12px] text-[#9b9890]">Fields marked <span className="text-red-500">*</span> are required</p>
        <div className="flex gap-3">
          <Link href={'/funds/' + id} className="px-5 py-2 rounded-[7px] text-[13px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">Cancel</Link>
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2 rounded-[7px] text-[13px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
            {saving ? (
              <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Saving...</>
            ) : 'Save Investment'}
          </button>
        </div>
      </div>
    </div>
  );
}
