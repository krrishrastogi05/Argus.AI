import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getSocket } from "../services/socket";
import { 
  Activity, Crosshair, MapPin, Eye, Volume2, Truck, 
  CheckCircle2, Trash2, Maximize, Flame, Stethoscope, 
  Megaphone, Loader2, ChevronDown, Shield, Siren, X, AlertTriangle
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { api, ApiError } from '../services/api';
import type { Incident, Unit, UnitType } from '../types';
import SystemStatusSidebar from './SystemStatusSidebar';

const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY;
const DEFAULT_VIEW: [number, number] = [28.6139, 77.2090];

const incidentIcon = new L.DivIcon({
  className: "bg-transparent",
  html: `
    <div style="position: relative; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center;">
      <div style="
        position: absolute; 
        width: 100%; 
        height: 100%; 
        background: rgba(239, 68, 68, 0.5); 
        border-radius: 50%; 
        animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
      "></div>
      
      <div style="position: relative; z-index: 10; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));">
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="#dc2626" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </div>
    </div>
  `,
  iconSize: [50, 50],
  iconAnchor: [25, 25],
});

const dot = (color: string) =>
  new L.DivIcon({
    className: 'bg-transparent',
    html: `<div style="background:${color}; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow: 0 0 10px ${color};"></div>`,
  });

const UNIT_ICONS: Record<UnitType, L.DivIcon> = {
  POLICE: dot('#3b82f6'),
  FIRE: dot('#ef4444'),
  MEDICAL: dot('#22c55e'),
};

const isValidCoord = (coord: any) => Array.isArray(coord) && coord.length === 2 && coord[0] != null && coord[1] != null;

function MapController({ center, zoom, shouldFly }: { center: [number, number] | null, zoom: number, shouldFly: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (center && shouldFly && isValidCoord(center)) {
      map.invalidateSize();
      map.flyTo(center, zoom, { animate: true, duration: 2.0 });
    }
  }, [center, zoom, shouldFly, map]);
  return null;
}

