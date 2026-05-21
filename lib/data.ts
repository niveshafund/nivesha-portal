// Nivesha Ventures — Static Data Layer
// Phase 1: Static data | Phase 2: Replace with Supabase queries

export type FundStatus = 'Active' | 'Fundraising' | 'Closed';

export type Fund = {
  id: string;
  name: string;
  vintage: number;
  committed: number;
  called: number;
  invested: number;
  nav: number;
  distributions: number;
  moic: number;
  irr: number;
  dpi: number;
  managementFee: number;
  carriedInterest: number;
  status: FundStatus;
  focus: string[];
  lpCount: number;
  companyCount: number;
  startDate: string;
  endDate?: string;
};

export type Company = {
  id: string;
  fundId: string;
  name: string;
  sector: string;
  invested: number;
  unrealised: number;
  distributions: number;
  moic: number;
  irr: number;
  status: 'Active' | 'Exited' | 'Written Off';
  investmentDate?: string;
  stage?: string;
  website?: string;
};

export type Transaction = {
  id: string;
  fundId: string;
  date: string;
  type: 'Investment' | 'Distribution' | 'Exit' | 'Capital Call' | 'Fee';
  amount: number;
  company: string;
  instrument: 'Equity' | 'Convertible Note' | 'SAFE' | 'Other';
  description: string;
};

export type LP = {
  id: string;
  fundId: string;
  name: string;
  email: string;
  type: 'Individual' | 'Institution' | 'Family Office' | 'Corporate';
  commitment: number;
  called: number;
  distributions: number;
  ownership: number;
  status: 'Active' | 'Inactive' | 'Pending';
  joinDate?: string;
};

export const FUNDS: Fund[] = [
  {
    id: 'fund-1',
    name: 'Nivesha Ventures Fund',
    vintage: 2024,
    committed: 6425000,
    called: 5710993,
    invested: 5710993,
    nav: 8978262,
    distributions: 0,
    moic: 1.57,
    irr: 43.6,
    dpi: 0.0,
    managementFee: 2.0,
    carriedInterest: 20,
    status: 'Active',
    focus: ['Healthcare Tech', 'Fintech', 'SpaceTech', 'B2B SaaS'],
    lpCount: 50,
    companyCount: 42,
    startDate: 'Jan 2024',
  },
];

export const FUND = FUNDS[0];

