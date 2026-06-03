# Run this from your nivesha-portal root:
# python3 add_lp_documents_tab.py

import re

with open("app/funds/[id]/lps/[lpId]/page.tsx", "r") as f:
    content = f.read()

# 1. Add supabase import
content = content.replace(
    "import { getLPById, updateLP, deleteLP, getLPTransactions, addLPTransaction, deleteLPTransaction, DbLP, DbLPTransaction } from '@/lib/db';",
    "import { getLPById, updateLP, deleteLP, getLPTransactions, addLPTransaction, deleteLPTransaction, DbLP, DbLPTransaction } from '@/lib/db';\nimport { supabase } from '@/lib/supabase';"
)

# 2. Add tab state + doc state after existing state declarations
content = content.replace(
    "  const [txnForm, setTxnForm] = useState({ date: '', amount: '', type: 'Capital Call', notes: '' });",
    """  const [activeTab, setActiveTab] = useState<'details' | 'documents'>('details');

  // Documents
  type LPDoc = { id: string; name: string; file_path: string; file_size: number; file_type: string; doc_type: string; notes: string | null; uploaded_by: string; created_at: string; };
  const LP_DOC_TYPES = ['LPA', 'K-1', 'Quarterly Report', 'Capital Call Notice', 'Distribution Notice', 'Subscription Agreement', 'Side Letter', 'Other'];
  const [docs, setDocs] = useState<LPDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadForm, setUploadForm] = useState({ doc_type: 'Other', notes: '' });
  const [docSearch, setDocSearch] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('All Types');

  const txnForm_placeholder = { date: '', amount: '', type: 'Capital Call', notes: '' };
  const [txnForm, setTxnForm] = useState(txnForm_placeholder);"""
)

# Fix the stale txnForm reference
content = content.replace(
    "  const [txnForm, setTxnForm] = useState({ date: '', amount: '', type: 'Capital Call', notes: '' });",
    ""
)

# 3. Add loadDocs function after the load function
content = content.replace(
    "  const handleDelete = async () => {",
    """  async function loadDocs() {
    setDocsLoading(true);
    try {
      const { data } = await supabase.from('lp_documents').select('*').eq('lp_id', lpId).order('created_at', { ascending: false });
      setDocs(data ?? []);
    } finally {
      setDocsLoading(false);
    }
  }

  const handleUploadDoc = async () => {
    if (!uploadFile) return;
    setUploadingDoc(true);
    try {
      const ext = uploadFile.name.split('.').pop();
      const safeName = uploadFile.name.replace(/[^a-z0-9.]/gi, '-');
      const path = `${lpId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from('lp-documents').upload(path, uploadFile, { upsert: false });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from('lp_documents').insert({
        lp_id: lpId, fund_id: fundId,
        name: uploadFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' '),
        file_path: path, file_size: uploadFile.size, file_type: uploadFile.type,
        doc_type: uploadForm.doc_type, notes: uploadForm.notes || null, uploaded_by: 'GP',
      });
      if (dbErr) throw dbErr;
      setUploadFile(null);
      setUploadForm({ doc_type: 'Other', notes: '' });
      setShowUploadForm(false);
      await loadDocs();
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDoc = async (doc: LPDoc) => {
    if (!confirm(`Delete "${doc.name}"?`)) return;
    await supabase.storage.from('lp-documents').remove([doc.file_path]);
    await supabase.from('lp_documents').delete().eq('id', doc.id);
    await loadDocs();
  };

  const handleViewDoc = async (doc: LPDoc) => {
    const { data } = await supabase.storage.from('lp-documents').createSignedUrl(doc.file_path, 3600);
    if (!data?.signedUrl) return;
    const isPdf = doc.file_path.toLowerCase().endsWith('.pdf');
    const url = isPdf ? data.signedUrl : `https://docs.google.com/viewer?url=${encodeURIComponent(data.signedUrl)}&embedded=false`;
    window.open(url, '_blank');
  };

  const handleDownloadDoc = async (doc: LPDoc) => {
    const { data } = await supabase.storage.from('lp-documents').createSignedUrl(doc.file_path, 3600);
    if (!data?.signedUrl) return;
    const blob = await fetch(data.signedUrl).then(r => r.blob());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = doc.name + '.' + doc.file_path.split('.').pop();
    a.click();
  };

  const handleDeleteDoc_noop = handleDeleteDoc; // suppress unused warning

  const handleViewDoc_noop = handleViewDoc;

  const handleDownloadDoc_noop = handleDownloadDoc;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const DOC_TYPE_COLORS: Record<string, string> = {
    'LPA': 'bg-purple-100 text-purple-700',
    'K-1': 'bg-green-100 text-green-700',
    'Quarterly Report': 'bg-blue-100 text-blue-700',
    'Capital Call Notice': 'bg-amber-100 text-amber-700',
    'Distribution Notice': 'bg-teal-100 text-teal-700',
    'Subscription Agreement': 'bg-indigo-100 text-indigo-700',
    'Side Letter': 'bg-pink-100 text-pink-700',
    'Other': 'bg-gray-100 text-gray-600',
  };

  const handleDelete = async () => {"""
)

