// Nivesha Ventures Fund — Static Data
// Replace with Supabase queries in Phase 2

export type Company = {
  id: string;
  name: string;
  sector: string;
  invested: number;
  unrealised: number;
  distributions: number;
  moic: number;
  irr: number;
  status: 'Active' | 'Exited';
};

export type Transaction = {
  id: string;
  date: string;
  type: 'Investment' | 'Distribution' | 'Exit';
  amount: number;
  company: string;
  fund: string;
  instrument: 'Equity' | 'Convertible Note' | 'SAFE' | 'Other';
  description: string;
};

export type LP = {
  id: string;
  name: string;
  email: string;
  commitment: number;
  called: number;
  ownership: number;
  status: 'Active' | 'Inactive';
};

export const FUND = {
  name: 'Nivesha Ventures Fund',
  vintage: 2024,
  committed: 6425000,
  invested: 5710993,
  nav: 8978262,
  distributions: 0,
  moic: 1.57,
  irr: 43.6,
  dpi: 0.0,
  status: 'Active',
  focus: ['Healthcare Tech', 'Fintech', 'SpaceTech', 'B2B SaaS'],
  uncalled: 714007,
};

export const COMPANIES: Company[] = [
  { id: 'c1',  name: 'Swirepay Inc.',           sector: 'FinTech / Financial Services', invested: 300000, unrealised: 1200000, distributions: 0, moic: 4.92, irr: 128.0, status: 'Active' },
  { id: 'c2',  name: 'Hosted.AI',               sector: 'AI / Infrastructure',          invested: 200000, unrealised: 950000,  distributions: 0, moic: 4.75, irr: 208.4, status: 'Active' },
  { id: 'c3',  name: 'Careflick',               sector: 'Healthcare AI',                invested: 25000,  unrealised: 125000,  distributions: 0, moic: 5.00, irr: 111.0, status: 'Active' },
  { id: 'c4',  name: 'VotersAI',                sector: 'GovTech',                      invested: 100000, unrealised: 450000,  distributions: 0, moic: 3.00, irr: 1000.0,status: 'Active' },
  { id: 'c5',  name: 'Phonely.ai',              sector: 'AI / Communications',          invested: 109993, unrealised: 400000,  distributions: 0, moic: 2.30, irr: 133.2, status: 'Active' },
  { id: 'c6',  name: 'Zime.Ai',                 sector: 'AI / Analytics',               invested: 200000, unrealised: 512500,  distributions: 0, moic: 2.56, irr: 76.9,  status: 'Active' },
  { id: 'c7',  name: 'Vyapar',                  sector: 'B2B SaaS / SME',               invested: 150000, unrealised: 300000,  distributions: 0, moic: 2.00, irr: 65.0,  status: 'Active' },
  { id: 'c8',  name: 'MultiSet.ai',             sector: 'AI / Productivity',            invested: 200000, unrealised: 300000,  distributions: 0, moic: 1.50, irr: 97.1,  status: 'Active' },
  { id: 'c9',  name: 'Blink AI Payments',       sector: 'Fintech',                      invested: 100000, unrealised: 166667,  distributions: 0, moic: 1.67, irr: 160.0, status: 'Active' },
  { id: 'c10', name: 'Wink',                    sector: 'Consumer Tech',                invested: 250000, unrealised: 338676,  distributions: 0, moic: 1.35, irr: 22.8,  status: 'Active' },
  { id: 'c11', name: 'Sarvam AI',               sector: 'AI / Language',                invested: 150000, unrealised: 200000,  distributions: 0, moic: 1.33, irr: 28.0,  status: 'Active' },
  { id: 'c12', name: 'Unbox Robotics',          sector: 'Robotics',                     invested: 100000, unrealised: 130000,  distributions: 0, moic: 1.30, irr: 24.0,  status: 'Active' },
  { id: 'c13', name: 'Bayesline',               sector: 'Data Science',                 invested: 25000,  unrealised: 32000,   distributions: 0, moic: 1.28, irr: 15.5,  status: 'Active' },
  { id: 'c14', name: 'Enedym',                  sector: 'CleanTech',                    invested: 300000, unrealised: 300000,  distributions: 0, moic: 1.25, irr: 11.4,  status: 'Active' },
  { id: 'c15', name: 'Z21 Ventures HEN Nozzles',sector: 'Hardware / MFG',               invested: 200000, unrealised: 249000,  distributions: 0, moic: 1.25, irr: 15.0,  status: 'Active' },
  { id: 'c16', name: 'Firstshift Inc',          sector: 'Supply Chain Software',        invested: 150000, unrealised: 173438,  distributions: 0, moic: 1.16, irr: 7.6,   status: 'Active' },
  { id: 'c17', name: 'Bimaplan',                sector: 'InsurTech',                    invested: 50000,  unrealised: 55000,   distributions: 0, moic: 1.10, irr: 8.0,   status: 'Active' },
  { id: 'c18', name: 'Wellth',                  sector: 'Healthcare Tech',              invested: 75000,  unrealised: 80000,   distributions: 0, moic: 1.07, irr: 5.0,   status: 'Active' },
  { id: 'c19', name: 'Distacart',               sector: 'eCommerce',                    invested: 300000, unrealised: 300000,  distributions: 0, moic: 1.04, irr: 3.8,   status: 'Active' },
  { id: 'c20', name: 'PitchPerfect AI',         sector: 'AI / Sales',                   invested: 100000, unrealised: 120000,  distributions: 0, moic: 1.20, irr: 18.0,  status: 'Active' },
  { id: 'c21', name: 'Tapchief',                sector: 'Future of Work',               invested: 50000,  unrealised: 60000,   distributions: 0, moic: 1.20, irr: 14.0,  status: 'Active' },
  { id: 'c22', name: 'Tazapay',                 sector: 'Fintech / Payments',           invested: 200000, unrealised: 240000,  distributions: 0, moic: 1.20, irr: 19.5,  status: 'Active' },
  { id: 'c23', name: 'Aeron Systems',           sector: 'Aerospace',                    invested: 100000, unrealised: 120000,  distributions: 0, moic: 1.20, irr: 16.0,  status: 'Active' },
  { id: 'c24', name: 'AECinspire',              sector: 'PropTech',                     invested: 100000, unrealised: 100000,  distributions: 0, moic: 1.00, irr: 0.0,   status: 'Active' },
  { id: 'c25', name: 'Arka - Bruviti',          sector: 'Industrial AI',                invested: 150000, unrealised: 150000,  distributions: 0, moic: 1.00, irr: 0.0,   status: 'Active' },
  { id: 'c26', name: 'Arka - Catalyx',          sector: 'Industrial AI',                invested: 100000, unrealised: 100000,  distributions: 0, moic: 1.00, irr: 0.0,   status: 'Active' },
  { id: 'c27', name: 'Cactus',                  sector: 'AgTech',                       invested: 50000,  unrealised: 50000,   distributions: 0, moic: 1.00, irr: 0.0,   status: 'Active' },
  { id: 'c28', name: 'Constellation Space',     sector: 'SpaceTech',                    invested: 100000, unrealised: 100000,  distributions: 0, moic: 1.00, irr: 0.0,   status: 'Active' },
  { id: 'c29', name: 'Felefax.Ai',              sector: 'AI / Legal',                   invested: 25000,  unrealised: 25000,   distributions: 0, moic: 1.00, irr: 0.0,   status: 'Active' },
  { id: 'c30', name: 'GetASAP',                 sector: 'Last-mile Delivery',           invested: 200000, unrealised: 200000,  distributions: 0, moic: 1.00, irr: 0.0,   status: 'Active' },
  { id: 'c31', name: 'Istakapaza',              sector: 'eCommerce',                    invested: 250000, unrealised: 250000,  distributions: 0, moic: 1.00, irr: 0.0,   status: 'Active' },
  { id: 'c32', name: 'Lightberry',              sector: 'Consumer Tech',                invested: 100000, unrealised: 100000,  distributions: 0, moic: 1.00, irr: 0.0,   status: 'Active' },
  { id: 'c33', name: 'Mobileforce',             sector: 'B2B SaaS',                     invested: 100000, unrealised: 100000,  distributions: 0, moic: 1.00, irr: 0.0,   status: 'Active' },
  { id: 'c34', name: 'XCaliber-Nivesha',        sector: 'Healthcare Tech',              invested: 251000, unrealised: 251000,  distributions: 0, moic: 1.00, irr: 0.0,   status: 'Active' },
  { id: 'c35', name: 'Syntra',                  sector: 'B2B SaaS',                     invested: 50000,  unrealised: 50000,   distributions: 0, moic: 1.00, irr: 0.0,   status: 'Active' },
  { id: 'c36', name: 'Travel Partner',          sector: 'Travel Tech',                  invested: 200000, unrealised: 0,        distributions: 0, moic: 0.00, irr: 0.0,   status: 'Active' },
  { id: 'c37', name: 'Voicebox',                sector: 'AI / Voice',                   invested: 200000, unrealised: 200000,  distributions: 0, moic: 1.00, irr: 0.0,   status: 'Active' },
  { id: 'c38', name: 'Peel Insights',           sector: 'eCommerce Analytics',          invested: 50000,  unrealised: 50000,   distributions: 0, moic: 1.00, irr: 0.0,   status: 'Active' },
  { id: 'c39', name: 'Spotmentor',              sector: 'HRTech',                       invested: 75000,  unrealised: 75000,   distributions: 0, moic: 1.00, irr: 0.0,   status: 'Active' },
  { id: 'c40', name: 'Yeshe',                   sector: 'EdTech',                       invested: 50000,  unrealised: 50000,   distributions: 0, moic: 1.00, irr: 0.0,   status: 'Active' },
  { id: 'c41', name: 'ZestMoney',               sector: 'Fintech / BNPL',               invested: 100000, unrealised: 85000,   distributions: 0, moic: 0.85, irr: -12.0, status: 'Active' },
  { id: 'c42', name: 'Inspirit',                sector: 'EdTech',                       invested: 50000,  unrealised: 0,        distributions: 0, moic: 0.00, irr: -100.0,status: 'Exited' },
];

