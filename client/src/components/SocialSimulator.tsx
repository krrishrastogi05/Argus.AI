import React, { useEffect, useState } from 'react';
import { Image, X, Loader2, ShieldAlert, Activity, CheckCircle2, Clock, Truck } from 'lucide-react';

import { api, fileToBase64 } from '../services/api';
import { useAuth } from '../services/auth';
import { getSocket } from '../services/socket';
import type { Advisory, Report } from '../types';

const STATUS_BADGE: Record<Report['status'], { label: string; className: string; icon: typeof Clock }> = {
  PENDING: { label: 'Under review', className: 'text-yellow-400 border-yellow-800 bg-yellow-950/40', icon: Clock },
  DISPATCHED: { label: 'Help is on the way', className: 'text-cyan-400 border-cyan-800 bg-cyan-950/40', icon: Truck },
  RESOLVED: { label: 'Resolved', className: 'text-green-400 border-green-800 bg-green-950/40', icon: CheckCircle2 },
};

export default function SocialSimulator() {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<'IDLE' | 'POSTING' | 'SENT' | 'ERROR'>('IDLE');
  const [error, setError] = useState('');
  const [advisories, setAdvisories] = useState<Advisory[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  // One id per post: if the request is retried, the server returns the original
  // report instead of creating a duplicate incident.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    const socket = getSocket();

    // Snapshot on (re)connect, deltas in between: nothing is lost while offline.
    const loadSnapshot = () => {
      api<{ advisories: Advisory[] }>('/advisories').then((data) => setAdvisories(data.advisories)).catch(console.error);
      api<{ reports: Report[] }>('/reports/mine').then((data) => setReports(data.reports)).catch(console.error);
    };

    const onAdvisory = (advisory: Advisory) => setAdvisories((prev) => [advisory, ...prev]);
    const onReportUpdated = (report: Report) =>
      setReports((prev) => prev.map((r) => (r.id === report.id ? report : r)));
    const onReportRemoved = ({ id }: { id: string }) => setReports((prev) => prev.filter((r) => r.id !== id));

    loadSnapshot();
    socket.on('connect', loadSnapshot);
    socket.on('system:reset', loadSnapshot);
    socket.on('advisory:published', onAdvisory);
    socket.on('report:updated', onReportUpdated);
    socket.on('report:removed', onReportRemoved);

    return () => {
      socket.off('connect', loadSnapshot);
      socket.off('system:reset', loadSnapshot);
      socket.off('advisory:published', onAdvisory);
      socket.off('report:updated', onReportUpdated);
      socket.off('report:removed', onReportRemoved);
    };
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
    }
  };
  const clearFile = () => { setFile(null); setPreview(null); };

  const handlePost = async () => {
    if (!text && !file) return;
    setStatus('POSTING');
    setError('');
    try {
      const media = file ? { data: await fileToBase64(file), mimeType: file.type } : undefined;
      const { report } = await api<{ report: Report }>('/reports', {
        method: 'POST',
        body: { channel: 'SOCIAL', text, media, clientRequestId: requestId },
      });

      setReports((prev) => [report, ...prev.filter((r) => r.id !== report.id)]);
      setStatus('SENT');
      setRequestId(crypto.randomUUID());
      setTimeout(() => { setText(''); clearFile(); setStatus('IDLE'); }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post');
      setStatus('ERROR');
      setTimeout(() => setStatus('IDLE'), 3000);
    }
  };

  return (
    <div className="h-full bg-black flex flex-col items-center overflow-hidden">

      {/* HEADER */}
      <div className="w-full bg-slate-900 border-b border-slate-800 p-4 text-center shrink-0">
         <h2 className="text-white font-bold flex items-center justify-center gap-2">
            <Activity className="text-blue-500" /> SOCIAL FEED
         </h2>
         <p className="text-xs text-slate-500 font-mono mt-1">
            SIGNED IN AS {user?.name.toUpperCase()} · YOUR POSTS GO TO THE COMMAND CENTRE
         </p>
      </div>

      <div className="w-full max-w-[600px] border-x border-slate-800 flex-1 overflow-y-auto">

        {/* COMPOSER */}
        <div className="p-4 border-b border-slate-800 flex gap-4">
          <div className="shrink-0">
             <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden">
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user?.id || 'me')}`} alt="" />
             </div>
          </div>

          <div className="flex-1">
             <div className="mb-3">
               <textarea
                 className="w-full bg-transparent text-xl text-white placeholder-slate-500 outline-none resize-none min-h-[80px]"
                 placeholder="What is happening?!"
                 aria-label="Describe what is happening"
                 maxLength={2000}
                 value={text}
                 onChange={(e) => setText(e.target.value)}
               />
             </div>
             {preview && (
               <div className="relative mb-4 group">
                 <img src={preview} alt="Upload preview" className="rounded-2xl w-full max-h-[400px] object-cover border border-slate-800" />
                 <button onClick={clearFile} aria-label="Remove attachment" className="absolute top-2 right-2 p-1 bg-black/70 rounded-full text-white hover:bg-black/90 transition backdrop-blur-sm"><X className="w-5 h-5" /></button>
               </div>
             )}
             {error && <p role="alert" className="text-sm text-red-400 mb-2">{error}</p>}
             <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
                <div className="flex gap-2 text-sky-500">
                   <label className="p-2 hover:bg-sky-500/10 rounded-full cursor-pointer transition" aria-label="Attach image or video">
                      <Image className="w-5 h-5" />
                      <input type="file" className="hidden" accept="image/*,video/*" onChange={handleFileSelect} />
                   </label>
                </div>
                <button onClick={handlePost} disabled={(!text && !file) || status !== 'IDLE'} className="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:hover:bg-sky-500 text-white font-bold px-5 py-2 rounded-full transition-all flex items-center gap-2">
                  {status === 'POSTING' ? <><Loader2 className="w-4 h-4 animate-spin" /> Posting</> : status === 'SENT' ? "Posted" : "Post"}
                </button>
             </div>
          </div>
        </div>

        {/* MY REPORTS: live status from the command centre */}
        {reports.length > 0 && (
          <div className="border-b border-slate-800">
            <h3 className="px-4 pt-4 pb-2 text-xs font-bold text-slate-500 font-mono">YOUR REPORTS</h3>
            {reports.map((report) => {
              const badge = STATUS_BADGE[report.status];
              return (
                <div key={report.id} className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-white/[0.03]">
                  <div className="min-w-0">
                    <p className="text-white font-semibold">{report.type} <span className="text-slate-500 text-xs font-normal">· severity {report.severity}/10</span></p>
                    <p className="text-slate-400 text-sm truncate">{report.description}</p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 ${badge.className}`}>
                    <badge.icon className="w-3 h-3" /> {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* FEED: official advisories */}
        <div className="divide-y divide-slate-800">
           {advisories.map((advisory) => (
             <div key={advisory._id} className="p-4 bg-red-900/10 hover:bg-red-900/20 transition flex gap-4 border-l-4 border-red-500 animate-in slide-in-from-top-4">
                <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center border border-red-500"><ShieldAlert className="text-red-500 w-6 h-6" /></div>
                <div>
                   <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                      <span className="font-bold text-white text-base flex items-center gap-1">{advisory.author} <span className="bg-slate-700 text-[10px] px-1 rounded text-slate-300">OFFICIAL</span></span>
                      <span>@city_help · {new Date(advisory.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                   </div>
                   <p className="text-white mb-2 text-lg leading-snug">{advisory.message}</p>
                </div>
             </div>
           ))}
           {advisories.length === 0 && (
             <p className="p-6 text-center text-slate-600 text-sm font-mono">NO OFFICIAL ADVISORIES RIGHT NOW</p>
           )}
        </div>
      </div>
    </div>
  );
}
