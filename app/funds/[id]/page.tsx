import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  FUNDS, getCompaniesByFund, getLPsByFund, getTransactionsByFund,
  fmt, fmtFull, fmtPct, moicColor, irrColor, statusBadge, coColor, coInitials,
} from '@/lib/data';

export default function FundDetailPage({ params }: { params: { id: string } }) {
  const fund = FUNDS.find(f => f.id === params.id);
  if (!fund) notFound();

  const companies = getCompaniesByFund(fund.id);
  const lps       = getLPsByFund(fund.id);
  const txns      = getTransactionsByFund(fund.id).slice(0, 5);

  const uncalled  = fund.committed - fund.called;
  const callPct   = fund.committed > 0 ? (fund.called / fund.committed) * 100 : 0;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12.5px] text-[#6b6860] mb-4">
        <Link href="/funds" className="hover:text-[#2d5be3] transition-colors">Funds</Link>
        <span>/</span>
        <span className="text-[#1a1917] font-medium">{fund.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-[20px] font-semibold tracking-tight">{fund.name}</h1>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusBadge(fund.status)}`}>
              {fund.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[12.5px] text-[#6b6860]">
            <span>Vintage {fund.vintage}</span>
            <span>·</span>
            <span>Since {fund.startDate}</span>
            <span>·</span>
            <span>{fund.managementFee}% mgmt fee · {fund.carriedInterest}% carry</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {fund.focus.map(s => (
              <span key={s} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#eef2fd] text-[#2d5be3]">
                {s}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
            ✏️ Edit Fund
          </button>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">
            + Add Company
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Committed Capital', value: fmt(fund.committed),     sub: fmtFull(fund.committed) },
          { label: 'Called Capital',    value: fmt(fund.called),        sub: `${callPct.toFixed(0)}% drawn` },
          { label: 'Uncalled Capital',  value: fmt(uncalled),           sub: 'Available to deploy' },
          { label: 'Portfolio NAV',     value: fmt(fund.nav),           sub: fmtFull(fund.nav) },
          { label: 'Distributions',     value: fmt(fund.distributions), sub: fund.distributions === 0 ? 'DPI 0.00x' : '' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-[#e8e6df] rounded-xl p-4">
            <label className="text-[11.5px] text-[#6b6860] block mb-1.5">{k.label}</label>
            <div className="text-[18px] font-semibold tracking-tight font-mono mb-1">{k.value}</div>
            <div className="text-[11px] text-[#9b9890]">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Performance row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'MOIC',     value: fund.moic > 0 ? `${fund.moic.toFixed(2)}x` : '—', cls: moicColor(fund.moic) },
          { label: 'IRR',      value: fund.irr !== 0 ? `${fund.irr.toFixed(1)}%` : '—',  cls: irrColor(fund.irr) },
          { label: 'DPI',      value: `${fund.dpi.toFixed(2)}x`,                          cls: 'text-[#9b9890]' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-[#e8e6df] rounded-xl p-4 flex items-center gap-4">
            <div>
              <label className="text-[11.5px] text-[#6b6860] block mb-1">{k.label}</label>
              <div className={`text-[24px] font-semibold font-mono ${k.cls}`}>{k.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Capital call progress */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13.5px] font-semibold">Capital Deployment</div>
          <span className="text-[12px] text-[#6b6860]">{callPct.toFixed(0)}% called</span>
        </div>
        <div className="h-2 bg-[#f0f0ed] rounded-full mb-3">
          <div
            className="h-2 bg-[#2d5be3] rounded-full transition-all"
            style={{ width: `${Math.min(100, callPct)}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-4 text-[12px]">
          <div><span className="text-[#6b6860]">Called: </span><span className="font-mono font-medium">{fmtFull(fund.called)}</span></div>
          <div><span className="text-[#6b6860]">Uncalled: </span><span className="font-mono font-medium">{fmtFull(uncalled)}</span></div>
          <div><span className="text-[#6b6860]">Total Committed: </span><span className="font-mono font-medium">{fmtFull(fund.committed)}</span></div>
        </div>
      </div>

      {/* Portfolio Companies */}
      <div className="bg-white border border-[#e8e6df] rounded-xl mb-5">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6df]">
          <div>
            <div className="text-[13.5px] font-semibold">Portfolio Companies</div>
            <div className="text-[11.5px] text-[#6b6860] mt-0.5">{companies.length} companies</div>
          </div>
          <Link
            href="/portfolio"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors"
          >
            View All →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Company', 'Sector', 'Stage', 'Invested', 'Current Value', 'MOIC', 'IRR', 'Status'].map(h => (
                  <th key={h} className="text-[11px] font-medium text-[#6b6860] text-left px-4 py-2.5 border-b border-[#e8e6df] bg-[#f9f8f5] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.slice(0, 10).map(co => (
                <tr key={co.id} className="hover:bg-[#f9f8f5] transition-colors">
                  <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-[5px] flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                        style={{ background: coColor(co.name) }}
                      >
                        {coInitials(co.name)}
                      </div>
                      <span className="font-medium text-[12.5px]">{co.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px] text-[#6b6860]">{co.sector}</td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px]">
                    {co.stage && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#f9f8f5] text-[#6b6860] border border-[#e8e6df]">
                        {co.stage}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">{fmtFull(co.invested)}</td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">{co.unrealised > 0 ? fmtFull(co.unrealised) : '—'}</td>
                  <td className={`px-4 py-2.5 border-b border-[#e8e6df] text-[12.5px] ${moicColor(co.moic)}`}>
                    {co.moic > 0 ? `${co.moic.toFixed(2)}x` : '—'}
                  </td>
                  <td className={`px-4 py-2.5 border-b border-[#e8e6df] text-[12.5px] ${irrColor(co.irr)}`}>
                    {co.irr !== 0 ? `${co.irr > 0 ? '+' : ''}${co.irr.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      co.status === 'Active'      ? 'bg-green-50 text-green-700' :
                      co.status === 'Exited'      ? 'bg-blue-50 text-blue-700' :
                                                    'bg-red-50 text-red-700'
                    }`}>
                      {co.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {companies.length > 10 && (
          <div className="px-5 py-3 border-t border-[#e8e6df] text-center">
            <Link href="/portfolio" className="text-[12px] text-[#2d5be3] hover:underline">
              View all {companies.length} companies →
            </Link>
          </div>
        )}
      </div>

      {/* LPs */}
      <div className="bg-white border border-[#e8e6df] rounded-xl mb-5">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6df]">
          <div>
            <div className="text-[13.5px] font-semibold">Limited Partners</div>
            <div className="text-[11.5px] text-[#6b6860] mt-0.5">{fund.lpCount} LPs · {fmtFull(fund.committed)} committed</div>
          </div>
          <div className="flex gap-2">
            <Link
              href="/contacts"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors"
            >
              View All →
            </Link>
            <button className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">
              + Add LP
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['LP Name', 'Type', 'Commitment', 'Called', 'Distributions', 'Ownership %', 'Status'].map(h => (
                  <th key={h} className="text-[11px] font-medium text-[#6b6860] text-left px-4 py-2.5 border-b border-[#e8e6df] bg-[#f9f8f5] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lps.length > 0 ? lps.map(lp => (
                <tr key={lp.id} className="hover:bg-[#f9f8f5] transition-colors">
                  <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                    <div className="font-medium text-[12.5px]">{lp.name}</div>
                    <div className="text-[11px] text-[#9b9890]">{lp.email}</div>
                  </td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#eef2fd] text-[#2d5be3] font-medium">
                      {lp.type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">{fmtFull(lp.commitment)}</td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">{fmtFull(lp.called)}</td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">{lp.distributions > 0 ? fmtFull(lp.distributions) : '—'}</td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df] text-[12px]">{fmtPct(lp.ownership)}</td>
                  <td className="px-4 py-2.5 border-b border-[#e8e6df]">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      lp.status === 'Active'  ? 'bg-green-50 text-green-700' :
                      lp.status === 'Pending' ? 'bg-amber-50 text-amber-700' :
                                                'bg-gray-100 text-gray-500'
                    }`}>
                      {lp.status}
                    </span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[12.5px] text-[#9b9890]">
                    No LPs added yet. Upload your LP Excel file or add them manually.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {fund.lpCount > lps.length && (
          <div className="px-5 py-3 border-t border-[#e8e6df] text-center">
            <p className="text-[12px] text-[#9b9890]">
              {fund.lpCount - lps.length} more LPs not yet imported.{' '}
              <button className="text-[#2d5be3] hover:underline">Upload LP Excel →</button>
            </p>
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div className="bg-white border border-[#e8e6df] rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6df]">
          <div className="text-[13.5px] font-semibold">Recent Transactions</div>
          <Link href="/transactions" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-[11.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
            View All →
          </Link>
        </div>
        <div className="divide-y divide-[#e8e6df]">
          {txns.map(t => (
            <div key={t.id} className="px-5 py-3 flex items-center gap-4 hover:bg-[#f9f8f5] transition-colors">
              <div className="text-[11.5px] text-[#9b9890] whitespace-nowrap w-24">{t.date}</div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#eef2fd] text-[#2d5be3] whitespace-nowrap">
                {t.type}
              </span>
              <div className="font-medium text-[12.5px] flex-1">{t.company}</div>
              <div className="font-mono text-[12px] font-semibold">{fmtFull(t.amount)}</div>
              <div className="text-[11.5px] text-[#9b9890] max-w-[200px] truncate">{t.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
