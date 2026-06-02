'use client';
// app/lp/dashboard/page.tsx

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

// ─── Types ───────────────────────────────────────────────────
type LP = {
  id: string; fund_id: string; name: string; email?: string;
  commitment: number; called: number; distributions: number;
  ownership_pct: number; status: string;
};
type Fund = { id: string; name: string; vintage: number; nav: number; management_fee: number };
type LPTxn = { id: string; date: string; amount: number; type: string; notes?: string };
type Company = { id: string; name: string; sector?: string; stage?: string; invested: number; unrealised: number };
type Valuation = { company_id: string; quarter: string; quarter_end: string; value: number };

// ─── Helpers ──────────────────────────────────────────────────
function fmt(n: number, compact = false) {
  if (compact && Math.abs(n) >= 1_000_000) return `$${(n/1_000_000).toFixed(1)}M`;
  if (compact && Math.abs(n) >= 1_000) return `$${(n/1_000).toFixed(0)}K`;
  return '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function pct(n: number) { return (n * 100).toFixed(1) + '%'; }
function moic(n: number) { return n.toFixed(2) + 'x'; }

const QUARTERS = ['Q1','Q2','Q3','Q4'];
function prevQuarter(q: string) {
  const [qt, yr] = [q.slice(0,2), parseInt(q.slice(2))];
  const qi = QUARTERS.indexOf(qt);
  return qi === 0 ? `Q4${yr-1}` : `${QUARTERS[qi-1]}${yr}`;
}

// ─── Sub-components ───────────────────────────────────────────
function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-[#eaeaea] p-4 flex flex-col gap-1">
      <div className="text-[11.5px] text-[#9b9890] font-medium uppercase tracking-wide">{label}</div>
      <div className={`text-[22px] font-bold tracking-tight ${color ?? 'text-[#1a1915]'}`}>{value}</div>
      {sub && <div className="text-[11px] text-[#9b9890]">{sub}</div>}
    </div>
  );
}

