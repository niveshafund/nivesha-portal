'use client';
// app/fund-operations/page.tsx

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { can } from '@/lib/rbac';

type Fund = { id: string; name: string; management_fee: number };
type Tab = 'trial-balance' | 'journal-entries';

// ─── Account Balance types ────────────────────────────────────
type AccountRow = {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  debit: number;
  credit: number;
};

// ─── Journal Entry types ──────────────────────────────────────
type JournalEntry = {
  id: string;
  fund_id: string;
  entry_number: string;
  date: string;
  description: string;
  reference?: string;
  status: 'draft' | 'posted';
  total_debit: number;
  total_credit: number;
  lines?: JournalLine[];
};
type JournalLine = {
  id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  notes?: string;
};

const ACCOUNT_TYPES: Record<string, 'asset' | 'liability' | 'equity' | 'income' | 'expense'> = {
  '1100': 'asset', '1200': 'asset', '1220': 'asset', '1310': 'asset',
  '3200': 'equity',
  '4300': 'income', '4400': 'income',
  '5100': 'expense',
};

const ACCOUNTS = [
  { code: '1100', name: 'Cash and Cash Equivalents' },
  { code: '1200', name: 'Investments at Cost' },
  { code: '1220', name: 'Investments (Fair Value Adjustment)' },
  { code: '1310', name: 'Capital Call Receivables' },
  { code: '3200', name: 'LP Capital Accounts' },
  { code: '4300', name: 'Realized Gains/Losses on Investments' },
  { code: '4400', name: 'Unrealized Gains/Losses' },
  { code: '5100', name: 'Management Fees' },
];

const inputCls = 'w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[13px] outline-none focus:border-[#2d5be3] focus:ring-2 focus:ring-[#2d5be3]/10 bg-white';

const typeBadge: Record<string, string> = {
  asset:   'bg-blue-50 text-blue-700',
  liability: 'bg-orange-50 text-orange-700',
  equity:  'bg-purple-50 text-purple-700',
  income:  'bg-green-50 text-green-700',
  expense: 'bg-amber-50 text-amber-700',
};

