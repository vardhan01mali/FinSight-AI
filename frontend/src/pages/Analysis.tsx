import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  ArrowRightLeft, 
  Download, 
  FileText, 
  Loader2, 
  AlertCircle, 
  ArrowUpRight, 
  ArrowDownRight,
  FolderOpen
} from 'lucide-react';
import api from '../services/api';

const Analysis: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const doc1Param = searchParams.get('doc1');
  const doc2Param = searchParams.get('doc2');

  const [documents, setDocuments] = useState<any[]>([]);
  const [doc1Id, setDoc1Id] = useState<string>(doc1Param || '');
  const [doc2Id, setDoc2Id] = useState<string>(doc2Param || '');

  const [comparison, setComparison] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  // Load all ready documents for selector fallback
  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const response = await api.get('/api/documents');
        const completed = response.data.items.filter((d: any) => d.processing_status === 'Completed');
        setDocuments(completed);
        
        // If query parameters weren't set but we have documents, default them
        if (!doc1Param && completed.length > 0) {
          setDoc1Id(completed[0].id.toString());
        }
        if (!doc2Param && completed.length > 1) {
          setDoc2Id(completed[1].id.toString());
        }
      } catch (err) {
        console.error('Failed to fetch documents for comparison:', err);
      }
    };
    fetchDocs();
  }, [doc1Param, doc2Param]);

  const runComparison = async (id1: string, id2: string) => {
    if (!id1 || !id2) return;
    if (id1 === id2) {
      setError('Please select two different documents to compare.');
      setComparison(null);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/analysis/compare', {
        params: {
          doc_id_1: Number(id1),
          doc_id_2: Number(id2)
        }
      });
      setComparison(response.data);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to compare documents. Please verify data extraction is completed.');
      setComparison(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (doc1Id && doc2Id) {
      setSearchParams({ doc1: doc1Id, doc2: doc2Id });
      runComparison(doc1Id, doc2Id);
    }
  }, [doc1Id, doc2Id]);

  const handleExportPDF = async () => {
    if (!doc1Id || !doc2Id) return;
    setExportLoading(true);
    try {
      const response = await api.get('/api/analysis/compare/export', {
        params: {
          doc_id_1: Number(doc1Id),
          doc_id_2: Number(doc2Id)
        },
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `comparison_${doc1Id}_vs_${doc2Id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Failed to export comparison report:', err);
      alert('Failed to generate PDF comparison report. Please verify Groq setup.');
    } finally {
      setExportLoading(false);
    }
  };

  const formatCurrency = (val: number | null) => {
    if (val === null || val === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  };

  const formatPct = (val: number | null) => {
    if (val === null || val === undefined) return '';
    return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
  };

  const formatDiff = (val: number | null) => {
    if (val === null || val === undefined) return '';
    return `${val >= 0 ? '+' : ''}${formatCurrency(val)}`;
  };

  return (
    <div className="space-y-6 font-sans text-slate-100">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            Comparative Analytics
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Compare key balance sheet metrics and income statements side-by-side.
          </p>
        </div>

        {comparison && (
          <button
            onClick={handleExportPDF}
            disabled={exportLoading}
            className="flex items-center space-x-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 font-semibold px-5 py-3 rounded-2xl cursor-pointer transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exportLoading ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin text-emerald-400" />
            ) : (
              <Download className="h-4.5 w-4.5 text-emerald-400" />
            )}
            <span>Export Comparison PDF</span>
          </button>
        )}
      </div>

      {/* Selectors Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-center bg-slate-900/40 border border-slate-800/80 rounded-3xl p-5 shadow-xl">
        <div className="lg:col-span-2 space-y-2">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Document 1 (Base)</label>
          <div className="flex items-center space-x-2">
            <FolderOpen className="h-4.5 w-4.5 text-emerald-400 shrink-0" />
            <select
              value={doc1Id}
              onChange={(e) => setDoc1Id(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2 px-3 text-sm text-slate-300 font-medium focus:outline-none focus:border-emerald-500/50"
            >
              <option value="" disabled>Select base document</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id} disabled={doc.id.toString() === doc2Id}>
                  {doc.filename}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-center lg:col-span-1 py-2 sm:py-0">
          <div className="bg-slate-950 p-2.5 rounded-full border border-slate-800 text-slate-400">
            <ArrowRightLeft className="h-5 w-5 rotate-90 sm:rotate-0" />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-2">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Document 2 (Comparison)</label>
          <div className="flex items-center space-x-2">
            <FolderOpen className="h-4.5 w-4.5 text-teal-400 shrink-0" />
            <select
              value={doc2Id}
              onChange={(e) => setDoc2Id(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2 px-3 text-sm text-slate-300 font-medium focus:outline-none focus:border-teal-500/50"
            >
              <option value="" disabled>Select compare document</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id} disabled={doc.id.toString() === doc1Id}>
                  {doc.filename}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start space-x-3 bg-red-950/20 border border-red-500/30 rounded-2xl p-4 text-red-400 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/20 border border-slate-800/80 rounded-3xl">
          <Loader2 className="h-10 w-10 text-emerald-400 animate-spin mb-4" />
          <p className="text-slate-400 text-sm">Synthesizing comparative profiles...</p>
        </div>
      ) : !comparison ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/20 border border-slate-800/80 rounded-3xl">
          <ArrowRightLeft className="h-12 w-12 text-slate-700 mb-4" />
          <p className="text-slate-300 font-semibold">Select Files for Comparison</p>
          <p className="text-slate-500 text-sm mt-1">Select two documents above to display variance analysis.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Metrics Variance Table */}
          <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800/80 rounded-3xl overflow-hidden shadow-xl">
            <div className="p-6 border-b border-slate-800/80 bg-slate-900/20 flex justify-between items-center">
              <h3 className="font-bold text-slate-200">Metric Variance Grid</h3>
              <span className="text-xs text-slate-500 font-medium">Comparison vs Base</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-800/60 bg-slate-950/30 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3.5 px-6">Financial Metric</th>
                    <th className="py-3.5 px-6 truncate max-w-[150px]">{comparison.document1.filename}</th>
                    <th className="py-3.5 px-6 truncate max-w-[150px]">{comparison.document2.filename}</th>
                    <th className="py-3.5 px-6">Absolute Diff</th>
                    <th className="py-3.5 px-6">% Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {Object.keys(comparison.differences).map((key) => {
                    const diff = comparison.differences[key];
                    const isPositive = diff.diff !== null && diff.diff >= 0;
                    
                    // Style helpers
                    let diffColor = 'text-slate-400';
                    let Icon = null;
                    if (diff.diff !== null && diff.diff !== 0) {
                      // Revenue, Profit, Cash Flow, Assets increase is good. Expenses, Liabilities, Debt increase is negative/warning.
                      const isGoodIncrease = ['revenue', 'profit', 'cash_flow', 'assets'].includes(key);
                      if (isGoodIncrease) {
                        diffColor = isPositive ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold';
                      } else {
                        diffColor = isPositive ? 'text-red-400 font-semibold' : 'text-emerald-400 font-semibold';
                      }
                      Icon = isPositive ? ArrowUpRight : ArrowDownRight;
                    }

                    return (
                      <tr key={key} className="hover:bg-slate-900/10 transition-colors">
                        <td className="py-4.5 px-6 font-semibold text-slate-350 capitalize">{key.replace('_', ' ')}</td>
                        <td className="py-4.5 px-6 text-slate-300 font-medium">{formatCurrency(diff.doc1_val)}</td>
                        <td className="py-4.5 px-6 text-slate-300 font-medium">{formatCurrency(diff.doc2_val)}</td>
                        <td className={`py-4.5 px-6 ${diffColor}`}>
                          <div className="flex items-center space-x-1">
                            {Icon && <Icon className="h-4 w-4 shrink-0" />}
                            <span>{diff.diff !== null ? formatDiff(diff.diff) : '-'}</span>
                          </div>
                        </td>
                        <td className={`py-4.5 px-6 ${diffColor}`}>
                          {diff.pct_change !== null ? formatPct(diff.pct_change) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Narrative Summary Cards */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 shadow-xl space-y-4">
              <h3 className="font-bold text-slate-200 border-b border-slate-800 pb-3 flex items-center space-x-2">
                <FileText className="h-5 w-5 text-emerald-400" />
                <span>AI Narrative Synthesis</span>
              </h3>
              
              <div className="text-sm text-slate-400 leading-relaxed max-h-[400px] overflow-y-auto pr-1">
                {comparison.narrative ? (
                  comparison.narrative.split('\n').map((para: string, idx: number) => (
                    <p key={idx} className="mb-3 last:mb-0">
                      {para}
                    </p>
                  ))
                ) : (
                  <p className="text-slate-500 italic">No summary narrative synthesized.</p>
                )}
              </div>
            </div>

            {/* Quick stats check */}
            <div className="bg-gradient-to-br from-indigo-500/10 via-slate-900/40 to-slate-900/40 border border-slate-850/80 rounded-3xl p-6 shadow-xl">
              <h4 className="text-xs text-indigo-400 font-bold uppercase tracking-wider mb-2">Platform Tip</h4>
              <p className="text-xs text-slate-550 leading-relaxed">
                Comparative metrics and AI summaries are derived from direct metadata extraction. You can download the PDF comparison report for offline meetings and printing.
              </p>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

export default Analysis;
