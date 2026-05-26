'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';

// ─── TYPES ───────────────────────────────────────────────────

export type ImportType = 'lps' | 'companies' | 'investments';

type ParsedRow = Record<string, any>;

type ImportResult = {
  total:    number;
  success:  number;
  failed:   number;
  errors:   { row: number; message: string }[];
};

type Props = {
  type:    ImportType;
  fundId:  string;
  onClose: () => void;
  onDone:  () => void;
};

// ─── COLUMN MAPS ─────────────────────────────────────────────

const LP_COLS = [
  'Investor Name*', 'Investing As', 'Commitment Amount*', 'Currency*',
  'Called Capital', 'Distributions',
  'Commitment Date', 'Email', 'Phone',
  'Address Line 1', 'Address Line 2', 'City', 'State', 'ZIP Code', 'Country',
  'Contact Name', 'Notes',
];

const COMPANY_COLS = [
  'Entity Name*', 'Fund Name*', 'Status*', 'Sector', 'Stage',
  'Website', 'Headquarters Location', 'Founded Year', 'Investment Thesis',
];

const INVESTMENT_COLS = [
  'Fund Name*', 'Company Name*', 'Transaction Type*',
  'Instrument*', 'Amount*', 'Date* (dd/mm/yyyy)',
  'Currency*', 'Post-Money Valuation', 'Pre-Money Valuation',
  'SAFE Structure', 'Discount %',
  'CEO Full Name', 'CEO Email', 'CEO Phone',
];

const TEMPLATE_NAMES: Record<ImportType, string> = {
  lps:         'lp_import_template.xlsx',
  companies:   'companies_import_template.xlsx',
  investments: 'investment_import_template.xlsx',
};

const TYPE_LABELS: Record<ImportType, string> = {
  lps:         'Limited Partners',
  companies:   'Portfolio Companies',
  investments: 'Investments',
};

// ─── PARSERS ─────────────────────────────────────────────────