# 4. Add loadDocs to useEffect
content = content.replace(
    "  useEffect(() => { load(); }, [lpId]);",
    "  useEffect(() => { load(); loadDocs(); }, [lpId]);"
)

# 5. Add tab navigation after the header section — find the KPI tiles section
content = content.replace(
    "      {saveError && <div className=\"bg-red-50 border border-red-200 rounded-[7px] px-4 py-3 text-[12.5px] text-red-700 mb-4\">⚠️ {saveError}</div>}",
    """      {saveError && <div className="bg-red-50 border border-red-200 rounded-[7px] px-4 py-3 text-[12.5px] text-red-700 mb-4">⚠️ {saveError}</div>}

      {/* Tab navigation */}
      <div className="flex gap-0 border-b border-[#e8e6df] mb-5">
        {(['details', 'documents'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={'px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors capitalize ' +
              (activeTab === tab ? 'border-[#2d5be3] text-[#2d5be3]' : 'border-transparent text-[#6b6860] hover:text-[#1a1917]')}>
            {tab === 'documents' ? `Documents (${docs.length})` : 'Details'}
          </button>
        ))}
      </div>"""
)

# 6. Find the closing of the main content and add Documents tab panel
# Wrap existing content in details tab, add documents tab
# Find the danger zone section which is near the end
old_danger = '      {/* Danger Zone */}'
new_danger = """      {activeTab === 'details' && (<>

      {/* Danger Zone */}"""

content = content.replace(old_danger, new_danger, 1)