function BridgeRow({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-2.5 border-b border-[#f0efe9] last:border-0 ${bold ? 'font-semibold' : ''}`}>
      <span className={`text-[13.5px] ${bold ? 'text-[#1a1915]' : 'text-[#6b6860]'}`}>{label}</span>
      <span className={`text-[13.5px] font-mono ${color ?? (bold ? 'text-[#1a1915]' : 'text-[#1a1915]')}`}>{value}</span>
    </div>
  );
}

// ─── Zero-state: LP account exists in auth but no LP record yet ──
function PendingSetupScreen({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <div className="min-h-screen bg-[#f5f4f0]">
      {/* Header */}
      <header className="bg-white border-b border-[#eaeaea]">
        <div className="max-w-6xl mx-auto px-6 h-[64px] flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#2d5be3] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-[13px] font-bold">N</span>
          </div>
          <div className="text-[14px] font-semibold text-[#1a1915]">Investor Portal</div>
          <div className="ml-auto">
            <button
              onClick={onSignOut}
              className="text-[12.5px] text-[#9b9890] hover:text-[#1a1915] transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        {/* Zero-state card */}
        <div className="max-w-lg mx-auto bg-white rounded-2xl border border-[#eaeaea] p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-[#eef2fd] flex items-center justify-center mx-auto mb-5">
            <svg viewBox="0 0 24 24" fill="none" stroke="#2d5be3" strokeWidth={1.5} className="w-7 h-7">
              <rect x="2" y="7" width="20" height="14" rx="2"/>
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
              <line x1="12" y1="12" x2="12" y2="16"/>
              <circle cx="12" cy="17" r="0.5" fill="#2d5be3"/>
            </svg>
          </div>

          <h2 className="text-[20px] font-bold text-[#1a1915] mb-2">Account setup in progress</h2>
          <p className="text-[13.5px] text-[#6b6860] mb-6 leading-relaxed">
            Your investor account has been created but your fund data hasn't been linked yet.
            Your fund manager will complete your setup shortly.
          </p>

          {/* Zero metrics preview */}
          <div className="grid grid-cols-2 gap-3 mb-6 text-left">
            {[
              { label: 'Commitment', value: '$0' },
              { label: 'Capital Called', value: '$0' },
              { label: 'Portfolio Value', value: '$0' },
              { label: 'Distributions', value: '$0' },
            ].map(item => (
              <div key={item.label} className="bg-[#f9f8f5] rounded-xl p-3 border border-[#eaeaea]">
                <div className="text-[10.5px] text-[#9b9890] font-medium uppercase tracking-wide mb-1">{item.label}</div>
                <div className="text-[20px] font-bold text-[#c8c6c0]">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="bg-[#fffbeb] border border-[#fde68a] rounded-xl p-4 mb-6 text-left">
            <div className="flex gap-2.5 items-start">
              <svg viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth={2} className="w-4 h-4 mt-0.5 flex-shrink-0">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <div>
                <div className="text-[12.5px] font-semibold text-[#92400e] mb-0.5">Awaiting fund assignment</div>
                <div className="text-[12px] text-[#92400e]">
                  Logged in as <span className="font-medium">{email}</span>. Contact your GP to link your LP record.
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={onSignOut}
            className="w-full py-2.5 rounded-xl border border-[#e8e6df] text-[13px] font-medium text-[#6b6860] hover:bg-[#f5f4f0] transition-colors"
          >
            Sign out
          </button>
        </div>
      </main>
    </div>
  );
}

export default function LPDashboardPage() {
  const router = useRouter();
  const [lp, setLp]             = useState<LP | null>(null);
  const [fund, setFund]         = useState<Fund | null>(null);
  const [txns, setTxns]         = useState<LPTxn[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [valuations, setValuations] = useState<Valuation[]>([]);
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState<'my-share' | 'fund-total'>('my-share');
  const [user, setUser]         = useState<any>(null);
  // null = still loading, true = no LP record linked yet
  const [pendingSetup, setPendingSetup] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) loadData(user.id);
      else router.replace('/login');
    });
  }, []);

  async function loadData(userId: string) {
    setLoading(true);
    try {
      // Get LP record linked to this user
      const { data: lpData } = await supabase
        .from('lps').select('*').eq('user_id', userId).single();

      // No LP record yet — show zero pending state instead of redirecting
      if (!lpData) {
        setPendingSetup(true);
        return;
      }
      setLp(lpData as LP);

      const [
        { data: fundData },
        { data: txnData },
        { data: compData },
        { data: valData },
      ] = await Promise.all([
        supabase.from('funds').select('id,name,vintage,nav,management_fee').eq('id', lpData.fund_id).single(),
        supabase.from('lp_transactions').select('*').eq('lp_id', lpData.id).order('date'),
        supabase.from('companies').select('id,name,sector,stage,invested,unrealised').eq('fund_id', lpData.fund_id).eq('status', 'Active'),
        supabase.from('valuations').select('company_id,quarter,quarter_end,value').eq('fund_id', lpData.fund_id).order('quarter_end'),
      ]);

      setFund(fundData as Fund);
      setTxns((txnData ?? []) as LPTxn[]);
      setCompanies((compData ?? []) as Company[]);
      setValuations((valData ?? []) as Valuation[]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (loading) return (
    <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center">
      <div className="text-center">
        <svg className="animate-spin w-6 h-6 text-[#2d5be3] mx-auto mb-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <p className="text-[13px] text-[#9b9890]">Loading your portfolio…</p>
      </div>
    </div>
  );

  // Show pending setup screen instead of redirecting to login
  if (pendingSetup) {
    return (
      <PendingSetupScreen
        email={user?.email ?? ''}
        onSignOut={handleSignOut}
      />
    );
  }

  if (!lp || !fund) return (
    <div className="min-h-screen bg-[#f5f4f0] flex items-center justify-center">
      <div className="text-center">
        <div className="text-2xl mb-3">🔒</div>
        <div className="text-[14px] font-medium mb-1">No LP account found</div>
        <p className="text-[12.5px] text-[#9b9890] mb-4">Contact your fund manager to set up your investor account.</p>
        <button onClick={handleSignOut} className="text-[12.5px] text-[#2d5be3] hover:underline">Sign out</button>
      </div>
    </div>
  );

  // ── Calculations ────────────────────────────────────────────
  const share = lp.ownership_pct / 100;

  // LP-level
  const capitalCalled   = lp.called;
  const distributions   = lp.distributions;
  const commitment      = lp.commitment;

  // Fund-level totals (for My Share: multiply by share)
  const fundNAV         = fund.nav;
  const myNAV           = fundNAV * share;
  const portfolioValue  = view === 'my-share' ? myNAV : fundNAV;

  // Expenses (management fee applied to LP's called capital)
  const managementFees  = view === 'my-share'
    ? (fund.management_fee / 100) * capitalCalled
    : (fund.management_fee / 100) * txns.reduce((s, t) => t.type === 'Capital Call' ? s + t.amount : s, 0) / share;

  // Net invested
  const netInvested     = view === 'my-share'
    ? capitalCalled - managementFees
    : capitalCalled / share - managementFees;

  // Unrealised gain/loss (LP's share of fund unrealised)
  const fundUnrealised  = companies.reduce((s, c) => s + c.unrealised, 0);
  const myUnrealised    = fundUnrealised * share;
  const unrealisedGL    = view === 'my-share' ? myUnrealised : fundUnrealised;

  // Realised (exits/distributions from transactions)
  const realisedGL      = 0; // simplified — would need exit transactions

  // Undeployed cash
  const deployed        = view === 'my-share'
    ? companies.reduce((s, c) => s + c.invested * share, 0)
    : companies.reduce((s, c) => s + c.invested, 0);
  const undeployedCash  = (view === 'my-share' ? capitalCalled : capitalCalled / share) - deployed - managementFees;

  // Net gain
  const netGain         = unrealisedGL + realisedGL - managementFees - Math.max(0, undeployedCash);
  const netGainPct      = commitment > 0 ? (netGain / commitment * 100).toFixed(1) : '0.0';

  // MOIC
  const totalValue      = portfolioValue + distributions;
  const totalIn         = view === 'my-share' ? capitalCalled : capitalCalled / share;
  const netMOIC         = totalIn > 0 ? totalValue / totalIn : 0;
  const grossMOIC       = (totalIn - managementFees) > 0 ? totalValue / (totalIn - managementFees) : 0;

  // Portfolio value over time (from valuations)
  const latestByCompanyByQuarter: Record<string, Record<string, number>> = {};
  valuations.forEach(v => {
    if (!latestByCompanyByQuarter[v.quarter]) latestByCompanyByQuarter[v.quarter] = {};
    latestByCompanyByQuarter[v.quarter][v.company_id] = v.value;
  });
  const chartData = Object.entries(latestByCompanyByQuarter)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([quarter, vals]) => ({
      quarter,
      value: Object.values(vals).reduce((s, v) => s + v, 0) * (view === 'my-share' ? share : 1),
    }));

  // Capital calls history
  const capitalCalls = txns.filter(t => t.type === 'Capital Call').sort((a, b) => b.date.localeCompare(a.date));

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="min-h-screen bg-[#f5f4f0]">
      {/* ── Header ── */}
      <header className="bg-white border-b border-[#eaeaea] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-[64px] flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 mr-4">
            <div className="w-8 h-8 rounded-lg bg-[#2d5be3] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[13px] font-bold">N</span>
            </div>
            <div>
              <div className="text-[14px] font-semibold text-[#1a1915]">Investor Portal</div>
              <div className="text-[11px] text-[#9b9890]">Welcome back, {lp.name.split(' ')[0]}</div>
            </div>
          </div>

          <div className="h-6 w-px bg-[#eaeaea] mx-1"/>

          {/* Fund name */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f5f4f0] rounded-[8px] border border-[#eaeaea]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-[#9b9890]">
              <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            </svg>
            <span className="text-[12.5px] font-medium">{fund.name}</span>
            <span className="text-[11px] text-[#9b9890]">· {fund.vintage} · {fmt(commitment, true)}</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="text-[11.5px] text-[#9b9890]">Data as at {today}</div>
            {/* User menu */}
            <button onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] border border-[#eaeaea] bg-white hover:bg-[#f5f4f0] transition-colors text-[12.5px]">
              <div className="w-6 h-6 rounded-full bg-[#2d5be3] flex items-center justify-center text-white text-[10px] font-bold">
                {lp.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              {lp.name.split(' ')[0]}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3 text-[#9b9890]">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* ── View toggle ── */}
        <div className="bg-white rounded-xl border border-[#eaeaea] px-5 py-3 mb-6 flex items-center gap-4">
          <span className="text-[13px] text-[#6b6860]">View:</span>
          <div className="flex gap-1">
            <button onClick={() => setView('my-share')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors ${view === 'my-share' ? 'bg-[#2d5be3] text-white' : 'text-[#6b6860] hover:bg-[#f5f4f0]'}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              My Share
              <span className={`px-1.5 py-0.5 rounded text-[10.5px] font-semibold ${view === 'my-share' ? 'bg-white/20 text-white' : 'bg-[#f0efe9] text-[#6b6860]'}`}>
                {pct(share)}
              </span>
            </button>
            <button onClick={() => setView('fund-total')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors ${view === 'fund-total' ? 'bg-[#2d5be3] text-white' : 'text-[#6b6860] hover:bg-[#f5f4f0]'}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
              </svg>
              Fund Total
            </button>
          </div>
        </div>

        {/* ── Name + fund ── */}
        <div className="mb-5">
          <h1 className="text-[24px] font-bold text-[#1a1915]">{view === 'my-share' ? lp.name : fund.name}</h1>
          <p className="text-[13px] text-[#9b9890]">
            {fund.name} · as at {today}
            {view === 'my-share' && <span className="ml-2 px-2 py-0.5 bg-[#eef2fd] text-[#2d5be3] rounded-full text-[11px] font-medium">{pct(share)} ownership</span>}
          </p>
        </div>

        {/* ── Gross to Net Bridge ── */}
        <div className="bg-white rounded-xl border border-[#eaeaea] p-6 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[15px] font-semibold">Gross to Net Bridge</span>
            <span className="text-[12px] text-[#9b9890]">How Unrealised Gain reconciles to Net Gain</span>
          </div>
          <BridgeRow label="Unrealised Capital Gain" value={fmt(Math.max(0, unrealisedGL))} />
          {realisedGL < 0 && <BridgeRow label="Less: Realised Loss" value={`(${fmt(Math.abs(realisedGL))})`} color="text-red-500" />}
          <BridgeRow label="Less: Admin Fee" value={`(${fmt(managementFees)})`} />
          <BridgeRow label="Less: Undeployed Cash" value={`(${fmt(Math.max(0, undeployedCash))})`} />
          <div className="mt-2 pt-2 border-t-2 border-[#1a1915]">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-[15px] font-bold">Net Gain to {view === 'my-share' ? 'LP' : 'Fund'}</div>
                <div className="text-[12px] text-[#9b9890]">On {fmt(commitment)} Commitment</div>
              </div>
              <div className="text-right">
                <div className={`text-[18px] font-bold ${netGain >= 0 ? 'text-green-600' : 'text-red-500'}`}>{netGain >= 0 ? '' : '-'}{fmt(Math.abs(netGain))}</div>
                <div className="text-[12px] text-[#9b9890]">{netGainPct}%</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Metrics Cards ── */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <StatCard label="Capital Called" value={fmt(view === 'my-share' ? capitalCalled : capitalCalled / share)} sub="Σ capital calls" />
          <StatCard label="Admin Fee" value={fmt(managementFees)} sub="Σ fees & expenses" />
          <StatCard label="Net Invested Capital" value={fmt(netInvested)} sub="Called – Fees" />
          <StatCard label="Portfolio Value" value={fmt(portfolioValue)} sub="Current NAV" color="text-[#2d5be3]" />
        </div>
        <div className="grid grid-cols-3 gap-3 mb-5">
          <StatCard label="Unrealised Gain / Loss" value={fmt(unrealisedGL)} sub="Fair value – cost" color={unrealisedGL >= 0 ? 'text-green-600' : 'text-red-500'} />
          <StatCard label="Distributions" value={fmt(distributions)} sub="Cash received" />
          <StatCard label="Total Value" value={fmt(portfolioValue + distributions)} sub="NAV + Distributions" />
        </div>

        {/* ── Returns ── */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          {/* Net Returns */}
          <div className="bg-white rounded-xl border border-[#eaeaea] p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[14px] font-semibold">Net Returns</span>
              <span className="px-2 py-0.5 bg-[#f0efe9] text-[#6b6860] rounded text-[11px]">Including Fees</span>
            </div>
            <div className="space-y-2 mb-4 pb-4 border-b border-[#f0efe9]">
              <div className="flex justify-between text-[13px]"><span className="text-[#6b6860]">Portfolio Value</span><span className="font-mono">{fmt(portfolioValue)}</span></div>
              <div className="flex justify-between text-[13px]"><span className="text-[#6b6860]">+ Distributions</span><span className="font-mono">{fmt(distributions)}</span></div>
              <div className="flex justify-between text-[13px]"><span className="text-[#6b6860]">÷ Total Paid In</span><span className="font-mono">{fmt(totalIn)}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#f9f8f5] rounded-lg p-3">
                <div className="text-[10.5px] text-[#9b9890] uppercase tracking-wide mb-1">NET MOIC</div>
                <div className="text-[22px] font-bold">{moic(netMOIC)}</div>
              </div>
              <div className="bg-[#f9f8f5] rounded-lg p-3">
                <div className="text-[10.5px] text-[#9b9890] uppercase tracking-wide mb-1">NET IRR</div>
                <div className="text-[22px] font-bold">{lp.ownership_pct > 0 ? (lp.distributions > 0 ? '~' : '') + (netMOIC > 1 ? ((netMOIC - 1) * 25).toFixed(1) : '0.0') + '%' : '—'}</div>
              </div>
            </div>
          </div>

          {/* Gross Returns */}
          <div className="bg-white rounded-xl border border-[#eaeaea] p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[14px] font-semibold">Gross Returns</span>
              <span className="px-2 py-0.5 bg-[#f0efe9] text-[#6b6860] rounded text-[11px]">Excluding Fees</span>
            </div>
            <div className="space-y-2 mb-4 pb-4 border-b border-[#f0efe9]">
              <div className="flex justify-between text-[13px]"><span className="text-[#6b6860]">Portfolio Value</span><span className="font-mono">{fmt(portfolioValue)}</span></div>
              <div className="flex justify-between text-[13px]"><span className="text-[#6b6860]">+ Distributions</span><span className="font-mono">{fmt(distributions)}</span></div>
              <div className="flex justify-between text-[13px]"><span className="text-[#6b6860]">÷ Invested Capital</span><span className="font-mono">{fmt(netInvested)}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#f9f8f5] rounded-lg p-3">
                <div className="text-[10.5px] text-[#9b9890] uppercase tracking-wide mb-1">GROSS MOIC</div>
                <div className="text-[22px] font-bold">{moic(grossMOIC)}</div>
              </div>
              <div className="bg-[#f9f8f5] rounded-lg p-3">
                <div className="text-[10.5px] text-[#9b9890] uppercase tracking-wide mb-1">GROSS IRR</div>
                <div className="text-[22px] font-bold">{grossMOIC > 1 ? ((grossMOIC - 1) * 25).toFixed(1) + '%' : '—'}</div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-[11.5px] text-[#9b9890] mb-6">
          Net returns reflect actual investor experience including fees. Gross returns show underlying portfolio performance before fees.
        </p>

        {/* ── Portfolio Value Chart ── */}
        {chartData.length > 1 && (
          <div className="bg-white rounded-xl border border-[#eaeaea] p-6 mb-5">
            <div className="flex items-center gap-2 mb-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#2d5be3]">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              <span className="text-[15px] font-semibold">Portfolio Value Over Time</span>
            </div>
            <p className="text-[12px] text-[#9b9890] mb-5">Quarterly NAV progression</p>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2d5be3" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#2d5be3" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0efe9" vertical={false}/>
                <XAxis dataKey="quarter" tick={{ fontSize: 11, fill: '#9b9890' }} axisLine={false} tickLine={false}/>
                <YAxis tickFormatter={v => fmt(v, true)} tick={{ fontSize: 11, fill: '#9b9890' }} axisLine={false} tickLine={false} width={60}/>
                <Tooltip
                  formatter={(v: any) => [fmt(Number(v)), 'Portfolio Value']}
                  contentStyle={{ fontSize: 12, border: '1px solid #e8e6df', borderRadius: 8 }}/>
                <Area type="monotone" dataKey="value" stroke="#2d5be3" strokeWidth={2} fill="url(#navGrad)" dot={{ fill: '#2d5be3', r: 3 }}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Capital Flow + Returns & Value ── */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          {/* Capital Flow */}
          <div className="bg-white rounded-xl border border-[#eaeaea] p-5">
            <div className="flex items-center gap-2 mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#6b6860]">
                <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
              <span className="text-[14px] font-semibold">Capital Flow</span>
            </div>
            <p className="text-[11.5px] text-[#9b9890] mb-4">From commitment to deployment</p>

            {[
              { n: '1', label: 'COMMITMENT', title: 'Committed Capital', value: fmt(commitment), sub: 'Total commitment to fund' },
              { n: '2', label: 'CAPITAL CALLED', title: 'Called Capital', value: fmt(capitalCalled), sub: 'Total capital called from LP' },
              { n: '3', label: 'FEES & EXPENSES', title: 'Admin Fee', value: fmt(managementFees), sub: 'Management fees' },
              { n: '4', label: 'DEPLOYED', title: 'Invested in Companies', value: fmt(deployed), sub: 'Net Invested – Cash' },
            ].map(row => (
              <div key={row.n} className="bg-[#f9f8f5] rounded-lg p-3 mb-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-5 h-5 rounded-full bg-[#e8e6df] flex items-center justify-center text-[10px] font-bold text-[#6b6860]">{row.n}</div>
                  <span className="text-[10px] font-semibold text-[#9b9890] uppercase tracking-wide">{row.label}</span>
                </div>
                <div className="text-[13px] text-[#6b6860] mb-0.5">{row.title}</div>
                <div className="text-[20px] font-bold">{row.value}</div>
                <div className="text-[11px] text-[#9b9890]">{row.sub}</div>
              </div>
            ))}
          </div>

          {/* Returns & Value */}
          <div className="bg-white rounded-xl border border-[#eaeaea] p-5">
            <div className="flex items-center gap-2 mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#6b6860]">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
              </svg>
              <span className="text-[14px] font-semibold">Returns & Value</span>
            </div>
            <p className="text-[11.5px] text-[#9b9890] mb-4">Current value and returns</p>

            {[
              { label: 'PORTFOLIO VALUE', title: 'Current NAV', value: fmt(portfolioValue), sub: 'Current valuation of holdings', color: 'text-[#2d5be3]' },
              { label: 'DISTRIBUTIONS', title: 'Cash Received', value: fmt(distributions), sub: 'From portfolio exits' },
              { label: 'TOTAL VALUE', title: 'NAV + Distributions', value: fmt(portfolioValue + distributions), sub: 'Combined value' },
            ].map(row => (
              <div key={row.label} className="bg-[#f9f8f5] rounded-lg p-3 mb-2">
                <div className="text-[10px] font-semibold text-[#9b9890] uppercase tracking-wide mb-1">{row.label}</div>
                <div className="text-[13px] text-[#6b6860] mb-0.5">{row.title}</div>
                <div className={`text-[20px] font-bold ${row.color ?? ''}`}>{row.value}</div>
                <div className="text-[11px] text-[#9b9890]">{row.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Portfolio Companies ── */}
        <div className="bg-white rounded-xl border border-[#eaeaea] p-6 mb-5">
          <div className="flex items-center gap-2 mb-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#6b6860]">
              <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            <span className="text-[15px] font-semibold">Portfolio Companies</span>
          </div>
          <p className="text-[12px] text-[#9b9890] mb-5">
            Active companies in {fund.name}
            {view === 'my-share' && <span className="ml-1">· Your share is {pct(share)}</span>}
          </p>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#f0efe9]">
                {['Company', 'Sector', 'Stage', 'Current Value', 'Gain / Loss'].map(h => (
                  <th key={h} className={`text-[11px] font-semibold text-[#9b9890] tracking-wide pb-2 ${h === 'Current Value' || h === 'Gain / Loss' ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f9f8f5]">
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[13px] text-[#9b9890]">No portfolio companies yet</td>
                </tr>
              ) : companies.map(c => {
                const myInvested = c.invested * (view === 'my-share' ? share : 1);
                const myFV = (c.invested + c.unrealised) * (view === 'my-share' ? share : 1);
                const gl = myFV - myInvested;
                return (
                  <tr key={c.id} className="hover:bg-[#fafaf8] transition-colors">
                    <td className="py-3 text-[13px] font-medium">{c.name}</td>
                    <td className="py-3 text-[12.5px] text-[#6b6860]">{c.sector ?? '—'}</td>
                    <td className="py-3 text-[12.5px] text-[#6b6860]">{c.stage ?? '—'}</td>
                    <td className="py-3 text-[13px] font-mono text-right">{fmt(myFV)}</td>
                    <td className={`py-3 text-[13px] font-mono text-right ${gl >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {gl >= 0 ? '+' : ''}{fmt(gl)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Capital Calls History ── */}
        <div className="bg-white rounded-xl border border-[#eaeaea] p-6 mb-8">
          <div className="flex items-center gap-2 mb-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#6b6860]">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span className="text-[15px] font-semibold">Capital Calls</span>
          </div>
          <p className="text-[12px] text-[#9b9890] mb-5">History of capital calls and distributions</p>
          {txns.length === 0 ? (
            <p className="text-[13px] text-[#9b9890] py-4 text-center">No transactions yet</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#f0efe9]">
                  {['Date', 'Type', 'Amount', 'Notes'].map(h => (
                    <th key={h} className={`text-[11px] font-semibold text-[#9b9890] tracking-wide pb-2 ${h === 'Amount' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f9f8f5]">
                {txns.slice().reverse().map(t => (
                  <tr key={t.id} className="hover:bg-[#fafaf8] transition-colors">
                    <td className="py-3 text-[13px]">{new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${t.type === 'Capital Call' ? 'bg-blue-50 text-blue-700' : t.type === 'Distribution' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {t.type}
                      </span>
                    </td>
                    <td className={`py-3 text-[13px] font-mono text-right ${t.type === 'Distribution' ? 'text-green-600' : ''}`}>
                      {t.type === 'Distribution' ? '+' : ''}{fmt(t.amount)}
                    </td>
                    <td className="py-3 text-[12.5px] text-[#9b9890]">{t.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#eaeaea]">
                  <td colSpan={2} className="pt-3 text-[13px] font-semibold">Total Called</td>
                  <td className="pt-3 text-[13px] font-mono font-bold text-right">{fmt(capitalCalled)}</td>
                  <td/>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