function parseDate(val: any): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'number') {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(val);
    return `${date.y}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
  }
  const str = String(val).trim();
  // dd/mm/yyyy
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  // yyyy-mm-dd already
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  return undefined;
}

function normalizeStatus(val: string): 'Active' | 'Exited' | 'Written Off' {
  const s = String(val || '').toLowerCase().replace(/_/g, ' ');
  if (s === 'exited' || s === 'exit') return 'Exited';
  if (s.includes('written') || s === 'inactive') return 'Written Off';
  return 'Active';
}

function normalizeStage(val: string): string {
  const map: Record<string, string> = {
    'pre_seed': 'Series Pre-seed', 'pre-seed': 'Series Pre-seed', 'preseed': 'Series Pre-seed',
    'seed': 'Series Seed',
    'series_a': 'Series A', 'series a': 'Series A',
    'series_b': 'Series B', 'series b': 'Series B',
    'series_c': 'Series C', 'series c': 'Series C',
    'series_d': 'Series D', 'series d': 'Series D',
    'series_e': 'Series E', 'series e': 'Series E',
    'growth': 'Growth Stage', 'growth_stage': 'Growth Stage',
  };
  return map[String(val || '').toLowerCase().trim()] || String(val || '');
}

function normalizeInstrument(val: string): string {
  const map: Record<string, string> = {
    'equity': 'Equity', 'common stock': 'Equity',
    'convertible_note': 'Convertible Note', 'convertible note': 'Convertible Note',
    'safe': 'SAFE',
    'preference_share': 'Preferred Stock', 'preferred stock': 'Preferred Stock', 'preferred_stock': 'Preferred Stock',
  };
  return map[String(val || '').toLowerCase().trim()] || 'Other';
}

// ─── COMPONENT ───────────────────────────────────────────────

export default function ImportModal({ type, fundId, onClose, onDone }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const expectedCols = type === 'lps' ? LP_COLS : type === 'companies' ? COMPANY_COLS : INVESTMENT_COLS;

  // ── Parse Excel file ──────────────────────────────────────
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'binary', cellDates: false });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][];

        if (raw.length < 2) {
          setParseError('File appears to be empty. Please use the provided template.');
          return;
        }

        // Find header row — skip instruction rows, find row with expected columns
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(5, raw.length); i++) {
          const rowStr = raw[i].map(v => String(v ?? '').trim());
          const firstCol = expectedCols[0].replace('*', '').trim();
          if (rowStr.some(v => v.includes(firstCol))) {
            headerRowIdx = i;
            break;
          }
        }

        if (headerRowIdx === -1) {
          setParseError('Could not find header row. Make sure you are using the correct template.');
          return;
        }

        const headers = raw[headerRowIdx].map(v => String(v ?? '').trim());
        const dataRows = raw.slice(headerRowIdx + 1).filter(row => row.some(v => v !== null && v !== ''));

        if (dataRows.length === 0) {
          setParseError('No data rows found. Please add data to the template and try again.');
          return;
        }

        const parsed = dataRows.map(row => {
          const obj: ParsedRow = {};
          headers.forEach((h, i) => { obj[h] = row[i] ?? null; });
          return obj;
        });

        setRows(parsed);
        setStep('preview');
      } catch (err: any) {
        setParseError('Failed to read file: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  // ── Import to Supabase ────────────────────────────────────
  const handleImport = async () => {
    setImporting(true);
    const errors: { row: number; message: string }[] = [];
    let success = 0;

    const { supabase } = await import('@/lib/supabase');

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      try {
        if (type === 'lps') {
          const name       = String(row['Investor Name*'] || row['Investor Name'] || '').trim();
          const commitment = Number(row['Commitment Amount*'] || row['Commitment Amount'] || 0);
          const called     = row['Called Capital']  ? Number(row['Called Capital'])  : 0;
          const distrib    = row['Distributions']   ? Number(row['Distributions'])   : 0;
          if (!name)       throw new Error('Investor Name is required');
          if (!commitment) throw new Error('Commitment Amount is required');

          const notesVal = [
            row['Contact Name'] ? `Contact: ${row['Contact Name']}` : '',
            row['Notes'] || '',
          ].filter(Boolean).join(' | ') || null;

          const { data: newLP, error } = await supabase.from('lps').insert({
            fund_id:       fundId,
            name,
            email:         row['Email'] || null,
            phone:         row['Phone'] || null,
            type:          'Individual',
            commitment,
            called,
            distributions: distrib,
            ownership_pct: 0,
            status:        'Active',
            join_date:     parseDate(row['Commitment Date']) || null,
            address_line1: row['Address Line 1'] || null,
            address_line2: row['Address Line 2'] || null,
            city:          row['City'] || null,
            state:         row['State'] || null,
            zip:           row['ZIP Code'] || null,
            country:       row['Country'] || 'USA',
            notes:         notesVal,
          }).select().single();
          if (error) throw new Error(error.message);

          // If called capital exists, create an opening balance transaction
          if (called > 0 && newLP) {
            await supabase.from('lp_transactions').insert({
              lp_id:   newLP.id,
              fund_id: fundId,
              date:    parseDate(row['Commitment Date']) || new Date().toISOString().split('T')[0],
              amount:  called,
              type:    'Capital Call',
              notes:   'Opening balance — imported from previous system',
            });
          }

        } else if (type === 'companies') {
          const name = String(row['Entity Name*'] || row['Entity Name'] || '').trim();
          if (!name) throw new Error('Entity Name is required');

          const { error } = await supabase.from('companies').insert({
            fund_id:    fundId,
            name,
            sector:     row['Sector'] || null,
            stage:      normalizeStage(row['Stage'] || ''),
            website:    row['Website'] || null,
            status:     normalizeStatus(row['Status*'] || row['Status'] || 'active'),
            country:    row['Headquarters Location'] || null,
            about:      row['Investment Thesis'] || null,
            invested:   0,
            unrealised: 0,
            distributions: 0,
            moic: 0,
            irr:  0,
          });
          if (error) throw new Error(error.message);

        } else if (type === 'investments') {
          const companyName = String(row['Company Name*'] || row['Company Name'] || '').trim();
          const amount      = Number(row['Amount*'] || row['Amount'] || 0);
          const date        = parseDate(row['Date* (dd/mm/yyyy)'] || row['Date'] || '');
          const txnType     = String(row['Transaction Type*'] || row['Transaction Type'] || '').trim();
          if (!companyName) throw new Error('Company Name is required');
          if (!amount)      throw new Error('Amount is required');
          if (!date)        throw new Error('Date is required or invalid format (use dd/mm/yyyy)');

          // Build investment terms description from SAFE/valuation fields
          const buildDesc = () => {
            const parts: string[] = [];
            const instrument = String(row['Instrument*'] || row['Instrument'] || '');
            if (instrument.toUpperCase() === 'SAFE') {
              const safeType = row['SAFE Structure'] || '';
              const discount = row['Discount %'];
              if (safeType) parts.push(`SAFE ${safeType}`);
              if (discount) parts.push(`${discount}% discount`);
            }
            const postMoney = row['Post-Money Valuation'];
            const preMoney  = row['Pre-Money Valuation'];
            if (postMoney) parts.push(`Post-money valuation: $${Number(postMoney).toLocaleString()}`);
            if (preMoney)  parts.push(`Pre-money valuation: $${Number(preMoney).toLocaleString()}`);
            return parts.join(' · ') || null;
          };

          // Upsert company if Investment type
          let companyId: string | null = null;
          if (txnType.toLowerCase() === 'investment') {
            const { data: existing } = await supabase
              .from('companies').select('id').eq('fund_id', fundId).eq('name', companyName).single();

            if (existing) {
              companyId = existing.id;
            } else {
              const postMoney = row['Post-Money Valuation'] ? Number(row['Post-Money Valuation']) : null;
              const { data: newCo, error: coErr } = await supabase.from('companies').insert({
                fund_id:       fundId,
                name:          companyName,
                status:        'Active',
                contact_name:  row['CEO Full Name']  || null,
                contact_email: row['CEO Email']      || null,
                contact_phone: row['CEO Phone']      || null,
                valuation:     postMoney,
                valuation_type: postMoney ? 'Post-money' : (row['Pre-Money Valuation'] ? 'Pre-money' : null),
                security_type: normalizeInstrument(row['Instrument*'] || row['Instrument'] || ''),
                invested:      amount,
                unrealised:    postMoney || amount,
                distributions: 0,
                moic:          postMoney ? postMoney / amount : 1,
                irr:           0,
              }).select().single();
              if (coErr) throw new Error('Company create failed: ' + coErr.message);
              companyId = newCo.id;
            }
          }

          const { error: txErr } = await supabase.from('transactions').insert({
            fund_id:      fundId,
            company_id:   companyId,
            company_name: companyName,
            date,
            type:         txnType.charAt(0).toUpperCase() + txnType.slice(1).toLowerCase(),
            amount,
            instrument:   normalizeInstrument(row['Instrument*'] || row['Instrument'] || ''),
            description:  buildDesc(),
          });
          if (txErr) throw new Error(txErr.message);
        }

        success++;
      } catch (err: any) {
        errors.push({ row: rowNum, message: err.message });
      }
    }

    setResult({ total: rows.length, success, failed: errors.length, errors });
    setStep('result');
    setImporting(false);
    if (success > 0) onDone();
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e6df]">
          <div>
            <h2 className="text-[16px] font-semibold">Import {TYPE_LABELS[type]}</h2>
            <p className="text-[12px] text-[#6b6860] mt-0.5">Bulk import from Excel file</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f9f8f5] text-[#6b6860] transition-colors text-[18px]">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">

          {/* ── STEP 1: Upload ── */}
          {step === 'upload' && (
            <div>
              <div className="mb-6">
                <div className="text-[13.5px] font-semibold mb-1">1. Download Template</div>
                <p className="text-[12px] text-[#6b6860] mb-3">
                  Use our template to ensure correct formatting. Blue columns are required, gray are optional.
                </p>
                <a
                  href={`/templates/${TEMPLATE_NAMES[type]}`}
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-[7px] text-[12.5px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors"
                >
                  <svg className="w-4 h-4 text-[#2d5be3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download {TYPE_LABELS[type]} Template
                </a>
              </div>

              <div className="border-t border-[#e8e6df] pt-6">
                <div className="text-[13.5px] font-semibold mb-1">2. Upload Your File</div>
                <p className="text-[12px] text-[#6b6860] mb-3">
                  Fill in the template and upload it here. Supported format: .xlsx
                </p>
                {parseError && (
                  <div className="bg-red-50 border border-red-200 rounded-[7px] px-4 py-3 text-[12.5px] text-red-700 mb-3">
                    ⚠️ {parseError}
                  </div>
                )}
                <div
                  className="border-2 border-dashed border-[#e8e6df] rounded-xl p-8 text-center cursor-pointer hover:border-[#2d5be3] hover:bg-[#f0f4ff] transition-all"
                  onClick={() => fileRef.current?.click()}
                >
                  <svg className="w-8 h-8 text-[#9b9890] mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <p className="text-[13px] font-medium text-[#6b6860]">Click to select Excel file</p>
                  <p className="text-[11.5px] text-[#9b9890] mt-1">.xlsx files only</p>
                  <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
                </div>
              </div>

              {/* Expected columns */}
              <div className="mt-5 bg-[#f9f8f5] rounded-[7px] p-4">
                <div className="text-[11.5px] font-semibold text-[#6b6860] mb-2">Expected columns:</div>
                <div className="flex flex-wrap gap-1.5">
                  {expectedCols.map(col => (
                    <span key={col} className={`px-2 py-0.5 rounded text-[10.5px] font-medium ${col.includes('*') ? 'bg-[#2d5be3] text-white' : 'bg-white border border-[#e8e6df] text-[#6b6860]'}`}>
                      {col.replace('*', '')}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Preview ── */}
          {step === 'preview' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-[13.5px] font-semibold">Preview — {rows.length} rows found</div>
                  <p className="text-[12px] text-[#6b6860]">Review before importing</p>
                </div>
                <button onClick={() => { setStep('upload'); setRows([]); if (fileRef.current) fileRef.current.value = ''; }}
                  className="text-[12px] text-[#2d5be3] hover:underline">← Choose different file</button>
              </div>

              <div className="overflow-x-auto rounded-[7px] border border-[#e8e6df] mb-4 max-h-64">
                <table className="w-full border-collapse text-[11.5px]">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 bg-[#f9f8f5] text-left font-medium text-[#6b6860] border-b border-[#e8e6df] whitespace-nowrap">#</th>
                      {Object.keys(rows[0] || {}).slice(0, 6).map(h => (
                        <th key={h} className="px-3 py-2 bg-[#f9f8f5] text-left font-medium text-[#6b6860] border-b border-[#e8e6df] whitespace-nowrap">{h.replace('*','')}</th>
                      ))}
                      {Object.keys(rows[0] || {}).length > 6 && (
                        <th className="px-3 py-2 bg-[#f9f8f5] text-[#9b9890] border-b border-[#e8e6df]">+{Object.keys(rows[0]).length - 6} more</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((row, i) => (
                      <tr key={i} className="hover:bg-[#f9f8f5]">
                        <td className="px-3 py-2 border-b border-[#e8e6df] text-[#9b9890]">{i + 1}</td>
                        {Object.values(row).slice(0, 6).map((val, j) => (
                          <td key={j} className="px-3 py-2 border-b border-[#e8e6df] text-[#1a1917] max-w-[120px] truncate">
                            {val == null ? <span className="text-[#9b9890]">—</span> : String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 10 && (
                <p className="text-[11.5px] text-[#9b9890] mb-4 text-center">Showing 10 of {rows.length} rows</p>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-[7px] px-4 py-3 text-[12px] text-amber-700">
                ⚠️ This will create {rows.length} new {TYPE_LABELS[type].toLowerCase()} records in the database.
              </div>
            </div>
          )}

          {/* ── STEP 3: Result ── */}
          {step === 'result' && result && (
            <div>
              <div className={`rounded-xl p-5 mb-4 ${result.failed === 0 ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                <div className="text-[15px] font-semibold mb-3">
                  {result.failed === 0 ? '✅ Import Complete' : '⚠️ Import Completed with Errors'}
                </div>
                <div className="grid grid-cols-3 gap-4 text-[13px]">
                  <div><span className="text-[#6b6860]">Total rows: </span><strong>{result.total}</strong></div>
                  <div><span className="text-green-700">Imported: </span><strong className="text-green-700">{result.success}</strong></div>
                  <div><span className="text-red-600">Failed: </span><strong className="text-red-600">{result.failed}</strong></div>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-[7px] p-4">
                  <div className="text-[12.5px] font-semibold text-red-700 mb-2">Rows with errors:</div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <div key={i} className="text-[12px] text-red-600">
                        Row {e.row}: {e.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#e8e6df] flex items-center justify-end gap-3">
          {step === 'upload' && (
            <button onClick={onClose} className="px-4 py-2 rounded-[7px] text-[13px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
              Cancel
            </button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={onClose} className="px-4 py-2 rounded-[7px] text-[13px] font-medium border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                Cancel
              </button>
              <button onClick={handleImport} disabled={importing}
                className="px-5 py-2 rounded-[7px] text-[13px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors disabled:opacity-60 flex items-center gap-2">
                {importing ? (
                  <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>Importing {rows.length} rows...</>
                ) : `Import ${rows.length} rows`}
              </button>
            </>
          )}
          {step === 'result' && (
            <button onClick={onClose} className="px-5 py-2 rounded-[7px] text-[13px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