export const TRANSACTIONS: Transaction[] = [
  { id: 't1',  date: '7 Apr 2026',  type: 'Investment', amount: 100000, company: 'VotersAI',           fund: 'Nivesha Ventures Fund', instrument: 'Convertible Note', description: 'Safe - Series preseed - With Valuation cap no discount' },
  { id: 't2',  date: '31 Mar 2026', type: 'Investment', amount: 100000, company: 'Constellation Space', fund: 'Nivesha Ventures Fund', instrument: 'Convertible Note', description: 'Post money at valuation cap' },
  { id: 't3',  date: '26 Jan 2026', type: 'Investment', amount: 109993, company: 'Phonely.ai',          fund: 'Nivesha Ventures Fund', instrument: 'Equity',           description: 'Shares @ 11.1975' },
  { id: 't4',  date: '3 Jan 2026',  type: 'Investment', amount: 100000, company: 'Lightberry',          fund: 'Nivesha Ventures Fund', instrument: 'Other',            description: 'Safe - With Valuation cap - No Discount, Series Seed' },
  { id: 't5',  date: '10 Dec 2025', type: 'Investment', amount: 100000, company: 'Swirepay Inc.',       fund: 'Nivesha Ventures Fund', instrument: 'Other',            description: 'Series Seed' },
  { id: 't6',  date: '18 Jun 2025', type: 'Investment', amount: 50000,  company: 'Cactus',              fund: 'Nivesha Ventures Fund', instrument: 'Other',            description: 'Safe - With valuation cap no Discount - Series Seed' },
  { id: 't7',  date: '15 Jun 2025', type: 'Investment', amount: 150000, company: 'Arka - Bruviti',      fund: 'Nivesha Ventures Fund', instrument: 'Other',            description: 'Preferred Stock - Series A' },
  { id: 't8',  date: '4 Jun 2025',  type: 'Investment', amount: 251000, company: 'XCaliber-Nivesha',    fund: 'Nivesha Ventures Fund', instrument: 'Other',            description: 'Safe - With valuation cap 20% Discount - Series Seed' },
  { id: 't9',  date: '19 Mar 2025', type: 'Investment', amount: 100000, company: 'Zime.Ai',             fund: 'Nivesha Ventures Fund', instrument: 'Other',            description: 'Safe - With Valuation cap - No Discount, Series Pre Seed' },
  { id: 't10', date: '18 Feb 2025', type: 'Investment', amount: 100000, company: 'Wink',                fund: 'Nivesha Ventures Fund', instrument: 'Other',            description: 'Convertible notes - With valuation cap 20% Discount - Series Seed' },
  { id: 't11', date: '10 Feb 2025', type: 'Investment', amount: 200000, company: 'Hosted.AI',           fund: 'Nivesha Ventures Fund', instrument: 'Other',            description: 'Safe - With Valuation cap - No Discount, Series Pre Seed' },
  { id: 't12', date: '10 Dec 2024', type: 'Investment', amount: 150000, company: 'Wink',                fund: 'Nivesha Ventures Fund', instrument: 'Other',            description: 'Preferred Stocks - Series Seeds' },
  { id: 't13', date: '5 Nov 2024',  type: 'Investment', amount: 200000, company: 'MultiSet.ai',         fund: 'Nivesha Ventures Fund', instrument: 'Other',            description: 'Safe - Series Seed' },
  { id: 't14', date: '14 Oct 2024', type: 'Investment', amount: 300000, company: 'Distacart',           fund: 'Nivesha Ventures Fund', instrument: 'Equity',           description: 'Series Seed equity round' },
  { id: 't15', date: '2 Sep 2024',  type: 'Investment', amount: 100000, company: 'AECinspire',          fund: 'Nivesha Ventures Fund', instrument: 'Other',            description: 'Series Seed SAFE' },
  { id: 't16', date: '20 Aug 2024', type: 'Investment', amount: 100000, company: 'Arka - Catalyx',      fund: 'Nivesha Ventures Fund', instrument: 'Other',            description: 'Series Seed SAFE' },
  { id: 't17', date: '12 Jul 2024', type: 'Investment', amount: 300000, company: 'Enedym',              fund: 'Nivesha Ventures Fund', instrument: 'Equity',           description: 'Equity - Series A participation' },
  { id: 't18', date: '15 Jun 2024', type: 'Investment', amount: 200000, company: 'GetASAP',             fund: 'Nivesha Ventures Fund', instrument: 'Other',            description: 'Convertible Note - Series Pre Seed' },
  { id: 't19', date: '1 May 2024',  type: 'Investment', amount: 25000,  company: 'Bayesline',           fund: 'Nivesha Ventures Fund', instrument: 'Other',            description: 'SAFE - No Discount, valuation cap $1M' },
  { id: 't20', date: '10 Apr 2024', type: 'Investment', amount: 100000, company: 'Blink AI Payments',   fund: 'Nivesha Ventures Fund', instrument: 'Convertible Note', description: 'Post-money SAFE with 20% discount' },
  { id: 't21', date: '1 Mar 2024',  type: 'Investment', amount: 300000, company: 'Swirepay Inc.',       fund: 'Nivesha Ventures Fund', instrument: 'Equity',           description: 'Series Seed equity - 3.2M post-money' },
  { id: 't22', date: '15 Jan 2024', type: 'Investment', amount: 250000, company: 'Istakapaza',          fund: 'Nivesha Ventures Fund', instrument: 'Other',            description: 'Series A follow-on - preferred stock' },
  { id: 't23', date: '5 Jan 2024',  type: 'Investment', amount: 25000,  company: 'Felefax.Ai',          fund: 'Nivesha Ventures Fund', instrument: 'Other',            description: 'Pre-seed SAFE' },
];