export const COMPANIES: Company[] = [
  { id: 'c1',  fundId: 'fund-1', name: 'Swirepay Inc.',            sector: 'FinTech',           invested: 300000, unrealised: 1200000, distributions: 0, moic: 4.92, irr: 128.0,  status: 'Active',      investmentDate: '1 Mar 2024',  stage: 'Series Seed' },
  { id: 'c2',  fundId: 'fund-1', name: 'Hosted.AI',                sector: 'AI',                invested: 200000, unrealised: 950000,  distributions: 0, moic: 4.75, irr: 208.4,  status: 'Active',      investmentDate: '10 Feb 2025', stage: 'Pre-Seed' },
  { id: 'c3',  fundId: 'fund-1', name: 'Careflick',                sector: 'Healthcare AI',     invested: 25000,  unrealised: 125000,  distributions: 0, moic: 5.00, irr: 111.0,  status: 'Active',      investmentDate: 'Jun 2024',    stage: 'Pre-Seed' },
  { id: 'c4',  fundId: 'fund-1', name: 'VotersAI',                 sector: 'GovTech',           invested: 100000, unrealised: 450000,  distributions: 0, moic: 3.00, irr: 1000.0, status: 'Active',      investmentDate: '7 Apr 2026',  stage: 'Pre-Seed' },
  { id: 'c5',  fundId: 'fund-1', name: 'Phonely.ai',               sector: 'AI',                invested: 109993, unrealised: 400000,  distributions: 0, moic: 2.30, irr: 133.2,  status: 'Active',      investmentDate: '26 Jan 2026', stage: 'Series Seed' },
  { id: 'c6',  fundId: 'fund-1', name: 'Zime.Ai',                  sector: 'AI',                invested: 200000, unrealised: 512500,  distributions: 0, moic: 2.56, irr: 76.9,   status: 'Active',      investmentDate: '19 Mar 2025', stage: 'Pre-Seed' },
  { id: 'c7',  fundId: 'fund-1', name: 'Vyapar',                   sector: 'B2B SaaS',          invested: 150000, unrealised: 300000,  distributions: 0, moic: 2.00, irr: 65.0,   status: 'Active',      investmentDate: 'Mar 2024',    stage: 'Series B' },
  { id: 'c8',  fundId: 'fund-1', name: 'MultiSet.ai',              sector: 'AI',                invested: 200000, unrealised: 300000,  distributions: 0, moic: 1.50, irr: 97.1,   status: 'Active',      investmentDate: '5 Nov 2024',  stage: 'Series Seed' },
  { id: 'c9',  fundId: 'fund-1', name: 'Blink AI Payments',        sector: 'Fintech',           invested: 100000, unrealised: 166667,  distributions: 0, moic: 1.67, irr: 160.0,  status: 'Active',      investmentDate: '10 Apr 2024', stage: 'Pre-Seed' },
  { id: 'c10', fundId: 'fund-1', name: 'Wink',                     sector: 'Consumer Tech',     invested: 250000, unrealised: 338676,  distributions: 0, moic: 1.35, irr: 22.8,   status: 'Active',      investmentDate: 'Dec 2024',    stage: 'Series Seed' },
  { id: 'c11', fundId: 'fund-1', name: 'Sarvam AI',                sector: 'AI',                invested: 150000, unrealised: 200000,  distributions: 0, moic: 1.33, irr: 28.0,   status: 'Active',      investmentDate: 'Apr 2024',    stage: 'Series A' },
  { id: 'c12', fundId: 'fund-1', name: 'Unbox Robotics',           sector: 'Robotics',          invested: 100000, unrealised: 130000,  distributions: 0, moic: 1.30, irr: 24.0,   status: 'Active',      investmentDate: 'May 2024',    stage: 'Series A' },
  { id: 'c13', fundId: 'fund-1', name: 'Bayesline',                sector: 'Data Science',      invested: 25000,  unrealised: 32000,   distributions: 0, moic: 1.28, irr: 15.5,   status: 'Active',      investmentDate: '1 May 2024',  stage: 'Pre-Seed' },
  { id: 'c14', fundId: 'fund-1', name: 'Enedym',                   sector: 'CleanTech',         invested: 300000, unrealised: 300000,  distributions: 0, moic: 1.25, irr: 11.4,   status: 'Active',      investmentDate: '12 Jul 2024', stage: 'Series A' },
  { id: 'c15', fundId: 'fund-1', name: 'Z21 Ventures HEN Nozzles', sector: 'Hardware',          invested: 200000, unrealised: 249000,  distributions: 0, moic: 1.25, irr: 15.0,   status: 'Active',      investmentDate: 'Aug 2024',    stage: 'Series Seed' },
  { id: 'c16', fundId: 'fund-1', name: 'Firstshift Inc',           sector: 'Supply Chain',      invested: 150000, unrealised: 173438,  distributions: 0, moic: 1.16, irr: 7.6,    status: 'Active',      investmentDate: 'Jun 2024',    stage: 'Series Seed' },
  { id: 'c17', fundId: 'fund-1', name: 'Bimaplan',                 sector: 'InsurTech',         invested: 50000,  unrealised: 55000,   distributions: 0, moic: 1.10, irr: 8.0,    status: 'Active',      investmentDate: 'Jul 2024',    stage: 'Pre-Seed' },
  { id: 'c18', fundId: 'fund-1', name: 'Wellth',                   sector: 'Healthcare Tech',   invested: 75000,  unrealised: 80000,   distributions: 0, moic: 1.07, irr: 5.0,    status: 'Active',      investmentDate: 'Aug 2024',    stage: 'Series Seed' },
  { id: 'c19', fundId: 'fund-1', name: 'Distacart',                sector: 'eCommerce',         invested: 300000, unrealised: 300000,  distributions: 0, moic: 1.04, irr: 3.8,    status: 'Active',      investmentDate: '14 Oct 2024', stage: 'Series B' },
  { id: 'c20', fundId: 'fund-1', name: 'PitchPerfect AI',          sector: 'AI',                invested: 100000, unrealised: 120000,  distributions: 0, moic: 1.20, irr: 18.0,   status: 'Active',      investmentDate: 'Sep 2024',    stage: 'Pre-Seed' },
  { id: 'c21', fundId: 'fund-1', name: 'Tapchief',                 sector: 'Future of Work',    invested: 50000,  unrealised: 60000,   distributions: 0, moic: 1.20, irr: 14.0,   status: 'Active',      investmentDate: 'Oct 2024',    stage: 'Series Seed' },
  { id: 'c22', fundId: 'fund-1', name: 'Tazapay',                  sector: 'Fintech',           invested: 200000, unrealised: 240000,  distributions: 0, moic: 1.20, irr: 19.5,   status: 'Active',      investmentDate: 'Nov 2024',    stage: 'Series A' },
  { id: 'c23', fundId: 'fund-1', name: 'Aeron Systems',            sector: 'Aerospace',         invested: 100000, unrealised: 120000,  distributions: 0, moic: 1.20, irr: 16.0,   status: 'Active',      investmentDate: 'Dec 2024',    stage: 'Series Seed' },
  { id: 'c24', fundId: 'fund-1', name: 'AECinspire',               sector: 'PropTech',          invested: 100000, unrealised: 100000,  distributions: 0, moic: 1.00, irr: 0.0,    status: 'Active',      investmentDate: '2 Sep 2024',  stage: 'Series Seed' },
  { id: 'c25', fundId: 'fund-1', name: 'Arka - Bruviti',           sector: 'Industrial AI',     invested: 150000, unrealised: 150000,  distributions: 0, moic: 1.00, irr: 0.0,    status: 'Active',      investmentDate: '15 Jun 2025', stage: 'Series A' },
  { id: 'c26', fundId: 'fund-1', name: 'Arka - Catalyx',           sector: 'Industrial AI',     invested: 100000, unrealised: 100000,  distributions: 0, moic: 1.00, irr: 0.0,    status: 'Active',      investmentDate: '20 Aug 2024', stage: 'Series Seed' },
  { id: 'c27', fundId: 'fund-1', name: 'Cactus',                   sector: 'AgTech',            invested: 50000,  unrealised: 50000,   distributions: 0, moic: 1.00, irr: 0.0,    status: 'Active',      investmentDate: '18 Jun 2025', stage: 'Pre-Seed' },
  { id: 'c28', fundId: 'fund-1', name: 'Constellation Space',      sector: 'SpaceTech',         invested: 100000, unrealised: 100000,  distributions: 0, moic: 1.00, irr: 0.0,    status: 'Active',      investmentDate: '31 Mar 2026', stage: 'Pre-Seed' },
  { id: 'c29', fundId: 'fund-1', name: 'Felefax.Ai',               sector: 'AI',                invested: 25000,  unrealised: 25000,   distributions: 0, moic: 1.00, irr: 0.0,    status: 'Active',      investmentDate: '5 Jan 2024',  stage: 'Pre-Seed' },
  { id: 'c30', fundId: 'fund-1', name: 'GetASAP',                  sector: 'Delivery',          invested: 200000, unrealised: 200000,  distributions: 0, moic: 1.00, irr: 0.0,    status: 'Active',      investmentDate: '15 Jun 2024', stage: 'Pre-Seed' },
  { id: 'c31', fundId: 'fund-1', name: 'Istakapaza',               sector: 'eCommerce',         invested: 250000, unrealised: 250000,  distributions: 0, moic: 1.00, irr: 0.0,    status: 'Active',      investmentDate: '15 Jan 2024', stage: 'Series A' },
  { id: 'c32', fundId: 'fund-1', name: 'Lightberry',               sector: 'Consumer Tech',     invested: 100000, unrealised: 100000,  distributions: 0, moic: 1.00, irr: 0.0,    status: 'Active',      investmentDate: '3 Jan 2026',  stage: 'Series Seed' },
  { id: 'c33', fundId: 'fund-1', name: 'Mobileforce',              sector: 'B2B SaaS',          invested: 100000, unrealised: 100000,  distributions: 0, moic: 1.00, irr: 0.0,    status: 'Active',      investmentDate: 'Feb 2024',    stage: 'Series B' },
  { id: 'c34', fundId: 'fund-1', name: 'XCaliber-Nivesha',         sector: 'Healthcare Tech',   invested: 251000, unrealised: 251000,  distributions: 0, moic: 1.00, irr: 0.0,    status: 'Active',      investmentDate: '4 Jun 2025',  stage: 'Series Seed' },
  { id: 'c35', fundId: 'fund-1', name: 'Syntra',                   sector: 'B2B SaaS',          invested: 50000,  unrealised: 50000,   distributions: 0, moic: 1.00, irr: 0.0,    status: 'Active',      investmentDate: 'Mar 2024',    stage: 'Pre-Seed' },
  { id: 'c36', fundId: 'fund-1', name: 'Travel Partner',           sector: 'Travel Tech',       invested: 200000, unrealised: 0,        distributions: 0, moic: 0.00, irr: 0.0,    status: 'Active',      investmentDate: 'Apr 2024',    stage: 'Series Seed' },
  { id: 'c37', fundId: 'fund-1', name: 'Voicebox',                 sector: 'AI',                invested: 200000, unrealised: 200000,  distributions: 0, moic: 1.00, irr: 0.0,    status: 'Active',      investmentDate: 'May 2024',    stage: 'Pre-Seed' },
  { id: 'c38', fundId: 'fund-1', name: 'Peel Insights',            sector: 'eCommerce',         invested: 50000,  unrealised: 50000,   distributions: 0, moic: 1.00, irr: 0.0,    status: 'Active',      investmentDate: 'Jun 2024',    stage: 'Pre-Seed' },
  { id: 'c39', fundId: 'fund-1', name: 'Spotmentor',               sector: 'HRTech',            invested: 75000,  unrealised: 75000,   distributions: 0, moic: 1.00, irr: 0.0,    status: 'Active',      investmentDate: 'Jul 2024',    stage: 'Series Seed' },
  { id: 'c40', fundId: 'fund-1', name: 'Yeshe',                    sector: 'EdTech',            invested: 50000,  unrealised: 50000,   distributions: 0, moic: 1.00, irr: 0.0,    status: 'Active',      investmentDate: 'Aug 2024',    stage: 'Pre-Seed' },
  { id: 'c41', fundId: 'fund-1', name: 'ZestMoney',                sector: 'Fintech',           invested: 100000, unrealised: 85000,   distributions: 0, moic: 0.85, irr: -12.0,  status: 'Active',      investmentDate: 'Sep 2024',    stage: 'Series C' },
  { id: 'c42', fundId: 'fund-1', name: 'Inspirit',                 sector: 'EdTech',            invested: 50000,  unrealised: 0,        distributions: 0, moic: 0.00, irr: -100.0, status: 'Written Off', investmentDate: 'Oct 2024',    stage: 'Pre-Seed' },
];