# Find the closing part - the last </div> before the final closing tags
# Add documents tab panel before the final closing
content = content.replace(
    "    </div>\n  );\n}",
    """    </div>

      {activeTab === 'documents' && (
        <div>
          {/* Upload section */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[15px] font-semibold">LP Documents</h2>
              <p className="text-[12px] text-[#6b6860] mt-0.5">LPA, K-1s, quarterly reports and other LP-specific documents</p>
            </div>
            <button onClick={() => setShowUploadForm(!showUploadForm)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] transition-colors">
              ↑ Upload Document
            </button>
          </div>

          {showUploadForm && (
            <div className="bg-white border border-[#e8e6df] rounded-xl p-4 mb-4">
              <h3 className="text-[13.5px] font-semibold mb-3">Upload Document</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[12px] font-medium mb-1">Document Type</label>
                  <select value={uploadForm.doc_type} onChange={e => setUploadForm(f => ({...f, doc_type: e.target.value}))}
                    className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3]">
                    {LP_DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium mb-1">Notes (optional)</label>
                  <input value={uploadForm.notes} onChange={e => setUploadForm(f => ({...f, notes: e.target.value}))}
                    placeholder="e.g. FY2024 K-1"
                    className="w-full px-3 py-2 rounded-[7px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3]" />
                </div>
              </div>
              <div className="border-2 border-dashed border-[#e8e6df] rounded-xl p-4 text-center mb-3 cursor-pointer hover:border-[#2d5be3] hover:bg-[#f0f4ff] transition-all"
                onClick={() => document.getElementById('lp-doc-upload')?.click()}>
                {uploadFile ? (
                  <p className="text-[13px] text-[#2d5be3] font-medium">{uploadFile.name} ({formatFileSize(uploadFile.size)})</p>
                ) : (
                  <>
                    <p className="text-[13px] text-[#6b6860]">Click to select file</p>
                    <p className="text-[11.5px] text-[#9b9890] mt-0.5">PDF, Word, Excel, images supported</p>
                  </>
                )}
                <input id="lp-doc-upload" type="file" className="hidden"
                  onChange={e => setUploadFile(e.target.files?.[0] ?? null)} />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowUploadForm(false); setUploadFile(null); }}
                  className="px-4 py-1.5 rounded-[7px] text-[12.5px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5]">Cancel</button>
                <button onClick={handleUploadDoc} disabled={uploadingDoc || !uploadFile}
                  className="px-4 py-1.5 rounded-[7px] text-[12.5px] font-medium bg-[#2d5be3] text-white hover:bg-[#2450cc] disabled:opacity-60">
                  {uploadingDoc ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </div>
          )}

          {/* Search + filter */}
          <div className="flex gap-2 mb-3">
            <input value={docSearch} onChange={e => setDocSearch(e.target.value)}
              placeholder="Search documents…"
              className="flex-1 px-3 py-1.5 rounded-[7px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3]" />
            <select value={docTypeFilter} onChange={e => setDocTypeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-[7px] border border-[#e8e6df] text-[12.5px] outline-none focus:border-[#2d5be3]">
              <option>All Types</option>
              {LP_DOC_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          {/* Document list */}
          {docsLoading ? (
            <div className="text-center py-10 text-[12.5px] text-[#9b9890]">Loading…</div>
          ) : (() => {
            const filtered = docs
              .filter(d => docTypeFilter === 'All Types' || d.doc_type === docTypeFilter)
              .filter(d => !docSearch || d.name.toLowerCase().includes(docSearch.toLowerCase()));
            if (filtered.length === 0) return (
              <div className="bg-white border border-[#e8e6df] rounded-xl p-10 text-center">
                <div className="text-[32px] mb-2">📄</div>
                <div className="text-[13px] font-medium mb-1">{docs.length === 0 ? 'No documents yet' : 'No documents match your filter'}</div>
                <p className="text-[12px] text-[#9b9890]">{docs.length === 0 ? 'Upload LPA, K-1s, quarterly reports and other LP-specific documents' : 'Try a different filter'}</p>
              </div>
            );
            return (
              <div className="space-y-2">
                {filtered.map(doc => (
                  <div key={doc.id} className="bg-white border border-[#e8e6df] rounded-xl px-4 py-3 flex items-center justify-between hover:bg-[#f9f8f5] transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-[20px]">
                        {doc.file_type?.includes('pdf') ? '📕' : doc.file_type?.includes('word') || doc.file_path.endsWith('.docx') ? '📘' : doc.file_type?.includes('sheet') || doc.file_path.endsWith('.xlsx') ? '📗' : '📄'}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium truncate">{doc.name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={'px-1.5 py-0.5 rounded text-[10px] font-medium ' + (DOC_TYPE_COLORS[doc.doc_type] ?? 'bg-gray-100 text-gray-600')}>
                            {doc.doc_type}
                          </span>
                          <span className="text-[11px] text-[#9b9890]">{formatFileSize(doc.file_size)}</span>
                          <span className="text-[11px] text-[#9b9890]">{new Date(doc.created_at).toLocaleDateString()}</span>
                          {doc.notes && <span className="text-[11px] text-[#6b6860] truncate">{doc.notes}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
                      <button onClick={() => handleViewDoc(doc)}
                        className="px-2.5 py-1 rounded-[6px] text-[11.5px] border border-[#e8e6df] bg-white hover:bg-[#f0f4ff] text-[#2d5be3] transition-colors">
                        View
                      </button>
                      <button onClick={() => handleDownloadDoc(doc)}
                        className="px-2.5 py-1 rounded-[6px] text-[11.5px] border border-[#e8e6df] bg-white hover:bg-[#f9f8f5] transition-colors">
                        ↓
                      </button>
                      <button onClick={() => handleDeleteDoc(doc)}
                        className="px-2.5 py-1 rounded-[6px] text-[11.5px] border border-red-200 bg-white hover:bg-red-50 text-red-500 transition-colors">
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

    </div>
  );
}"""
)

# 7. Close the details tab conditional — wrap capital call history + investor details + danger zone
content = content.replace(
    "      {activeTab === 'details' && (<>\n\n      {/* Danger Zone */}",
    "      {activeTab === 'details' && (<>\n\n      {/* Danger Zone */"
)

# Find the danger zone closing and add </> after it
# The danger zone ends before the document tab panel
content = content.replace(
    "      {activeTab === 'documents' && (",
    "      </>)}\n\n      {activeTab === 'documents' && ("
)

with open("app/funds/[id]/lps/[lpId]/page.tsx", "w") as f:
    f.write(content)

print("done")
