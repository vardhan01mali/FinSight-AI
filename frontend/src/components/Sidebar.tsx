import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileText, 
  UploadCloud, 
  MessageSquare, 
  BarChart3, 
  History, 
  LogOut,
  TrendingUp
} from 'lucide-react';

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const email = localStorage.getItem('finsight_user_email') || 'User';

  const handleLogout = () => {
    localStorage.removeItem('finsight_token');
    localStorage.removeItem('finsight_user_email');
    navigate('/login');
  };

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/upload', label: 'Upload Files', icon: UploadCloud },
    { to: '/documents', label: 'Documents', icon: FileText },
    { to: '/chat', label: 'RAG Chat', icon: MessageSquare },
    { to: '/analysis', label: 'Compare Docs', icon: BarChart3 },
    { to: '/history', label: 'Chat History', icon: History },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 text-slate-200 flex flex-col h-screen shrink-0">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-800 flex items-center space-x-3">
        <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/30">
          <TrendingUp className="h-6 w-6 text-emerald-400 animate-pulse" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
            FinSight AI
          </h1>
          <span className="text-xs text-slate-500 font-medium">Financial Intelligence</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-lg shadow-emerald-500/5'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
                }`
              }
            >
              <Icon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between mb-3 px-2">
          <div className="overflow-hidden pr-2">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Account</p>
            <p className="text-sm font-medium text-slate-300 truncate" title={email}>
              {email}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-800 hover:bg-red-950/20 text-slate-400 hover:text-red-400 border border-slate-700/50 hover:border-red-900/30 transition-all duration-200 cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
