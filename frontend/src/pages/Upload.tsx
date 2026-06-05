import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  UploadCloud, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Loader2,
  X
} from 'lucide-react';
import api from '../services/api';

interface UploadQueueItem {
  id: string;
  name: string;
  size: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  docId?: number;
}

const Upload: React.FC = () => {
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // File size limits in bytes: 20MB for docs, 10MB for images
  const DOC_LIMIT = 20 * 1024 * 1024;
  const IMG_LIMIT = 10 * 1024 * 1024;
  const SUPPORTED_FORMATS = [
    'pdf', 'docx', 'xlsx', 'xls', 'csv', 'txt', 'json', 'xml', 'jpg', 'jpeg', 'png'
  ];

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const validateFile = (file: File): string | null => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!SUPPORTED_FORMATS.includes(ext)) {
      return `Unsupported file format .${ext}`;
    }

    const isImage = ['jpg', 'jpeg', 'png'].includes(ext);
    const limit = isImage ? IMG_LIMIT : DOC_LIMIT;
    
    if (file.size > limit) {
      return `File size exceeds the limit of ${isImage ? '10MB' : '20MB'}.`;
    }

    return null;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      addFilesToQueue(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      addFilesToQueue(Array.from(e.target.files));
    }
  };

  const addFilesToQueue = (files: File[]) => {
    const newItems: UploadQueueItem[] = files.map((file) => {
      const error = validateFile(file);
      return {
        id: Math.random().toString(36).substring(7),
        name: file.name,
        size: file.size,
        status: error ? 'failed' : 'pending',
        progress: 0,
        error: error || undefined,
      };
    });

    setQueue((prev) => [...prev, ...newItems]);

    // Automatically trigger upload for non-failed items
    newItems.forEach((item) => {
      if (item.status === 'pending') {
        uploadFile(item.id, files.find((f) => f.name === item.name)!);
      }
    });
  };

  const uploadFile = async (queueId: string, file: File) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === queueId ? { ...item, status: 'uploading', progress: 10 } : item
      )
    );

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post('/api/documents/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const { document_id } = response.data;


      setQueue((prev) =>
        prev.map((item) =>
          item.id === queueId
            ? {
                ...item,
                status: 'processing',
                progress: 50,
                docId: document_id,
              }
            : item
        )
      );

      // Start polling status for this document
      pollProcessingStatus(queueId, document_id);
    } catch (err: any) {
      console.error(err);
      setQueue((prev) =>
        prev.map((item) =>
          item.id === queueId
            ? {
                ...item,
                status: 'failed',
                error: err.response?.data?.detail || 'Upload failed. Server error.',
              }
            : item
        )
      );
    }
  };

  const pollProcessingStatus = async (queueId: string, docId: number) => {
    const checkStatus = async () => {
      try {
        const response = await api.get(`/api/documents/${docId}`);
        const currentDoc = response.data;

        if (currentDoc) {
          const statusMap: Record<string, UploadQueueItem['status']> = {
            'Uploading': 'uploading',
            'Processing': 'processing',
            'Completed': 'completed',
            'Failed': 'failed'
          };

          const newStatus = statusMap[currentDoc.processing_status] || 'failed';

          setQueue((prev) =>
            prev.map((item) =>
              item.id === queueId
                ? {
                    ...item,
                    status: newStatus,
                    progress: newStatus === 'completed' ? 100 : item.progress,
                    error: currentDoc.failure_reason || undefined,
                  }
                : item
            )
          );

          if (newStatus === 'completed' || newStatus === 'failed') {
            clearInterval(intervalId);
          }
        }
      } catch (err) {
        console.error('Error polling status:', err);
      }
    };

    const intervalId = setInterval(checkStatus, 3000);
    // Initial run
    checkStatus();
  };

  const removeQueueItem = (id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6 font-sans text-slate-100">
      
      {/* Header */}
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
          Document Ingestion
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Upload and index your financial filings (PDF, Excel, Word, CSV, Images, etc.) securely.
        </p>
      </div>

      {/* Upload Box */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center transition-all duration-300 ${
          dragActive
            ? 'border-emerald-500 bg-emerald-950/10'
            : 'border-slate-800 bg-slate-900/20 hover:border-slate-700/80 hover:bg-slate-900/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={handleFileChange}
        />
        
        <div className="bg-emerald-500/10 p-5 rounded-2xl border border-emerald-500/20 mb-4 text-emerald-400">
          <UploadCloud className="h-10 w-10 animate-bounce" />
        </div>
        
        <p className="text-lg font-semibold text-slate-200">
          Drag and drop files here
        </p>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          PDF, Excel, Word, CSV, JSON, XML, images (Max doc: 20MB, images: 10MB)
        </p>
        
        <button
          onClick={onButtonClick}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-6 py-3 rounded-2xl cursor-pointer shadow-lg shadow-emerald-500/10 transition-colors"
        >
          Browse Files
        </button>
      </div>

      {/* Queue View */}
      {queue.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <h3 className="font-bold text-slate-200">Ingestion Queue</h3>
            <button 
              onClick={() => navigate('/documents')} 
              className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold"
            >
              View Document List →
            </button>
          </div>

          <div className="divide-y divide-slate-800/60 max-h-[400px] overflow-y-auto pr-1">
            {queue.map((item) => (
              <div key={item.id} className="py-4 flex items-center justify-between first:pt-0 last:pb-0">
                <div className="flex items-center space-x-4 min-w-0 flex-1">
                  <div className="p-2.5 bg-slate-800/60 rounded-xl text-slate-400 border border-slate-700/50">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-200 truncate">{item.name}</p>
                    <div className="flex items-center space-x-2 text-xs text-slate-500 mt-1">
                      <span>{formatBytes(item.size)}</span>
                      <span>•</span>
                      {item.status === 'uploading' && (
                        <span className="text-blue-400 flex items-center">
                          <Loader2 className="h-3 w-3 animate-spin mr-1" /> Uploading ({item.progress}%)
                        </span>
                      )}
                      {item.status === 'processing' && (
                        <span className="text-indigo-400 flex items-center">
                          <Loader2 className="h-3 w-3 animate-spin mr-1" /> Vectorizing & Parsing...
                        </span>
                      )}
                      {item.status === 'completed' && (
                        <span className="text-emerald-400 flex items-center">
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Processed & Embedded
                        </span>
                      )}
                      {item.status === 'failed' && (
                        <span className="text-red-400 flex items-center" title={item.error}>
                          <AlertCircle className="h-3.5 w-3.5 mr-1" /> {item.error || 'Processing failed'}
                        </span>
                      )}
                      {item.status === 'pending' && (
                        <span className="text-slate-400 flex items-center">
                          <Clock className="h-3.5 w-3.5 mr-1" /> Queued
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="ml-4 shrink-0">
                  {(item.status === 'completed' || item.status === 'failed') && (
                    <button
                      onClick={() => removeQueueItem(item.id)}
                      className="p-1 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Upload;
