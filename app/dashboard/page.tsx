import { FUND, COMPANIES, fmt, fmtFull, moicColor, irrColor, coColor, coInitials } from '@/lib/data';

export default function DashboardPage() {
  const topCompanies = [...COMPANIES]
    .sort((a, b) => b.moic - a.moic)
    .slice(0, 8);

  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">
            Dashboard{' '}
            <span className="text-[#2d5be3] font-normal text-base">— Hi Kishore!</span>
          </h1>
          <p className="text-[12.5px] text-[#6b6860] mt-0.5">
            Overview of your fund performance and portfolio companies
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Invested Capital',  value: fmt(FUND.invested),      change: '↑ 5.4%',  up: true },
          { label: 'Total Fund Value',  value: fmt(FUND.nav),           change: '↑ 8.2%',  up: true },
          { label: 'IRR',               value: `${FUND.irr}%`,                   change: '↑ 3.1%',  up: true },
          { label: 'MOIC',              value: `${FUND.moic}x`,                  change: '↑ 0.3x',  up: true },
          { label: 'DPI',               value: `${FUND.dpi.toFixed(2)}x`,        change: 'No distributions', up: false },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-[#e8e6df] rounded-xl p-4">
            <label className="text-[11.5px] text-[#6b6860] block mb-1.5">{kpi.label}</label>
            <div className="text-[20px] font-semibold tracking-tight font-mono mb-1.5">{kpi.value}</div>
            <div className={`text-[11.5px] font-medium ${kpi.up ? 'text-[#16a34a]' : 'text-[#9b9890]'}`}>
              {kpi.change}
            </div>
          </div>
        ))}
      </div>

      {/* Fund Summary + Chart row */}
      <div className="grid grid-cols-[1fr_280px] gap-3.5 mb-5">
        {/* Chart placeholder */}
        <div className="bg-white border border-[#e8e6df] rounded-xl p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="text-[13.5px] font-semibold">Fund Performance Over Time</div>
            <div className="flex gap-0.5">
              {['1Y', '3Y', '5Y', 'All'].map((tf) => (
                <button
                  key={tf}
                  className={`px-2 py-0.5 rounded-[5px] text-[11.5px] font-medium border transition-colors ${
                    tf === '3Y'
                      ? 'bg-[#2d5be3] text-white border-[#2d5be3]'
                      : 'border-[#e8e6df] text-[#6b6860] hover:bg-[#f9f8f5]'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
          {/* Simple visual chart using CSS */}
          <div className="h-[180px] flex items-end gap-1 px-2">
            {[0, 0, 0.5, 1.5, 2.5, 3.5, 4.5, 5.2, 5.8, 6.2, 6.8, 9.0].map((v, i) => (
              <div key={i} className="flex-1 flex flex-col justify-end gap-0.5">
                <div
                  className="rounded-sm bg-[#2d5be3] opacity-80 transition-all"
                  style={{ height: `${(v / 9.0) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-[#9b9890] mt-1.5 px-2">
            <span>Jun 23</span><span>Dec 23</span><span>Jun 24</span><span>Dec 24</span><span>Jun 25</span><span>Dec 25</span><span>Jun 26</span>
          </div>
          <div className="flex gap-3.5 mt-2">
            <span className="flex items-center gap-1 text-[11px] text-[#6b6860]">
              <span className="inline-block w-4 h-0.5 bg-[#2d5be3] rounded" />Fund Value ($M)
            </span>
            <span className="flex items-center gap-1 text-[11px] text-[#6b6860]">
              <span className="inline-block w-4 border-t-2 border-dashed border-[#16a34a]" />Invested ($M)
            </span>
          </div>
        </div>

        {/* Fund Summary */}
        <div className="bg-white border border-[#e8e6df] rounded-xl p-5">
          <div className="text-[13.5px] font-semibold mb-3">Fund Summary</div>
          {[
            { label: 'Committed Capital', value: fmtFull(FUND.committed) },
            { label: 'Invested Capital',  value: fmtFull(FUND.invested) },
            { label: 'Uncalled Capital',  value: fmtFull(FUND.committed - FUND.called) },
            { label: 'Distributions',     value: '$0' },
            { label: 'Portfolio Value (NAV)', value: fmtFull(FUND.nav) },
          ].map((row) => (
            <div key={row.label} className="flex justify-between items-center py-2 border-b border-[#e8e6df] text-[12.5px]">
              <span>{row.label}</span>
              <span className="font-mono text-[12px]">{row.value}</span>
            </div>
          ))}
          <div className="flex justify-between items-center py-2 text-[12.5px] font-semibold">
            <span>Total Value</span>
            <span className="font-mono text-[12px]">{fmtFull(FUND.nav)}</span>
          </div>
          <div className="text-[10px] text-[#9b9890] text-right mb-2.5">NAV + Distributions</div>
          <div className="flex gap-3 pt-2.5 border-t border-[#e8e6df]">
            <span className="text-[11.5px] text-[#6b6860]">IRR <strong className="text-[#16a34a]">{FUND.irr}%</strong></span>
            <span className="text-[11.5px] text-[#6b6860]">MOIC <strong>{FUND.moic}x</strong></span>
            <span className="text-[11.5px] text-[#6b6860]">DPI <strong className="text-[#9b9890]">0.00x</strong></span>
          </div>
        </div>
      </div>

      {/* NAV Bridge */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-5 mb-5">
        <div className="text-[13.5px] font-semibold mb-1">
          NAV Bridge Analysis{' '}
          <span className="font-normal text-[#6b6860] text-xs">Quarter-over-Quarter</span>
        </div>
        <div className="text-[11.5px] text-[#6b6860] mb-4">Q1 2026: $6M → Q2 2026: $9M</div>
        <div className="flex items-end gap-4 h-[100px]">
          {[
            { label: 'Beginning NAV\n(Q1 2026)', value: 6000000, color: '#6366f1' },
            { label: 'New\nInvestments',          value: 50000,   color: '#d1d5db' },
            { label: 'Valuation\nUplifts',        value: 3417269, color: '#22c55e' },
            { label: 'Ending NAV\n(Q2 2026)',     value: 9467269, color: '#6366f1' },
          ].map((bar) => (
            <div key={bar.label} className="flex flex-col items-center flex-1 gap-1">
              <div className="text-[11px] font-mono font-medium">${(bar.value / 1e6).toFixed(1)}M</div>
              <div
                className="w-full rounded-md"
                style={{ height: `${(bar.value / 9467269) * 80}px`, background: bar.color }}
              />
              <div className="text-[10px] text-[#9b9890] text-center whitespace-pre-line leading-tight">{bar.label}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-7 mt-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#9b9890]">Period Change</div>
            <div className="text-base font-semibold font-mono text-[#16a34a]">+$3,467,269</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#9b9890]">% Change</div>
            <div className="text-base font-semibold font-mono text-[#16a34a]">+62.9%</div>
          </div>
        </div>
      </div>

      {/* Portfolio Quick View */}
      <div className="bg-white border border-[#e8e6df] rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13.5px] font-semibold">Portfolio — Quick View</div>
          <a
            href="/portfolio"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors"
          >
            View All
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Company', 'Invested', 'Unrealised', 'Total Value', 'MOIC', 'IRR', 'Status'].map((h) => (
                  <th key={h} className="text-[11px] font-medium text-[#6b6860] text-left px-3 py-2.5 border-b-2 border-[#e8e6df] bg-[#f9f8f5] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topCompanies.map((co) => (
                <tr key={co.id} className="hover:bg-[#f9f8f5] transition-colors">
                  <td className="px-3 py-2.5 border-b border-[#e8e6df]">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-[7px] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                        style={{ background: coColor(co.name) }}
                      >
                        {coInitials(co.name)}
                      </div>
                      <div>
                        <div className="font-medium text-[12.5px]">{co.name}</div>
                        <div className="text-[10px] text-[#9b9890]">{co.sector}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">{fmt(co.invested)}</td>
                  <td className="px-3 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">{fmt(co.unrealised)}</td>
                  <td className="px-3 py-2.5 border-b border-[#e8e6df] font-mono text-[12px]">{fmt(co.unrealised)}</td>
                  <td className={`px-3 py-2.5 border-b border-[#e8e6df] text-[12.5px] ${moicColor(co.moic)}`}>
                    {co.moic > 0 ? `${co.moic.toFixed(2)}x` : '—'}
                  </td>
                  <td className={`px-3 py-2.5 border-b border-[#e8e6df] text-[12.5px] ${irrColor(co.irr)}`}>
                    {co.irr > 0 ? '+' : ''}{co.irr.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2.5 border-b border-[#e8e6df]">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                      co.status === 'Active'
                        ? 'bg-[#f0fdf4] text-[#16a34a]'
                        : 'bg-[#fef2f2] text-[#dc2626]'
                    }`}>
                      {co.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