export const LPS: LP[] = [
  { id: 'lp1', name: 'Sunil Potti',  email: 'sunil@niveshaventures.com',  commitment: 100000,  called: 100000,  ownership: 1.56, status: 'Active' },
  { id: 'lp2', name: 'Rakesh',       email: 'rakesh@niveshaventures.com', commitment: 250000,  called: 220000,  ownership: 3.89, status: 'Active' },
];

// Helper functions
export const fmtCurrency = (n: number): string => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
};

export const fmtCurrencyFull = (n: number): string =>
  `$${n.toLocaleString()}`;

export const moicColor = (m: number): string => {
  if (m >= 3)         return 'text-green-600 font-semibold';
  if (m >= 1.2)       return 'text-amber-600 font-semibold';
  if (m > 0 && m < 1) return 'text-red-600 font-semibold';
  return 'text-gray-400';
};

export const irrColor = (i: number): string =>
  i > 0 ? 'text-green-600' : i < 0 ? 'text-red-600' : 'text-gray-400';

export const coInitials = (name: string): string =>
  name.slice(0, 2).toUpperCase();

const colorPalette = [
  '#2d5be3','#16a34a','#d97706','#7c3aed',
  '#dc2626','#0891b2','#be185d','#059669',
  '#b45309','#1d4ed8','#6d28d9','#0f766e',
];

export const coColor = (name: string): string => {
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return colorPalette[Math.abs(hash) % colorPalette.length];
};
