import { useState, useEffect, ReactNode } from 'react';
import { Server,  ShieldCheck, Wifi, Loader2, AlertCircle } from 'lucide-react';

import { API_URL } from '../services/api';

type CheckState = 'loading' | 'success' | 'error';

const SystemStatusSidebar = () => {
  const [server, setServer] = useState<CheckState>('loading');
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((res) => {
        // Short delay, so the user sees the check animation.
        if (res.ok) setTimeout(() => setServer('success'), 1200);
        else setServer('error');
      })
      .catch(() => setServer('error'));
  }, []);

  useEffect(() => {
    if (server !== 'success') return;
    const timer = setTimeout(() => setIsVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [server]);

  if (!isVisible) return null;

  return (
    <div className="absolute top-24 left-4 z-[9999] w-64 bg-slate-900/95 backdrop-blur-md border border-cyan-900/50 rounded-lg shadow-2xl p-4 overflow-hidden animate-in slide-in-from-left duration-500">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50 animate-pulse" />
      
      <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
        <h3 className="text-xs font-bold text-cyan-500 uppercase tracking-widest flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> System Check
        </h3>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
        </span>
      </div>

      <div className="space-y-4">
        <StatusItem 
          icon={<Server size={16} />}
          label="BACKEND LINK"
          subtext={server === 'loading' ? "Handshaking..." : server === 'success' ? "Online" : "Connection Failed"}
          state={server}
        />
      </div>
    </div>
  );
};

const StatusItem = ({ icon, label, subtext, state }: { icon: ReactNode; label: string; subtext: string; state: CheckState }) => (
  <div className="flex items-start gap-3">
    <div className={`mt-1 p-1.5 rounded-md border ${
      state === 'success' ? 'bg-green-950 border-green-900 text-green-500' : 
      state === 'error' ? 'bg-red-950 border-red-900 text-red-500' : 
      'bg-slate-800 border-slate-700 text-cyan-500'
    }`}>
      {state === 'loading' ? <Loader2 className="animate-spin" size={14} /> : icon}
    </div>
    <div className="flex-1">
      <div className="flex justify-between items-center">
        <p className="text-xs font-bold text-slate-300">{label}</p>
        {state === 'success' && <Wifi size={12} className="text-green-500" />}
        {state === 'error' && <AlertCircle size={12} className="text-red-500" />}
      </div>
      <p className={`text-[10px] font-mono mt-0.5 ${
        state === 'success' ? 'text-green-400' : 
        state === 'error' ? 'text-red-400' : 
        'text-slate-500'
      }`}>
        {subtext}
      </p>
    </div>
  </div>
);

export default SystemStatusSidebar;