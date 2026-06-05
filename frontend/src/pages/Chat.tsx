import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  Send, 
  Loader2, 
  AlertCircle, 
  FileText, 
  ChevronDown,
  ChevronUp,
  FolderOpen
} from 'lucide-react';
import api from '../services/api';

interface Source {
  filename: string;
  document_id: number;
  page_number: number;
  text: string;
  score?: number;
}

interface Message {
  id: string | number;
  sender: 'user' | 'ai';
  text: string;
  sources?: Source[];
  timestamp: string;
}

const Chat: React.FC = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>('all');
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch completed documents
  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const response = await api.get('/api/documents');
        // Only show completed documents for chat selection
        setDocuments(response.data.items.filter((d: any) => d.processing_status === 'Completed'));
      } catch (err) {
        console.error('Failed to load documents:', err);
      }
    };
    fetchDocs();
  }, []);

  // Fetch chat history
  const fetchChatHistory = async (docId: string) => {
    setHistoryLoading(true);
    setChatHistory([]);
    try {
      const params: any = { limit: 50 };
      if (docId !== 'all') {
        params.document_id = Number(docId);
      }
      const response = await api.get('/api/chat/history', { params });
      
      // Map database records to chat messages (reversed to show oldest first in UI)
      const messages: Message[] = [];
      response.data.items.reverse().forEach((item: any) => {
        messages.push({
          id: `q-${item.id}`,
          sender: 'user',
          text: item.question,
          timestamp: item.created_at
        });
        messages.push({
          id: `a-${item.id}`,
          sender: 'ai',
          text: item.answer,
          sources: item.sources,
          timestamp: item.created_at
        });
      });
      setChatHistory(messages);
    } catch (err) {
      console.error('Failed to load chat history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchChatHistory(selectedDocId);
  }, [selectedDocId]);

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, loading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || loading) return;

    setError('');
    const userMsgText = question;
    setQuestion('');
    
    // Add user message locally
    const tempUserMsg: Message = {
      id: Math.random().toString(),
      sender: 'user',
      text: userMsgText,
      timestamp: new Date().toISOString()
    };
    
    setChatHistory((prev) => [...prev, tempUserMsg]);
    setLoading(true);

    try {
      const params: any = { question: userMsgText };
      if (selectedDocId !== 'all') {
        params.document_id = Number(selectedDocId);
      }

      const response = await api.post('/api/chat', null, { params });
      
      const aiMsg: Message = {
        id: `a-${response.data.id}`,
        sender: 'ai',
        text: response.data.answer,
        sources: response.data.sources,
        timestamp: response.data.created_at
      };

      setChatHistory((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.detail || 
        'Chat request failed. Please check your Groq key setup.'
      );
      
      // Remove the last user message to keep UI correct
      setChatHistory((prev) => prev.slice(0, -1));
      setQuestion(userMsgText); // Restore input
    } finally {
      setLoading(false);
    }
  };

  const toggleSource = (msgId: string | number, idx: number) => {
    const key = `${msgId}-${idx}`;
    setExpandedSources((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] font-sans text-slate-100">
      
      {/* Top Bar / Document Selector */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/40 border border-slate-800/80 rounded-3xl p-5 mb-5 shadow-xl shrink-0">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-200">RAG Analysis Chat</h2>
          <p className="text-xs text-slate-500 font-medium">Ask questions referencing vectorized filings with citation backing.</p>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <FolderOpen className="h-4.5 w-4.5 text-emerald-400 shrink-0" />
          <select
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
            className="w-full sm:w-[260px] bg-slate-950/80 border border-slate-800 rounded-xl py-2 px-3 text-sm text-slate-300 font-medium focus:outline-none focus:border-emerald-500/50 transition-colors"
          >
            <option value="all">Search All Documents</option>
            {documents.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.filename}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages Panel */}
      <div className="flex-1 bg-slate-900/20 border border-slate-800/80 rounded-3xl p-6 overflow-y-auto mb-4 flex flex-col space-y-6 shadow-2xl relative">
        {historyLoading ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Loader2 className="h-8 w-8 text-emerald-400 animate-spin mb-3" />
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Loading history logs...</p>
          </div>
        ) : chatHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto">
            <MessageSquare className="h-10 w-10 text-slate-800 mb-4" />
            <p className="font-bold text-slate-300">Financial RAG Session</p>
            <p className="text-xs text-slate-500 mt-2">
              {selectedDocId === 'all' 
                ? 'Ask general questions spanning all indexed documents. The system will auto-retrieve relevant contexts.'
                : 'Ask specific questions about the selected document. The system will retrieve the matching pages.'}
            </p>
          </div>
        ) : (
          chatHistory.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.sender === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`max-w-[80%] rounded-3xl px-5 py-3.5 text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-semibold rounded-br-none shadow-md shadow-emerald-500/5'
                    : 'bg-slate-900/60 border border-slate-800/80 text-slate-200 rounded-bl-none shadow-lg'
                }`}
              >
                {msg.text}
              </div>

              {/* Sources Citation List for AI Messages */}
              {msg.sender === 'ai' && msg.sources && msg.sources.length > 0 && (
                <div className="mt-3.5 pl-2 space-y-2 max-w-[80%]">
                  <p className="text-slate-550 text-[10px] font-bold uppercase tracking-wider">References Used:</p>
                  <div className="flex flex-wrap gap-2">
                    {msg.sources.map((source, sIdx) => {
                      const sourceKey = `${msg.id}-${sIdx}`;
                      const isExpanded = !!expandedSources[sourceKey];
                      return (
                        <div key={sourceKey} className="flex flex-col">
                          <button
                            onClick={() => toggleSource(msg.id, sIdx)}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-900 border border-slate-800/60 hover:bg-slate-800 hover:text-emerald-400 transition-colors text-slate-400 cursor-pointer"
                          >
                            <FileText className="h-3.5 w-3.5 text-slate-550" />
                            <span className="truncate max-w-[150px]">{source.filename}</span>
                            <span className="text-slate-600 font-bold">|</span>
                            <span>Pg {source.page_number}</span>
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                          
                          {/* Expanded Source Text Segment */}
                          {isExpanded && (
                            <div className="mt-2 p-4 bg-slate-950 border border-slate-800/80 rounded-2xl text-xs text-slate-400 leading-relaxed max-w-[450px] shadow-inner font-mono relative">
                              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2 flex justify-between">
                                <span>Excerpt context:</span>
                                {source.score !== undefined && (
                                  <span>Match: {(source.score * 100).toFixed(0)}%</span>
                                )}
                              </p>
                              {source.text}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Error / Rate limiting warning panel */}
      {error && (
        <div className="flex items-center space-x-2 bg-red-950/20 border border-red-500/20 rounded-2xl p-4 text-red-400 text-sm mb-4 shrink-0">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSend} className="flex space-x-3 shrink-0">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            selectedDocId === 'all' 
              ? 'Ask a question across all files...' 
              : 'Ask a question about this document...'
          }
          disabled={loading}
          className="flex-1 bg-slate-900/60 border border-slate-800 rounded-2xl py-4 px-5 text-sm text-slate-200 placeholder-slate-650 focus:outline-none focus:border-emerald-500/50 transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 p-4 rounded-2xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-emerald-500/10 flex items-center justify-center"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </form>
    </div>
  );
};

export default Chat;
