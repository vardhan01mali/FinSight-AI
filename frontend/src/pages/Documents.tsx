import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  Trash2, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight,
  ArrowRightLeft
} from 'lucide-react';
import api from '../services/api';

const Documents: React.FC = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Pagination State
  const [total, setTotal] = useState(0);
  const limit = 10;
  const [offset, setOffset] = useState(0);

  
  // Selection for comparison
  const [selectedDocs, setSelectedDocs] = useState<number[]>([]);
  const navigate = useNavigate();

  const fetchDocuments = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/documents', {
        params: { limit, offset }
      });
      setDocuments(response.data.items);
      setTotal(response.data.total);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch documents. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [limit, offset]);

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this document? This will remove all associated metrics and vector embeddings.')) {
      return;
    }

    try {
      await api.delete(`/api/documents/${id}`);
      fetchDocuments();
      // Remove from selection if deleted
      setSelectedDocs(selectedDocs.filter(d => d !== id));
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || 'Failed to delete document.');
    }
  };

  const handleSelectForCompare = (id: number) => {
    if (selectedDocs.includes(id)) {
      setSelectedDocs(selectedDocs.filter(d => d !== id));
    } else {
      if (selectedDocs.length >= 2) {
        alert('You can only select up to 2 documents for comparison.');
        return;
      }
      setSelectedDocs([...selectedDocs, id]);
    }
  };

  const triggerCompare = () => {
    if (selectedDocs.length !== 2) return;
    navigate(`/analysis?doc1=${selectedDocs[0]}&doc2=${selectedDocs[1]}`);
  };

  // Pagination handlers
  const handlePrevPage = () => {
    if (offset >= limit) {
      setOffset(offset - limit);
    }
  };

  const handleNextPage = () => {
    if (offset + limit < total) {
      setOffset(offset + limit);
    }
  };

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit) || 1;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Completed':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" />
            <span>Ready</span>
          </span>
        );
      case 'Processing':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Parsing</span>
          </span>
        );
      case 'Uploading':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Uploading</span>
          </span>
        );
      case 'Failed':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
            <AlertCircle className="h-3 w-3" />
            <span>Failed</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
            <span>{status}</span>
          </span>
        );
    }
  };

  const formatCurrency = (val: number | null) => {
    if (val === null || val === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="space-y-6 font-sans text-slate-100">
      
      {/* Header and Comparison Trigger */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            File Directory
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Manage your uploaded documents and select two to generate side-by-side financial comparisons.
          </p>
        </div>

        {selectedDocs.length === 2 && (
          <button
            onClick={triggerCompare}
            className="flex items-center space-x-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold px-6 py-3 rounded-2xl cursor-pointer shadow-lg shadow-emerald-500/10 transition-colors animate-pulse"
          >
            <ArrowRightLeft className="h-4 w-4" />
            <span>Compare Selected (2)</span>
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start space-x-3 bg-red-950/20 border border-red-500/30 rounded-2xl p-4 text-red-400 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Grid View */}
      {loading && documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/20 border border-slate-800/80 rounded-3xl">
          <Loader2 className="h-10 w-10 text-emerald-400 animate-spin mb-4" />
          <p className="text-slate-400 text-sm">Retrieving file entries...</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/20 border border-slate-800/80 rounded-3xl">
          <FileText className="h-12 w-12 text-slate-700 mb-4" />
          <p className="text-slate-300 font-semibold">No Documents Found</p>
          <p className="text-slate-500 text-sm mt-1 mb-6">You haven't uploaded any financial documents yet.</p>
          <button
            onClick={() => navigate('/upload')}
            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-semibold px-6 py-2.5 rounded-2xl border border-emerald-500/30 transition-colors cursor-pointer"
          >
            Go to Upload
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-900/60 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    <th className="py-4 px-6 w-12 text-center">Compare</th>
                    <th className="py-4 px-6">Filename</th>
                    <th className="py-4 px-6">Status</th>
                    <th className="py-4 px-6">Revenue</th>
                    <th className="py-4 px-6">Net Profit</th>
                    <th className="py-4 px-6">Upload Date</th>
                    <th className="py-4 px-6 text-center w-20">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {documents.map((doc) => (
                    <tr 
                      key={doc.id} 
                      className={`hover:bg-slate-900/20 transition-colors ${
                        selectedDocs.includes(doc.id) ? 'bg-emerald-500/5 hover:bg-emerald-500/10' : ''
                      }`}
                    >
                      <td className="py-4 px-6 text-center">
                        {doc.processing_status === 'Completed' ? (
                          <input
                            type="checkbox"
                            checked={selectedDocs.includes(doc.id)}
                            onChange={() => handleSelectForCompare(doc.id)}
                            className="h-4.5 w-4.5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500/30 focus:ring-offset-slate-900 cursor-pointer"
                          />
                        ) : (
                          <span className="text-slate-700">-</span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-slate-800/50 rounded-lg text-slate-400 border border-slate-700/50">
                            <FileText className="h-4.5 w-4.5" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm font-semibold text-slate-200 block truncate max-w-xs" title={doc.filename}>
                              {doc.filename}
                            </span>
                            <span className="text-xs text-slate-500 uppercase font-medium">{doc.file_type}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        {getStatusBadge(doc.processing_status)}
                        {doc.failure_reason && (
                          <p className="text-red-400 text-xs mt-1 truncate max-w-[200px]" title={doc.failure_reason}>
                            {doc.failure_reason}
                          </p>
                        )}
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-300 font-medium">
                        {doc.metrics ? formatCurrency(doc.metrics.revenue) : '-'}
                      </td>
                      <td className="py-4 px-6 text-sm font-medium">
                        {doc.metrics ? (
                          <span className={doc.metrics.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                            {formatCurrency(doc.metrics.profit)}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-400">
                        {new Date(doc.created_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer border border-transparent hover:border-red-500/20"
                          title="Delete document"
                        >
                          <Trash2 className="h-4.5 w-4.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          {total > limit && (
            <div className="flex items-center justify-between bg-slate-900/20 border border-slate-800/80 rounded-3xl px-6 py-4">
              <span className="text-sm text-slate-400 font-medium">
                Showing <span className="text-slate-200">{offset + 1}</span> to{' '}
                <span className="text-slate-200">
                  {Math.min(offset + limit, total)}
                </span>{' '}
                of <span className="text-slate-200">{total}</span> entries
              </span>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={handlePrevPage}
                  disabled={offset === 0}
                  className="p-2 bg-slate-900/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-sm text-slate-400 font-semibold px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={handleNextPage}
                  disabled={offset + limit >= total}
                  className="p-2 bg-slate-900/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Documents;