export const TRANSACTIONS: Transaction[] = [
  { id: 't1',  fundId: 'fund-1', date: '7 Apr 2026',  type: 'Investment', amount: 100000, company: 'VotersAI',           instrument: 'Convertible Note', description: 'Safe - Series preseed - With Valuation cap no discount' },
  { id: 't2',  fundId: 'fund-1', date: '31 Mar 2026', type: 'Investment', amount: 100000, company: 'Constellation Space', instrument: 'Convertible Note', description: 'Post money at valuation cap' },
  { id: 't3',  fundId: 'fund-1', date: '26 Jan 2026', type: 'Investment', amount: 109993, company: 'Phonely.ai',          instrument: 'Equity',           description: 'Shares @ 11.1975' },
  { id: 't4',  fundId: 'fund-1', date: '3 Jan 2026',  type: 'Investment', amount: 100000, company: 'Lightberry',          instrument: 'Other',            description: 'Safe - With Valuation cap - No Discount, Series Seed' },
  { id: 't5',  fundId: 'fund-1', date: '10 Dec 2025', type: 'Investment', amount: 100000, company: 'Swirepay Inc.',       instrument: 'Other',            description: 'Series Seed' },
  { id: 't6',  fundId: 'fund-1', date: '18 Jun 2025', type: 'Investment', amount: 50000,  company: 'Cactus',              instrument: 'Other',            description: 'Safe - With valuation cap no Discount - Series Seed' },
  { id: 't7',  fundId: 'fund-1', date: '15 Jun 2025', type: 'Investment', amount: 150000, company: 'Arka - Bruviti',      instrument: 'Other',            description: 'Preferred Stock - Series A' },
  { id: 't8',  fundId: 'fund-1', date: '4 Jun 2025',  type: 'Investment', amount: 251000, company: 'XCaliber-Nivesha',    instrument: 'Other',            description: 'Safe - With valuation cap 20% Discount - Series Seed' },
  { id: 't9',  fundId: 'fund-1', date: '19 Mar 2025', type: 'Investment', amount: 100000, company: 'Zime.Ai',             instrument: 'Other',            description: 'Safe - With Valuation cap - No Discount, Series Pre Seed' },
  { id: 't10', fundId: 'fund-1', date: '18 Feb 2025', type: 'Investment', amount: 100000, company: 'Wink',                instrument: 'Other',            description: 'Convertible notes - With valuation cap 20% Discount' },
  { id: 't11', fundId: 'fund-1', date: '10 Feb 2025', type: 'Investment', amount: 200000, company: 'Hosted.AI',           instrument: 'Other',            description: 'Safe - With Valuation cap - No Discount, Series Pre Seed' },
  { id: 't12', fundId: 'fund-1', date: '10 Dec 2024', type: 'Investment', amount: 150000, company: 'Wink',                instrument: 'Other',            description: 'Preferred Stocks - Series Seeds' },
  { id: 't13', fundId: 'fund-1', date: '5 Nov 2024',  type: 'Investment', amount: 200000, company: 'MultiSet.ai',         instrument: 'Other',            description: 'Safe - Series Seed' },
  { id: 't14', fundId: 'fund-1', date: '14 Oct 2024', type: 'Investment', amount: 300000, company: 'Distacart',           instrument: 'Equity',           description: 'Series Seed equity round' },
  { id: 't15', fundId: 'fund-1', date: '2 Sep 2024',  type: 'Investment', amount: 100000, company: 'AECinspire',          instrument: 'Other',            description: 'Series Seed SAFE' },
  { id: 't16', fundId: 'fund-1', date: '20 Aug 2024', type: 'Investment', amount: 100000, company: 'Arka - Catalyx',      instrument: 'Other',            description: 'Series Seed SAFE' },
  { id: 't17', fundId: 'fund-1', date: '12 Jul 2024', type: 'Investment', amount: 300000, company: 'Enedym',              instrument: 'Equity',           description: 'Equity - Series A participation' },
  { id: 't18', fundId: 'fund-1', date: '15 Jun 2024', type: 'Investment', amount: 200000, company: 'GetASAP',             instrument: 'Other',            description: 'Convertible Note - Series Pre Seed' },
  { id: 't19', fundId: 'fund-1', date: '1 May 2024',  type: 'Investment', amount: 25000,  company: 'Bayesline',           instrument: 'Other',            description: 'SAFE - No Discount, valuation cap $1M' },
  { id: 't20', fundId: 'fund-1', date: '10 Apr 2024', type: 'Investment', amount: 100000, company: 'Blink AI Payments',   instrument: 'Convertible Note', description: 'Post-money SAFE with 20% discount' },
  { id: 't21', fundId: 'fund-1', date: '1 Mar 2024',  type: 'Investment', amount: 300000, company: 'Swirepay Inc.',       instrument: 'Equity',           description: 'Series Seed equity - 3.2M post-money' },
  { id: 't22', fundId: 'fund-1', date: '15 Jan 2024', type: 'Investment', amount: 250000, company: 'Istakapaza',          instrument: 'Other',            description: 'Series A follow-on - preferred stock' },
  { id: 't23', fundId: 'fund-1', date: '5 Jan 2024',  type: 'Investment', amount: 25000,  company: 'Felefax.Ai',          instrument: 'Other',            description: 'Pre-seed SAFE' },
];

