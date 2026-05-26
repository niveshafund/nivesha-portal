'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createExpense } from '@/lib/db';

const EXPENSE_TYPES = ['Management Fee', 'Legal', 'Audit', 'Admin', 'Other'];

const QUARTERS = [
  'Q1 2024','Q2 2024','Q3 2024','Q4 2024',
  'Q1 2025','Q2 2025','Q3 2025','Q4 2025',
  'Q1 2026','Q2 2026','Q3 2026','Q4 2026',
];

const QUARTER_END_DATES: Record<string, string> = {
  'Q1 2024': '2024-03-31', 'Q2 2024': '2024-06-30',
  'Q3 2024': '2024-09-30', 'Q4 2024': '2024-12-31',
  'Q1 2025': '2025-03-31', 'Q2 2025': '2025-06-30',
  'Q3 2025': '2025-09-30', 'Q4 2025': '2025-12-31',
  'Q1 2026': '2026-03-31', 'Q2 2026': '2026-06-30',
  'Q3 2026': '2026-09-30', 'Q4 2026': '2026-12-31',
};

export default function AddExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: fundId } = React.use(params);
  const router = useRouter();

  const [form, setForm] = useState({
    date: '', quarter: 'Q1 2026', type: 'Management Fee',
    amount: '', description: '', notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const set = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.date)     e.date = 'Date is required';
    if (!form.amount)   e.amount = 'Amount is required';
    else if (isNaN(Number(form.amount)) || Number(form.amount) <= 0)
      e.amount = 'Enter a valid positive amount';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await createExpense({
        fund_id:     fundId,
        date:        form.date,
        quarter:     form.quarter,
        quarter_end: QUARTER_END_DATES[form.quarter] ?? form.date,
        type:        form.type as any,
        amount:      Number(form.amount),
        description: form.description || undefined,
        notes:       form.notes || undefined,
      });
      router.push(`/funds/${fundId}?tab=expenses`);
    } catch (err: any) {
      setSaveError(err.message ?? 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = (field: string) =>
    'w-full px-3 py-2.5 rounded-[7px] border text-[13px] font-sans outline-none transition-colors ' +
    (errors[field]
      ? 'border-red-400 bg-red-50'
      : 'border-[#e8e6df] bg-white focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10');

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/funds/${fundId}`} className="w-7 h-7 flex items-center justify-center rounded-full border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors text-[#6b6860]">←</Link>
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Add Expense</h1>
          <p className="text-[12.5px] text-[#6b6860] mt-0.5">Record a management fee or other fund expense</p>
        </div>
      </div>

      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-[7px] px-4 py-3 text-[12.5px] text-red-700 mb-4">
          ⚠️ {saveError}
        </div>
      )}

      <div className="bg-white border border-[#e8e6df] rounded-xl p-6 mb-4">
        <h2 className="text-[15px] font-semibold mb-5">Expense Details</h2>

        <div className="mb-5">
          <label className="block text-[13px] font-medium mb-2">Expense Type</label>
          <div className="flex flex-wrap gap-2">
            {EXPENSE_TYPES.map(t => (
              <button key={t} type="button" onClick={() => setForm(f => ({ ...f, type: t }))}
                className={'px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border transition-all ' +
                  (form.type === t ? 'bg-[#2d5be3] text-white border-[#2d5be3]' : 'bg-white text-[#6b6860] border-[#e8e6df] hover:border-[#2d5be3]')}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-[13px] font-medium mb-1">Date <span className="text-red-500">*</span></label>
            <input type="date" value={form.date} onChange={set('date')} className={inputCls('date')} />
            {errors.date && <p className="text-[11px] text-red-500 mt-1">{errors.date}</p>}
          </div>
          <div>
            <label className="block text-[13px] font-medium mb-1">Quarter</label>
            <select value={form.quarter} onChange={set('quarter')} className={inputCls('quarter')}>
              {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-[13px] font-medium mb-1">Amount (USD) <span className="text-red-500">*</span></label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9b9890] text-[13px]">$</span>
            <input type="number" value={form.amount} onChange={set('amount')} placeholder="0"
              className={inputCls('amount') + ' pl-6'} />
          </div>
          {form.amount && Number(form.amount) > 0 && (
            <p className="text-[11px] text-[#6b6860] mt-1">${Number(form.amount).toLocaleString()}</p>
          )}
          {errors.amount && <p className="text-[11px] text-red-500 mt-1">{errors.amount}</p>}
        </div>

        <div className="mb-5">
          <label className="block text-[13px] font-medium mb-1">Description <span className="text-[#9b9890] font-normal">(optional)</span></label>
          <input type="text" value={form.description} onChange={set('description')}
            placeholder="e.g., Q1 2026 Management Fee" className={inputCls('description')} />
        </div>

        <div>
          <label className="block text-[13px] font-medium mb-1">Notes <span className="text-[#9b9890] font-normal">(optional)</span></label>
          <textarea value={form.notes} onChange={set('notes')} rows={3}
            className={inputCls('notes') + ' resize-y'} placeholder="Any additional notes…" />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pb-8">
        <Link href={`/funds/${fundId}`} className="px-5 py-2 rounded-[7px] text-[13px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
          Cancel
        </Link>
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2 rounded-[7px] text-[13px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors disabled:opacity-60 flex items-center gap-2">
          {saving ? (
            <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>Saving...</>
          ) : 'Save Expense'}
        </button>
      </div>
    </div>
  );
}
