import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  TrendingUp, 
  DollarSign, 
  Briefcase, 
  FileText, 
  ArrowUpRight,
  TrendingDown,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import api from '../services/api';

const Dashboard: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.get('/api/dashboard/metrics');
        setData(response.data);
      } catch (err: any) {
        console.error(err);
        setError('Failed to fetch dashboard metrics. Please ensure you have completed documents.');
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
  }, []);

  const formatCurrency = (val: number | null) => {
    if (val === null || val === undefined) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 bg-slate-950 text-slate-100">
        <Loader2 className="h-10 w-10 text-emerald-400 animate-spin mb-4" />
        <p className="text-slate-400 text-sm">Aggregating financial intelligence...</p>
      </div>
    );
  }

  const summary = data?.summary || {
    total_documents: 0,
    total_revenue: 0,
    total_expenses: 0,
    total_profit: 0,
    total_assets: 0,
    total_liabilities: 0
  };

  const chartData = (data?.documents || [])
    .filter((d: any) => d.metrics.revenue !== null)
    .map((d: any) => ({
      name: d.filename.length > 15 ? d.filename.substring(0, 15) + '...' : d.filename,
      Revenue: d.metrics.revenue || 0,
      Expenses: d.metrics.expenses || 0,
      Profit: d.metrics.profit || 0,
      Assets: d.metrics.assets || 0,
      Liabilities: d.metrics.liabilities || 0
    }))
    .reverse(); // Show chronological oldest to newest

  const stats = [
    {
      label: 'Combined Revenue',
      value: formatCurrency(summary.total_revenue),
      icon: DollarSign,
      color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/20 text-emerald-400'
    },
    {
      label: 'Combined Expenses',
      value: formatCurrency(summary.total_expenses),
      icon: TrendingDown,
      color: 'from-red-500/20 to-orange-500/10 border-red-500/20 text-red-400'
    },
    {
      label: 'Combined Net Profit',
      value: formatCurrency(summary.total_profit),
      icon: TrendingUp,
      color: summary.total_profit >= 0 
        ? 'from-emerald-500/20 to-teal-500/10 border-emerald-500/20 text-emerald-400' 
        : 'from-red-500/20 to-orange-500/10 border-red-500/20 text-red-400'
    },
    {
      label: 'Combined Assets',
      value: formatCurrency(summary.total_assets),
      icon: Briefcase,
      color: 'from-blue-500/20 to-indigo-500/10 border-blue-500/20 text-blue-400'
    },
  ];

  return (
    <div className="space-y-6 font-sans text-slate-100">
      
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            Financial Dashboard
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Visual metrics synthesized from all parsed and completed document filings.
          </p>
        </div>
        <button
          onClick={() => navigate('/upload')}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-3 rounded-2xl cursor-pointer shadow-lg shadow-emerald-500/10 transition-colors flex items-center space-x-2 text-sm"
        >
          <span>Ingest New File</span>
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="flex items-start space-x-3 bg-red-950/10 border border-red-500/20 rounded-2xl p-4 text-red-400 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div 
              key={idx} 
              className={`bg-slate-900/40 backdrop-blur-xl border rounded-3xl p-6 flex items-center justify-between shadow-lg transition-transform hover:-translate-y-0.5 duration-200 ${stat.color.split(' ')[0]} ${stat.color.split(' ')[1]} ${stat.color.split(' ')[2]}`}
            >
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">{stat.label}</p>
                <p className="text-2xl font-black mt-2 tracking-tight">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-2xl bg-slate-950/60 border border-slate-800 ${stat.color.split(' ')[3]}`}>
                <Icon className="h-6 w-6" />
              </div>
            </div>
          );
        })}
      </div>

      {summary.total_documents === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-900/20 border border-slate-800/80 rounded-3xl">
          <FileText className="h-12 w-12 text-slate-700 mb-4" />
          <p className="text-slate-300 font-semibold">No Data Available</p>
          <p className="text-slate-500 text-sm mt-1 mb-6">Upload financial files to view trends and charts.</p>
          <button
            onClick={() => navigate('/upload')}
            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-semibold px-6 py-2.5 rounded-2xl border border-emerald-500/30 transition-colors cursor-pointer"
          >
            Upload Document
          </button>
        </div>
      ) : (
        <>
          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Revenue, Expenses & profit comparison Area chart */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 shadow-xl">
              <h3 className="text-base font-bold text-slate-200 mb-6">Income Performance Trend</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#34d399" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f87171" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '16px' }}
                      labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Area type="monotone" dataKey="Revenue" stroke="#34d399" fillOpacity={1} fill="url(#colorRev)" strokeWidth={2} name="Revenue" />
                    <Area type="monotone" dataKey="Expenses" stroke="#f87171" fillOpacity={1} fill="url(#colorExp)" strokeWidth={2} name="Expenses" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Assets vs Liabilities Bar Chart */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 shadow-xl">
              <h3 className="text-base font-bold text-slate-200 mb-6">Balance Sheet Comparison</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '16px' }}
                      labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Bar dataKey="Assets" fill="#3b82f6" radius={[6, 6, 0, 0]} name="Assets" />
                    <Bar dataKey="Liabilities" fill="#6366f1" radius={[6, 6, 0, 0]} name="Liabilities" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

          {/* Document Breakdown List */}
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-200 mb-4">Ingested Document Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-800/80 text-slate-500 font-semibold">
                    <th className="py-3 px-4">Filename</th>
                    <th className="py-3 px-4">Revenue</th>
                    <th className="py-3 px-4">Expenses</th>
                    <th className="py-3 px-4">Profit</th>
                    <th className="py-3 px-4">Assets</th>
                    <th className="py-3 px-4">Liabilities</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {data.documents.map((doc: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-900/10 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-300">{doc.filename}</td>
                      <td className="py-3 px-4 text-slate-400">{formatCurrency(doc.metrics.revenue)}</td>
                      <td className="py-3 px-4 text-slate-400">{formatCurrency(doc.metrics.expenses)}</td>
                      <td className={`py-3 px-4 font-semibold ${doc.metrics.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(doc.metrics.profit)}
                      </td>
                      <td className="py-3 px-4 text-slate-400">{formatCurrency(doc.metrics.assets)}</td>
                      <td className="py-3 px-4 text-slate-400">{formatCurrency(doc.metrics.liabilities)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