function fmt(n: number) {
  if (n === 0) return '—';
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function FundOperationsPage() {
  const { role, user } = useAuth();
  const canWrite = can.manageCapitalCalls(role ?? undefined);

  const [tab, setTab]               = useState<Tab>('trial-balance');
  const [funds, setFunds]           = useState<Fund[]>([]);
  const [fundId, setFundId]         = useState('');
  const [asOf, setAsOf]             = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading]       = useState(false);

  // Trial balance state
  const [accounts, setAccounts]     = useState<AccountRow[]>([]);

  // Journal entries state
  const [entries, setEntries]       = useState<JournalEntry[]>([]);
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [showNewJE, setShowNewJE]   = useState(false);
  const [jeForm, setJeForm]         = useState({
    date: new Date().toISOString().slice(0, 10),
    description: '',
    reference: '',
    status: 'posted' as 'draft' | 'posted',
  });
  const [jeLines, setJeLines]       = useState<{account_code: string; account_name: string; debit: string; credit: string; notes: string}[]>([
    { account_code: '', account_name: '', debit: '', credit: '', notes: '' },
    { account_code: '', account_name: '', debit: '', credit: '', notes: '' },
  ]);
  const [savingJE, setSavingJE]     = useState(false);
  const [jeError, setJeError]       = useState('');
  const [deleteJE, setDeleteJE]     = useState<JournalEntry | null>(null);

  useEffect(() => {
    supabase.from('funds').select('id, name, management_fee').order('name').then(({ data }) => {
      const f = (data ?? []) as Fund[];
      setFunds(f);
      if (f.length > 0) setFundId(f[0].id);
    });
  }, []);

  useEffect(() => {
    if (!fundId) return;
    if (tab === 'trial-balance') loadTrialBalance();
    if (tab === 'journal-entries') loadJournalEntries();
  }, [fundId, tab, asOf]);

  // ── Trial Balance ─────────────────────────────────────────────
  async function loadTrialBalance() {
    setLoading(true);
    try {
      const [
        { data: lpTxns },
        { data: txns },
        { data: vals },
        { data: expenses },
        { data: coData },
      ] = await Promise.all([
        supabase.from('lp_transactions').select('*').eq('fund_id', fundId).lte('date', asOf),
        supabase.from('transactions').select('*').eq('fund_id', fundId).lte('date', asOf),
        supabase.from('valuations').select('*').eq('fund_id', fundId).lte('quarter_end', asOf),
        supabase.from('expenses').select('*').eq('fund_id', fundId).lte('date', asOf),
        supabase.from('companies').select('id, status').eq('fund_id', fundId),
      ]);

      const balances: Record<string, { debit: number; credit: number }> = {};
      ACCOUNTS.forEach(a => { balances[a.code] = { debit: 0, credit: 0 }; });

      // LP Transactions → Capital Calls
      (lpTxns ?? []).forEach((t: any) => {
        if (t.type === 'Capital Call') {
          balances['1310'].debit  += t.amount; // Capital Call Receivable DR
          balances['3200'].credit += t.amount; // LP Capital Accounts CR
          balances['1100'].debit  += t.amount; // Cash DR (received)
          balances['1310'].credit += t.amount; // Capital Call Receivable CR (settled)
        }
        if (t.type === 'Distribution') {
          balances['3200'].debit  += t.amount; // LP Capital Accounts DR
          balances['1100'].credit += t.amount; // Cash CR
        }
      });

      // Fund Transactions → Investments / Exits / Write-offs
      const coStatusMap: Record<string, string> = {};
      (coData ?? []).forEach((c: any) => { coStatusMap[c.id] = c.status; });

      const investedByCo: Record<string, number> = {};
      (txns ?? []).forEach((t: any) => {
        if (t.type === 'Investment' && t.company_id)
          investedByCo[t.company_id] = (investedByCo[t.company_id] ?? 0) + t.amount;
      });

      // Book investment and exit entries
      const coIdsWithDistrib = new Set<string>();
      (txns ?? []).forEach((t: any) => {
        if (t.type === 'Investment') {
          balances['1200'].debit  += t.amount; // Investments at Cost DR
          balances['1100'].credit += t.amount; // Cash CR
        }
        if (t.type === 'Distribution') {
          coIdsWithDistrib.add(t.company_id);
          balances['1100'].debit  += t.amount; // Cash DR (exit proceeds)
          const costBasis = investedByCo[t.company_id] ?? t.amount;
          balances['1200'].credit += costBasis; // Investments at Cost CR (full cost basis)
          const gain = t.amount - costBasis;
          if (gain > 0) balances['4300'].credit += gain;
          else if (gain < 0) balances['4300'].debit += Math.abs(gain);
        }
      });

      // Write-offs: companies with status 'Written Off' and no Distribution transaction
      // have no cash recovery — book full cost basis as realized loss
      Object.entries(coStatusMap).forEach(([coId, status]) => {
        if (status === 'Written Off' && !coIdsWithDistrib.has(coId)) {
          const costBasis = investedByCo[coId] ?? 0;
          if (costBasis > 0) {
            balances['1200'].credit += costBasis; // Remove from Investments at Cost
            balances['4300'].debit  += costBasis; // Realized Loss DR
          }
        }
      });

      // Valuations → Unrealized Gains/Losses
      // Skip Exited and Written Off companies — their gain/loss is already realized above
      const latestValByTxn: Record<string, any> = {};
      (vals ?? []).forEach((v: any) => {
        if (!v.transaction_id) return;
        const ex = latestValByTxn[v.transaction_id];
        if (!ex || v.quarter_end > ex.quarter_end) latestValByTxn[v.transaction_id] = v;
      });
      const latestValByCo: Record<string, any> = {};
      (vals ?? []).forEach((v: any) => {
        if (!v.company_id) return;
        const ex = latestValByCo[v.company_id];
        if (!ex || v.quarter_end > ex.quarter_end) latestValByCo[v.company_id] = v;
      });
      const investCountByCo: Record<string, number> = {};
      (txns ?? []).filter((t: any) => t.type === 'Investment' && t.company_id)
        .forEach((t: any) => { investCountByCo[t.company_id] = (investCountByCo[t.company_id] ?? 0) + 1; });

      let totalUnrealized = 0;
      (txns ?? []).filter((t: any) => t.type === 'Investment' && t.company_id).forEach((t: any) => {
        // Skip exited/written-off — already booked as realized
        const coStatus = coStatusMap[t.company_id];
        if (coStatus === 'Exited' || coStatus === 'Written Off') return;

        const txnVal = latestValByTxn[t.id];
        const coVal  = latestValByCo[t.company_id];
        let currentVal: number;
        if (txnVal != null && txnVal.value != null) {
          currentVal = txnVal.value;
        } else if (coVal != null && coVal.value != null) {
          if (investCountByCo[t.company_id] === 1) {
            currentVal = coVal.value;
          } else {
            const entryVal = t.valuation_cap ?? null;
            if (entryVal && entryVal > 0) {
              const companyValue = coVal.company_value ?? 0;
              currentVal = companyValue > 0 ? (t.amount / entryVal) * companyValue : t.amount;
            } else {
              currentVal = t.amount;
            }
          }
        } else {
          currentVal = t.amount; // no valuation: cost basis = no unrealized
        }
        totalUnrealized += currentVal - t.amount;
      });

      if (totalUnrealized > 0) {
        balances['1220'].debit  += totalUnrealized;
        balances['4400'].credit += totalUnrealized;
      } else if (totalUnrealized < 0) {
        balances['4400'].debit  += Math.abs(totalUnrealized);
        balances['1220'].credit += Math.abs(totalUnrealized);
      }

      // Expenses → Management Fees
      (expenses ?? []).forEach((e: any) => {
        if (e.type === 'Management Fee') {
          balances['5100'].debit  += e.amount;
          balances['1100'].credit += e.amount;
        }
      });

      const rows: AccountRow[] = ACCOUNTS.map(a => ({
        code: a.code,
        name: a.name,
        type: ACCOUNT_TYPES[a.code],
        debit: balances[a.code].debit,
        credit: balances[a.code].credit,
      }));

      setAccounts(rows);
    } finally {
      setLoading(false);
    }
  }

  // ── Journal Entries ───────────────────────────────────────────
  async function loadJournalEntries() {
    setLoading(true);
    const { data } = await supabase
      .from('journal_entries')
      .select('*, journal_entry_lines(*)')
      .eq('fund_id', fundId)
      .order('date', { ascending: false });
    setEntries((data ?? []) as JournalEntry[]);
    setLoading(false);
  }

  async function loadLines(entryId: string) {
    if (expanded === entryId) { setExpanded(null); return; }
    setExpanded(entryId);
    if (entries.find(e => e.id === entryId)?.lines) return;
    const { data } = await supabase.from('journal_entry_lines').select('*').eq('journal_entry_id', entryId).order('created_at');
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, lines: (data ?? []) as JournalLine[] } : e));
  }

  async function handleSaveJE() {
    const validLines = jeLines.filter(l => l.account_code && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (!jeForm.description.trim() || validLines.length < 2) {
      setJeError('Description required and at least 2 lines needed');
      return;
    }
    const totalD = validLines.reduce((s, l) => s + Number(l.debit), 0);
    const totalC = validLines.reduce((s, l) => s + Number(l.credit), 0);
    if (Math.abs(totalD - totalC) > 0.01) {
      setJeError(`Debits ($${totalD.toLocaleString()}) must equal Credits ($${totalC.toLocaleString()})`);
      return;
    }
    setSavingJE(true); setJeError('');
    try {
      // Generate entry number
      const year = new Date(jeForm.date).getFullYear();
      const count = entries.filter(e => e.date.startsWith(String(year))).length + 1;
      const entryNum = `JE-${year}-${String(count).padStart(3, '0')}`;

      const { data: je, error } = await supabase.from('journal_entries').insert({
        fund_id: fundId,
        entry_number: entryNum,
        date: jeForm.date,
        description: jeForm.description.trim(),
        reference: jeForm.reference.trim() || null,
        status: jeForm.status,
        total_debit: totalD,
        total_credit: totalC,
        created_by: user?.id,
      }).select().single();
      if (error) throw error;

      await supabase.from('journal_entry_lines').insert(
        validLines.map(l => ({
          journal_entry_id: je.id,
          account_code: l.account_code,
          account_name: l.account_name,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          notes: l.notes || null,
        }))
      );

      setShowNewJE(false);
      resetJEForm();
      await loadJournalEntries();
    } catch (err: any) {
      setJeError(err.message);
    } finally {
      setSavingJE(false);
    }
  }

  async function handleDeleteJE() {
    if (!deleteJE) return;
    await supabase.from('journal_entries').delete().eq('id', deleteJE.id);
    setDeleteJE(null);
    await loadJournalEntries();
  }

  function resetJEForm() {
    setJeForm({ date: new Date().toISOString().slice(0, 10), description: '', reference: '', status: 'posted' });
    setJeLines([
      { account_code: '', account_name: '', debit: '', credit: '', notes: '' },
      { account_code: '', account_name: '', debit: '', credit: '', notes: '' },
    ]);
    setJeError('');
  }

  function updateLine(i: number, field: string, value: string) {
    setJeLines(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'account_code') {
        const acc = ACCOUNTS.find(a => a.code === value);
        next[i].account_name = acc?.name ?? '';
      }
      return next;
    });
  }

  const totalDebit  = accounts.reduce((s, a) => s + a.debit, 0);
  const totalCredit = accounts.reduce((s, a) => s + a.credit, 0);
  const netBalance  = totalDebit - totalCredit;

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[20px] font-semibold tracking-tight">Fund Operations</h1>
        <p className="text-[13px] text-[#9b9890] mt-0.5">Capital call processing and fund-level accounting</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-[#e8e6df] rounded-xl p-1 mb-6 w-fit">
        {([
          { id: 'trial-balance', label: 'Trial Balance' },
          { id: 'journal-entries', label: 'Journal Entries' },
        ] as { id: Tab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-[8px] text-[13px] font-medium transition-colors ${tab === t.id ? 'bg-[#2d5be3] text-white' : 'text-[#6b6860] hover:text-[#1a1915]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TRIAL BALANCE ── */}
      {tab === 'trial-balance' && (
        <div>
          {/* Controls */}
          <div className="flex items-center gap-3 mb-5">
            <div>
              <div className="text-[16px] font-semibold">Trial Balance</div>
              <p className="text-[12.5px] text-[#9b9890]">Auto-computed from transactions & valuations</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <select value={fundId} onChange={e => setFundId(e.target.value)}
                className="px-3 py-1.5 rounded-[7px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3] bg-white">
                {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <div className="flex items-center gap-1.5 text-[12.5px] text-[#6b6860]">
                <span>As of:</span>
                <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
                  className="px-2 py-1.5 rounded-[7px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3]" />
              </div>
              <button onClick={loadTrialBalance}
                className="px-3 py-1.5 rounded-[7px] text-[12.5px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-48 text-[#9b9890] text-[13px]">Computing…</div>
          ) : (
            <div className="bg-white border border-[#e8e6df] rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[#e8e6df] bg-[#fafaf8]">
                <div className="text-[14px] font-semibold">Account Balances</div>
                <p className="text-[12px] text-[#9b9890]">Debits and credits by account</p>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e8e6df] bg-[#fafaf8]">
                    {['Account Code', 'Account Name', 'Type', 'Debit', 'Credit', 'Net Balance'].map(h => (
                      <th key={h} className={`text-[11px] font-semibold text-[#9b9890] tracking-wide px-5 py-3 ${h.includes('Debit') || h.includes('Credit') || h.includes('Balance') ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e6df]">
                  {accounts.map(a => {
                    const net = a.debit - a.credit;
                    const isDebitNormal = ['asset', 'expense'].includes(a.type);
                    const netAmt = isDebitNormal ? net : -net;
                    return (
                      <tr key={a.code} className="hover:bg-[#fafaf8] transition-colors">
                        <td className="px-5 py-3 text-[13px] font-mono text-[#6b6860]">{a.code}</td>
                        <td className="px-5 py-3 text-[13px] font-medium">{a.name}</td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${typeBadge[a.type]}`}>{a.type}</span>
                        </td>
                        <td className="px-5 py-3 text-[13px] text-right font-mono">{fmt(a.debit)}</td>
                        <td className="px-5 py-3 text-[13px] text-right font-mono">{fmt(a.credit)}</td>
                        <td className="px-5 py-3 text-right">
                          {net === 0 ? (
                            <span className="text-[13px] text-[#9b9890] font-mono">—</span>
                          ) : (
                            <span className="text-[13px] font-bold font-mono">
                              {fmt(Math.abs(net))}
                              <span className={`ml-1.5 text-[10.5px] font-semibold ${netAmt > 0 ? 'text-[#6b6860]' : 'text-[#6b6860]'}`}>
                                {netAmt >= 0 ? 'DR' : 'CR'}
                              </span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#e8e6df] bg-[#f9f8f5]">
                    <td className="px-5 py-3 text-[13px] font-bold" colSpan={3}>Total</td>
                    <td className="px-5 py-3 text-[13px] font-bold text-right font-mono">{fmt(totalDebit)}</td>
                    <td className="px-5 py-3 text-[13px] font-bold text-right font-mono">{fmt(totalCredit)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-[13px] font-bold font-mono ${Math.abs(netBalance) < 1 ? 'text-green-600' : 'text-red-500'}`}>
                        {Math.abs(netBalance) < 1 ? '$0' : fmt(netBalance)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── JOURNAL ENTRIES ── */}
      {tab === 'journal-entries' && (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <div>
              <div className="text-[16px] font-semibold">Journal Entries</div>
              <p className="text-[12.5px] text-[#9b9890]">View and create journal entries</p>
            </div>
            <select value={fundId} onChange={e => setFundId(e.target.value)}
              className="ml-auto px-3 py-1.5 rounded-[7px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3] bg-white">
              {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            {canWrite && (
              <button onClick={() => { setShowNewJE(true); resetJEForm(); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[8px] text-[13px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">
                + New Journal Entry
              </button>
            )}
          </div>

          {/* New JE Form */}
          {showNewJE && (
            <div className="bg-white border border-[#e8e6df] rounded-xl p-5 mb-5">
              <div className="text-[14px] font-semibold mb-4">New Journal Entry</div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div>
                  <label className="block text-[11.5px] font-medium mb-1">Date *</label>
                  <input type="date" value={jeForm.date} onChange={e => setJeForm(f => ({...f, date: e.target.value}))} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11.5px] font-medium mb-1">Description *</label>
                  <input value={jeForm.description} onChange={e => setJeForm(f => ({...f, description: e.target.value}))}
                    placeholder="e.g. Capital Call Received" className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-[11.5px] font-medium mb-1">Reference (optional)</label>
                  <input value={jeForm.reference} onChange={e => setJeForm(f => ({...f, reference: e.target.value}))}
                    placeholder="e.g. CC-2026-001" className={inputCls} />
                </div>
                <div>
                  <label className="block text-[11.5px] font-medium mb-1">Status</label>
                  <select value={jeForm.status} onChange={e => setJeForm(f => ({...f, status: e.target.value as any}))} className={inputCls}>
                    <option value="posted">Posted</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>

              {/* Lines */}
              <div className="border border-[#e8e6df] rounded-lg overflow-hidden mb-3">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#f9f8f5] border-b border-[#e8e6df]">
                      {['Account', 'Debit ($)', 'Credit ($)', 'Notes', ''].map(h => (
                        <th key={h} className="text-left text-[11px] font-semibold text-[#9b9890] px-3 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e6df]">
                    {jeLines.map((line, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2">
                          <select value={line.account_code} onChange={e => updateLine(i, 'account_code', e.target.value)}
                            className="w-full px-2 py-1.5 rounded-[6px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3] bg-white">
                            <option value="">Select account…</option>
                            {ACCOUNTS.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 w-32">
                          <input type="number" value={line.debit} onChange={e => updateLine(i, 'debit', e.target.value)}
                            placeholder="0"
                            className="w-full px-2 py-1.5 rounded-[6px] border border-[#e8e6df] text-[12.5px] text-right outline-none focus:border-[#2d5be3]" />
                        </td>
                        <td className="px-3 py-2 w-32">
                          <input type="number" value={line.credit} onChange={e => updateLine(i, 'credit', e.target.value)}
                            placeholder="0"
                            className="w-full px-2 py-1.5 rounded-[6px] border border-[#e8e6df] text-[12.5px] text-right outline-none focus:border-[#2d5be3]" />
                        </td>
                        <td className="px-3 py-2">
                          <input value={line.notes} onChange={e => updateLine(i, 'notes', e.target.value)}
                            placeholder="Optional"
                            className="w-full px-2 py-1.5 rounded-[6px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3]" />
                        </td>
                        <td className="px-3 py-2">
                          {jeLines.length > 2 && (
                            <button onClick={() => setJeLines(prev => prev.filter((_, j) => j !== i))}
                              className="text-[#9b9890] hover:text-red-500 transition-colors">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#f9f8f5] border-t border-[#e8e6df]">
                      <td className="px-3 py-2 text-[12px] font-semibold">Total</td>
                      <td className="px-3 py-2 text-[12px] font-mono text-right">
                        ${jeLines.reduce((s, l) => s + (Number(l.debit) || 0), 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-[12px] font-mono text-right">
                        ${jeLines.reduce((s, l) => s + (Number(l.credit) || 0), 0).toLocaleString()}
                      </td>
                      <td colSpan={2}/>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <button onClick={() => setJeLines(prev => [...prev, { account_code: '', account_name: '', debit: '', credit: '', notes: '' }])}
                className="text-[12px] text-[#2d5be3] hover:underline mb-4">
                + Add line
              </button>

              {jeError && <p className="text-[12px] text-red-500 mb-3">{jeError}</p>}
              <div className="flex gap-2">
                <button onClick={handleSaveJE} disabled={savingJE}
                  className="px-4 py-2 rounded-[8px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] disabled:opacity-60 transition-colors">
                  {savingJE ? 'Saving…' : 'Save Entry'}
                </button>
                <button onClick={() => setShowNewJE(false)}
                  className="px-4 py-2 rounded-[8px] text-[12.5px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Entries table */}
          {loading ? (
            <div className="flex items-center justify-center h-48 text-[#9b9890] text-[13px]">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="bg-white border border-[#e8e6df] rounded-xl flex flex-col items-center justify-center py-14 text-center">
              <div className="text-2xl mb-2">📒</div>
              <div className="text-[13.5px] font-medium mb-1">No journal entries yet</div>
              <p className="text-[12.5px] text-[#9b9890]">Create your first journal entry above</p>
            </div>
          ) : (
            <div className="bg-white border border-[#e8e6df] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e8e6df] bg-[#fafaf8]">
                    <th className="w-8 px-4 py-3"/>
                    {['Entry #', 'Date', 'Description', 'Debit', 'Credit', 'Status', ''].map(h => (
                      <th key={h} className={`text-[11px] font-semibold text-[#9b9890] tracking-wide px-4 py-3 ${h === 'Debit' || h === 'Credit' ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => (
                    <>
                      <tr key={e.id} className="border-b border-[#e8e6df] hover:bg-[#fafaf8] transition-colors cursor-pointer"
                        onClick={() => loadLines(e.id)}>
                        <td className="px-4 py-3">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                            className={`w-3.5 h-3.5 text-[#9b9890] transition-transform ${expanded === e.id ? 'rotate-90' : ''}`}>
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                        </td>
                        <td className="px-4 py-3 text-[12.5px] font-mono font-medium text-[#2d5be3]">{e.entry_number}</td>
                        <td className="px-4 py-3 text-[12.5px] text-[#6b6860]">
                          {new Date(e.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 text-[13px]">
                          <div>{e.description}</div>
                          {e.reference && <div className="text-[11px] text-[#9b9890]">Ref: {e.reference}</div>}
                        </td>
                        <td className="px-4 py-3 text-[13px] font-mono text-right">${e.total_debit.toLocaleString()}</td>
                        <td className="px-4 py-3 text-[13px] font-mono text-right">${e.total_credit.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${e.status === 'posted' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                            {e.status}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={ev => ev.stopPropagation()}>
                          {canWrite && (
                            <button onClick={() => setDeleteJE(e)}
                              className="text-[11.5px] text-red-400 hover:text-red-600 hover:underline">
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded === e.id && e.lines && (
                        <tr key={`${e.id}-lines`} className="border-b border-[#e8e6df] bg-[#fafaf8]">
                          <td colSpan={8} className="px-8 py-3">
                            <table className="w-full">
                              <thead>
                                <tr>
                                  {['Account Code', 'Account Name', 'Debit', 'Credit', 'Notes'].map(h => (
                                    <th key={h} className={`text-[10.5px] font-semibold text-[#9b9890] pb-2 ${h === 'Debit' || h === 'Credit' ? 'text-right' : 'text-left'}`}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#e8e6df]">
                                {e.lines.map(l => (
                                  <tr key={l.id}>
                                    <td className="py-1.5 text-[12px] font-mono text-[#6b6860]">{l.account_code}</td>
                                    <td className="py-1.5 text-[12.5px]">{l.account_name}</td>
                                    <td className="py-1.5 text-[12.5px] font-mono text-right">{l.debit > 0 ? `$${l.debit.toLocaleString()}` : '—'}</td>
                                    <td className="py-1.5 text-[12.5px] font-mono text-right">{l.credit > 0 ? `$${l.credit.toLocaleString()}` : '—'}</td>
                                    <td className="py-1.5 text-[12px] text-[#9b9890]">{l.notes ?? '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-2.5 border-t border-[#e8e6df] bg-[#fafaf8] text-[11.5px] text-[#9b9890]">
                {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete confirm */}
      {deleteJE && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDeleteJE(null)}/>
          <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="text-[14px] font-semibold mb-2">Delete journal entry?</div>
            <p className="text-[13px] text-[#6b6860] mb-5">
              This will permanently delete <span className="font-medium">{deleteJE.entry_number}</span> and all its lines. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteJE(null)}
                className="px-4 py-2 rounded-[8px] text-[12.5px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">Cancel</button>
              <button onClick={handleDeleteJE}
                className="px-4 py-2 rounded-[8px] text-[12.5px] font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
