import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  History as HistoryIcon, 
  MessageSquare, 
  Search, 
  Loader2, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight,
  FileText,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import api from '../services/api';

const History: React.FC = () => {
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Pagination State
  const [total, setTotal] = useState(0);
  const limit = 10;
  const [offset, setOffset] = useState(0);

  const navigate = useNavigate();

  const fetchHistory = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/chat/history', {
        params: { limit, offset }
      });
      setHistoryItems(response.data.items);
      setTotal(response.data.total);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch chat history log.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [limit, offset]);

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

  const toggleExpand = (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
    }
  };

  // Local filtering based on query terms (fallback search)
  const filteredItems = historyItems.filter((item) =>
    item.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.answer.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 font-sans text-slate-100">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            Query Audit Log
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Audit trail of all previous questions, retrieved answers, and citation sources.
          </p>
        </div>

        {/* Local Search bar */}
        <div className="relative w-full sm:w-[300px]">
          <Search className="absolute left-3.5 top-2.5 h-4.5 w-4.5 text-slate-550" />
          <input
            type="text"
            placeholder="Search matching words..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900/60 border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start space-x-3 bg-red-950/20 border border-red-500/30 rounded-2xl p-4 text-red-400 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading && historyItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/20 border border-slate-800/80 rounded-3xl">
          <Loader2 className="h-10 w-10 text-emerald-400 animate-spin mb-4" />
          <p className="text-slate-400 text-sm">Loading audit registers...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/20 border border-slate-800/80 rounded-3xl">
          <HistoryIcon className="h-12 w-12 text-slate-700 mb-4" />
          <p className="text-slate-350 font-semibold">No Queries Found</p>
          <p className="text-slate-500 text-sm mt-1 mb-6">
            {searchTerm ? 'No entries match your search criteria.' : "You haven't asked any RAG questions yet."}
          </p>
          {!searchTerm && (
            <button
              onClick={() => navigate('/chat')}
              className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-semibold px-6 py-2.5 rounded-2xl border border-emerald-500/30 transition-colors cursor-pointer"
            >
              Open Chat Room
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl overflow-hidden shadow-xl">
            <div className="divide-y divide-slate-800/60">
              {filteredItems.map((item) => {
                const isExpanded = expandedId === item.id;
                return (
                  <div key={item.id} className="p-5 hover:bg-slate-900/10 transition-colors">
                    
                    {/* Header Question */}
                    <div 
                      onClick={() => toggleExpand(item.id)} 
                      className="flex items-center justify-between cursor-pointer space-x-4"
                    >
                      <div className="flex items-center space-x-3.5 min-w-0">
                        <div className="p-2.5 bg-slate-950/40 rounded-xl text-slate-500 border border-slate-850 shrink-0">
                          <MessageSquare className="h-4.5 w-4.5 text-slate-500" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-slate-200 truncate pr-4">{item.question}</h4>
                          <span className="text-[10px] text-slate-500 font-semibold">
                            {new Date(item.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div className="text-slate-500 hover:text-slate-350 shrink-0">
                        {isExpanded ? <ChevronUp className="h-4.5 w-4.5" /> : <ChevronDown className="h-4.5 w-4.5" />}
                      </div>
                    </div>

                    {/* Expanded Content Answer */}
                    {isExpanded && (
                      <div className="mt-4 pl-12 space-y-4 border-t border-slate-800/40 pt-4">
                        <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-2xl text-sm leading-relaxed text-slate-300">
                          <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-2">Synthesized Answer:</p>
                          {item.answer}
                        </div>

                        {/* Citations used */}
                        {item.sources && item.sources.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Citation References ({item.sources.length}):</p>
                            <div className="flex flex-wrap gap-2">
                              {item.sources.map((src: any, sIdx: number) => (
                                <div 
                                  key={sIdx}
                                  className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs bg-slate-900 border border-slate-800/80 text-slate-400 font-medium"
                                >
                                  <FileText className="h-3.5 w-3.5 text-slate-500" />
                                  <span className="truncate max-w-[150px]">{src.filename}</span>
                                  <span className="text-slate-700 font-bold">|</span>
                                  <span>Pg {src.page_number}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          </div>

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-between bg-slate-900/20 border border-slate-800/80 rounded-3xl px-6 py-4">
              <span className="text-sm text-slate-400 font-medium">
                Showing <span className="text-slate-200">{offset + 1}</span> to{' '}
                <span className="text-slate-200">
                  {Math.min(offset + limit, total)}
                </span>{' '}
                of <span className="text-slate-200">{total}</span> items
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

export default History;