export default function SurveillanceDashboard() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [suggestedUnits, setSuggestedUnits] = useState<Unit[]>([]);
  
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [mapZoom, setMapZoom] = useState(11);
  const [shouldFly, setShouldFly] = useState(false);
  const [advisoryStatus, setAdvisoryStatus] = useState('');
  const [incomingAlert, setIncomingAlert] = useState<Incident | null>(null);
  // The alert stays until the operator closes it.
  const flash = !!incomingAlert && incomingAlert.severity > 7;

  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const handleResetSystem = async () => {
    if (!confirm("Wipe all incidents and advisories, and set every unit to IDLE?")) return;
    try {
      await api('/admin/reset', { method: 'POST' });
      setSelectedIncident(null);
      setIsPanelOpen(false);
      handleResetView();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Reset failed');
    }
  };

  const flyTo = (center: [number, number], zoom: number) => {
    setMapCenter(center);
    setMapZoom(zoom);
    setShouldFly(true);
    setTimeout(() => setShouldFly(false), 2500);
  };

  const handleResetView = () => flyTo(DEFAULT_VIEW, 11);

  // The AI writes a draft. The operator approves it before all citizens get it.
  const handleBroadcastAdvisory = async () => {
    if (!selectedIncident) return;
    try {
      setAdvisoryStatus('GENERATING...');
      const draft = await api<{ text: string }>('/advisories/draft', { method: 'POST', body: { incidentId: selectedIncident._id } });
      if (!confirm(`Publish this advisory to all citizens?\n\n${draft.text}`)) {
        setAdvisoryStatus('');
        return;
      }
      setAdvisoryStatus('POSTING...');
      await api('/advisories', { method: 'POST', body: { message: draft.text, incidentId: selectedIncident._id } });
      setAdvisoryStatus('SENT');
      setTimeout(() => setAdvisoryStatus(''), 2000);
    } catch (err) {
      setAdvisoryStatus('');
      alert(err instanceof Error ? err.message : 'Advisory failed');
    }
  };

  const loadSuggestions = async (incident: Incident) => {
    setSuggestedUnits([]);
    if (incident.status !== 'PENDING') return;
    const { units } = await api<{ units: Unit[] }>(`/incidents/${incident._id}/nearest-units`);
    setSuggestedUnits(units);
  };

  const focusOnIncident = (incident: Incident) => {
    if (!isValidCoord(incident?.location?.coordinates)) return;

    setSelectedIncident(incident);
    setIsPanelOpen(true);
    flyTo(incident.location.coordinates, 16);
    loadSuggestions(incident).catch(console.error);
  };

  const handleDeploy = async (unitId: string) => {
    if (!selectedIncident) return;
    try {
      const { incident } = await api<{ incident: Incident }>(`/incidents/${selectedIncident._id}/dispatch`, {
        method: 'POST',
        body: { unitId },
      });
      setSelectedIncident(incident);
      setSuggestedUnits([]);
    } catch (err) {
      // 409: another operator was first. Load the units again.
      if (err instanceof ApiError && err.status === 409) {
        alert(err.message);
        loadSuggestions(selectedIncident).catch(console.error);
      } else {
        alert(err instanceof Error ? err.message : 'Dispatch failed');
      }
    }
  };

  const handleResolve = async () => {
    if (!selectedIncident) return;
    try {
      await api(`/incidents/${selectedIncident._id}/resolve`, { method: 'POST' });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Resolve failed');
    }
  };

  const handleRemoveIncident = async () => {
    if (!selectedIncident) return;
    if (!confirm(`Remove this ${selectedIncident.type || 'incident'}?`)) return;

    try {
      await api(`/incidents/${selectedIncident._id}`, { method: 'DELETE' });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Remove failed');
    }
  };

  useEffect(() => {
    const socket = getSocket();

    // Get a full snapshot on each connect, so no event is lost offline.
    const loadSnapshot = async () => {
      const [incidentPage, unitList] = await Promise.all([
        api<{ items: Incident[] }>('/incidents?status=PENDING,DISPATCHED&limit=100'),
        api<{ units: Unit[] }>('/units'),
      ]);
      setIncidents(incidentPage.items);
      setUnits(unitList.units);
      setSelectedIncident((prev) => (prev ? incidentPage.items.find((inc) => inc._id === prev._id) || null : prev));
    };

    const upsertIncident = (incident: Incident) => {
      setIncidents((prev) =>
        incident.status === 'RESOLVED'
          ? prev.filter((inc) => inc._id !== incident._id)
          : [incident, ...prev.filter((inc) => inc._id !== incident._id)],
      );
      // Another operator can change the open incident.
      setSelectedIncident((prev) => (prev?._id === incident._id ? incident : prev));
    };

    const onCreated = (incident: Incident) => {
      upsertIncident(incident);
      setIncomingAlert(incident);
    };

    const onRemoved = ({ id }: { id: string }) => {
      setIncidents((prev) => prev.filter((inc) => inc._id !== id));
      setSelectedIncident((prev) => (prev?._id === id ? null : prev));
    };

    const onUnitUpdated = (unit: Unit) =>
      setUnits((prev) => [...prev.filter((u) => u._id !== unit._id), unit]);

    const resync = () => loadSnapshot().catch(console.error);

    resync();
    socket.on('connect', resync);
    socket.on('system:reset', resync);
    socket.on('incident:created', onCreated);
    socket.on('incident:updated', upsertIncident);
    socket.on('incident:removed', onRemoved);
    socket.on('unit:updated', onUnitUpdated);

    return () => {
      socket.off('connect', resync);
      socket.off('system:reset', resync);
      socket.off('incident:created', onCreated);
      socket.off('incident:updated', upsertIncident);
      socket.off('incident:removed', onRemoved);
      socket.off('unit:updated', onUnitUpdated);
    };
  }, []);

  return (
    <div className="flex flex-col md:flex-row h-full bg-slate-950 text-slate-200 relative overflow-hidden">
      <div className={`absolute inset-0 bg-red-500/20 z-[9999] pointer-events-none transition-opacity duration-500 ${flash ? 'opacity-100 animate-pulse' : 'opacity-0'}`} />
      {incomingAlert && (
        <div className="absolute top-20 left-1/2 z-[3000] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 animate-in slide-in-from-top-4 duration-300 md:top-6">
          <div className="border border-red-500/70 bg-slate-950/95 shadow-[0_0_40px_rgba(239,68,68,0.25)] backdrop-blur rounded p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded bg-red-500/15 p-2 text-red-400">
                <Siren className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-bold tracking-widest text-red-400">NEW INCIDENT REGISTERED</p>
                  <button
                    onClick={() => setIncomingAlert(null)}
                    className="rounded p-1 text-slate-500 transition hover:bg-slate-800 hover:text-white"
                    aria-label="Dismiss incident alert"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <h3 className="mt-1 truncate text-lg font-bold uppercase text-white">{incomingAlert.type || 'Incident Alert'}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-slate-300">{incomingAlert.description || 'New incident requires operator review.'}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded border border-red-800 bg-red-950/40 px-2 py-1 text-[10px] font-bold text-red-300">
                    SEVERITY {incomingAlert.severity || 'N/A'}/10
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                    {incomingAlert.location?.address || 'Location pending'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    focusOnIncident(incomingAlert);
                    setIncomingAlert(null);
                  }}
                  className="mt-4 w-full rounded border border-cyan-700 bg-cyan-900/40 px-3 py-2 text-xs font-bold text-cyan-300 transition hover:bg-cyan-700 hover:text-white"
                >
                  FOCUS ON MAP
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <SystemStatusSidebar />

      <div className="flex-1 relative h-full w-full">
        <MapContainer center={DEFAULT_VIEW} zoom={11} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer url={`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png${CARTO_KEY ? `?key=${CARTO_KEY}` : ''}`} attribution="© OpenStreetMap, © CARTO" />
          <MapController center={mapCenter} zoom={mapZoom} shouldFly={shouldFly} />
          
          {incidents.map((inc) => {
            if (!isValidCoord(inc?.location?.coordinates)) return null;

            return (
              <React.Fragment key={inc._id}>
                <Marker 
                  position={inc.location.coordinates as [number, number]} 
                  icon={incidentIcon} 
                  eventHandlers={{ click: () => focusOnIncident(inc) }} 
                />
                {inc.assignedUnit && isValidCoord(inc.assignedUnit.coordinates) && (
                  <Polyline 
                      positions={[
                        inc.location.coordinates as [number, number], 
                        inc.assignedUnit.coordinates
                      ]} 
                      pathOptions={{ color: '#0ea5e9', dashArray: '5, 8', weight: 2, opacity: 0.6 }} 
                  />
                )}
              </React.Fragment>
            );
          })}

          {units.map((unit) => {
             if (!isValidCoord(unit?.coordinates)) return null;

             return (
              <Marker 
                  key={unit._id} 
                  position={unit.coordinates as [number, number]} 
                  icon={UNIT_ICONS[unit.type]}
              >
                <Popup><strong>{unit.name}</strong><br />{unit.type}</Popup>
              </Marker>
             );
          })}
        </MapContainer>

        {/* HEADER OVERLAY */}
        <div className="absolute top-0 left-0 w-full p-4 z-[1000] bg-gradient-to-b from-slate-950/90 to-transparent flex justify-between items-start pointer-events-none">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tighter text-white flex items-center gap-2 drop-shadow-md">
              <Eye className="text-cyan-500 w-8 h-8" /> ARGUS<span className="text-cyan-500">.AI</span>
            </h1>
            <p className="text-[8px] md:text-[10px] text-cyan-400 font-mono ml-10 md:ml-12 tracking-widest">
                PANOPTIC SURVEILLANCE SYSTEM
            </p>
          </div>
          
          <button onClick={handleResetSystem} className="pointer-events-auto bg-red-900/20 hover:bg-red-900/80 border border-red-800 text-red-500 hover:text-white p-2 rounded transition-all flex items-center gap-2 text-xs font-mono font-bold backdrop-blur-sm">
            <Trash2 className="w-4 h-4" /> <span className="hidden md:inline">RESET SYSTEM</span><span className="md:hidden">RESET</span>
          </button>
        </div>

        <div className="absolute bottom-20 md:bottom-6 right-4 md:right-6 z-[1000]">
          <button onClick={handleResetView} className="bg-slate-900 hover:bg-slate-800 text-white p-3 rounded-full shadow-lg border border-slate-700 flex items-center gap-2 transition-transform hover:scale-105">
            <Maximize className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* DETAILS SIDEBAR / MOBILE DRAWER */}
      <div className={`
        fixed md:static bottom-0 left-0 right-0 
        md:w-96 w-full 
        h-[60vh] md:h-full 
        bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 
        flex flex-col z-[2000] shadow-2xl 
        transition-transform duration-300 ease-in-out
        ${isPanelOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
      `}>
        
        <div
            className="md:hidden w-full bg-slate-800/50 h-8 flex items-center justify-center cursor-pointer border-b border-slate-800"
            onClick={() => setIsPanelOpen(!isPanelOpen)}
        >
            <ChevronDown className="w-5 h-5 text-slate-500" />
        </div>

        <div className="p-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
          <h2 className="font-bold text-slate-300 flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-500" /> LIVE FORENSICS
          </h2>
          {selectedIncident && (
             <div className="flex gap-2">
                <button onClick={() => focusOnIncident(selectedIncident)} className="text-[10px] bg-cyan-900/30 text-cyan-400 px-2 py-1 rounded border border-cyan-800 hover:bg-cyan-800/50 transition">RE-FOCUS</button>
                <button onClick={handleRemoveIncident} className="text-[10px] bg-red-900/30 text-red-400 px-2 py-1 rounded border border-red-800 hover:bg-red-800/50 transition flex items-center gap-1"><Trash2 className="w-3 h-3" />REMOVE</button>
                <button onClick={() => setIsPanelOpen(false)} className="md:hidden text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded border border-slate-700">HIDE</button>
             </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20 md:pb-4">
          {!selectedIncident ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
              <Crosshair className="w-16 h-16 opacity-20" />
              <p className="text-sm font-mono">SELECT TARGET ON MAP</p>
            </div>
          ) : (
            <div className="animate-in slide-in-from-right duration-300 space-y-6">
              
              <div className="border-l-4 border-red-500 pl-4">
                <h3 className="text-xl md:text-2xl font-bold text-white uppercase">{selectedIncident.type}</h3>
                <div className="flex items-center gap-3 mt-1">
                   <span className={`text-xs px-2 py-0.5 rounded border font-mono ${selectedIncident.severity > 7 ? 'bg-red-900/50 text-red-400 border-red-800' : 'bg-yellow-900/50 text-yellow-400 border-yellow-800'}`}>SEVERITY: {selectedIncident.severity}/10</span>
                   {selectedIncident.analysis?.source === 'fallback' && (
                     <span className="text-[10px] px-2 py-0.5 rounded border font-mono bg-orange-950/50 text-orange-400 border-orange-800" title="AI was unavailable; classified by keyword rules">RULE-BASED TRIAGE</span>
                   )}
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded border border-slate-800 flex items-start gap-3">
                <MapPin className="w-5 h-5 text-blue-500 mt-1" />
                <div>
                  <div className="text-xs text-slate-500 font-mono">GEOLOCATION</div>
                  <div className="text-sm text-slate-200">{selectedIncident.location.address}</div>
                  {selectedIncident.location.approximate && (
                    <div className="mt-1 text-[10px] font-mono text-orange-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> LOCATION UNVERIFIED - PIN IS CITY CENTRE</div>
                  )}
                </div>
              </div>
              
              <button 
                  onClick={handleBroadcastAdvisory}
                  disabled={advisoryStatus !== ''}
                  className="w-full bg-cyan-900/30 hover:bg-cyan-900/80 border border-cyan-800 text-cyan-400 hover:text-white p-2 rounded transition-all flex items-center justify-center gap-2 text-xs font-mono font-bold disabled:opacity-50"
              >
                  {advisoryStatus === 'GENERATING...' || advisoryStatus === 'POSTING...' ? <Loader2 className="w-4 h-4 animate-spin"/> : <Megaphone className="w-4 h-4" />}
                  {advisoryStatus === '' ? "BROADCAST ADVISORY" : advisoryStatus}
              </button>

              {selectedIncident.breakdown && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-cyan-500 border-b border-slate-800 pb-1 font-mono">AI EVIDENCE BREAKDOWN</h4>
                  <div className="text-xs">
                    <span className="text-slate-500 block mb-1">SOURCE:</span>
                    <p className="text-slate-300 bg-slate-800/50 p-2 rounded border-l-2 border-cyan-500 italic">"{selectedIncident.breakdown.evidence_source || "N/A"}"</p>
                  </div>
                  {!!selectedIncident.breakdown.visual_clues?.length && (
                    <div className="text-xs">
                       <span className="text-slate-500 flex items-center gap-1 mb-1"><Eye className="w-3 h-3"/> VISUAL:</span>
                       <div className="flex flex-wrap gap-1">{selectedIncident.breakdown.visual_clues.map((c, i)=><span key={i} className="bg-slate-800 border border-slate-700 px-2 rounded-full">{c}</span>)}</div>
                    </div>
                  )}
                  {!!selectedIncident.breakdown.acoustics?.length && (
                    <div className="text-xs">
                       <span className="text-slate-500 flex items-center gap-1 mb-1"><Volume2 className="w-3 h-3"/> AUDIO:</span>
                       <div className="flex flex-wrap gap-1">{selectedIncident.breakdown.acoustics.map((s, i)=><span key={i} className="bg-slate-800 border border-slate-700 px-2 rounded-full">{s}</span>)}</div>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2 border-t border-slate-800">
                 <h4 className="text-xs font-bold text-slate-500 flex items-center gap-2 mb-3"><Truck className="w-3 h-3"/> DEPLOYMENT STATUS</h4>
                 
                 {selectedIncident.assignedUnit ? (
                   <div className="flex items-center justify-between bg-green-950/30 p-3 rounded border border-green-900/50 animate-in zoom-in duration-300">
                     <div>
                       <span className="text-green-400 font-mono text-sm font-bold block">{selectedIncident.assignedUnit.name}</span>
                       <span className="text-[10px] text-green-600 font-mono">{selectedIncident.assignedUnit.type} UNIT</span>
                     </div>
                     <div className="flex flex-col items-end gap-2">
                       <div className="flex items-center gap-1 text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded border border-green-500/50">
                          <CheckCircle2 className="w-3 h-3"/> DISPATCHED
                       </div>
                       <button onClick={handleResolve} className="text-[10px] bg-slate-800 text-slate-300 px-2 py-1 rounded border border-slate-600 hover:bg-green-800 hover:text-white transition font-bold">MARK RESOLVED</button>
                     </div>
                   </div>
                 ) : (
                   <div className="space-y-2">
                     <p className="text-[10px] text-slate-400 font-mono mb-2">NEAREST ASSETS (1 PER TYPE):</p>
                     {suggestedUnits.length === 0 ? (
                       <div className="text-xs text-slate-500 italic p-2 border border-slate-800 rounded bg-slate-900/50">No idle units available nearby.</div>
                     ) : (
                       suggestedUnits.map(unit => (
                         <div key={unit._id} className="flex items-center justify-between bg-slate-800/50 p-2 rounded border border-slate-700 hover:border-cyan-500 transition">
                            <div className="flex items-center gap-3">
                               <div className={`p-1.5 rounded-full ${unit.type === 'FIRE' ? 'bg-red-900/50 text-red-500' : unit.type === 'MEDICAL' ? 'bg-green-900/50 text-green-500' : 'bg-blue-900/50 text-blue-500'}`}>
                                  {unit.type === 'FIRE' ? <Flame className="w-3 h-3"/> : unit.type === 'MEDICAL' ? <Stethoscope className="w-3 h-3"/> : <Shield className="w-3 h-3"/>}
                               </div>
                               <div>
                                 <div className="text-xs font-bold text-white">{unit.name}</div>
                                 <div className="text-[10px] text-slate-500">{unit.distanceKm} km away</div>
                               </div>
                            </div>
                            <button onClick={() => handleDeploy(unit._id)} className="text-[10px] bg-cyan-900 text-cyan-400 px-3 py-1.5 rounded border border-cyan-700 hover:bg-cyan-600 hover:text-white transition font-bold">DEPLOY</button>
                         </div>
                       ))
                     )}
                   </div>
                 )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