export const LPS: LP[] = [
  { id: 'lp1', fundId: 'fund-1', name: 'Sunil Potti', email: 'sunil@niveshaventures.com',  type: 'Individual', commitment: 100000, called: 100000, distributions: 0, ownership: 1.56, status: 'Active', joinDate: 'Jan 2024' },
  { id: 'lp2', fundId: 'fund-1', name: 'Rakesh',      email: 'rakesh@niveshaventures.com', type: 'Individual', commitment: 250000, called: 220000, distributions: 0, ownership: 3.89, status: 'Active', joinDate: 'Jan 2024' },
];

export const fmt = (n: number): string => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
};

export const fmtFull = (n: number): string => `$${n.toLocaleString()}`;
export const fmtPct  = (n: number): string => `${n.toFixed(1)}%`;

export const moicColor = (m: number): string => {
  if (m >= 3)         return 'text-green-600 font-semibold';
  if (m >= 1.2)       return 'text-amber-600 font-semibold';
  if (m > 0 && m < 1) return 'text-red-600 font-semibold';
  return 'text-gray-400';
};

export const irrColor = (i: number): string =>
  i > 0 ? 'text-green-600' : i < 0 ? 'text-red-600' : 'text-gray-400';

export const statusBadge = (s: FundStatus): string => ({
  Active:      'bg-green-50 text-green-700',
  Fundraising: 'bg-blue-50 text-blue-700',
  Closed:      'bg-gray-100 text-gray-500',
}[s]);

export const coInitials = (name: string): string => name.slice(0, 2).toUpperCase();

const palette = ['#2d5be3','#16a34a','#d97706','#7c3aed','#dc2626','#0891b2','#be185d','#059669','#b45309','#1d4ed8','#6d28d9','#0f766e'];

export const coColor = (name: string): string => {
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return palette[Math.abs(hash) % palette.length];
};

export const getCompaniesByFund  = (fundId: string) => COMPANIES.filter(c  => c.fundId  === fundId);
export const getLPsByFund        = (fundId: string) => LPS.filter(lp        => lp.fundId === fundId);
export const getTransactionsByFund = (fundId: string) => TRANSACTIONS.filter(t => t.fundId === fundId);
