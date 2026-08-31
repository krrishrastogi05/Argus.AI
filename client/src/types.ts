export type Role = 'citizen' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export type UnitType = 'POLICE' | 'FIRE' | 'MEDICAL';

export interface Unit {
  _id: string;
  name: string;
  type: UnitType;
  status: 'IDLE' | 'BUSY';
  coordinates: [number, number];
  distanceKm?: number;
}

export type IncidentStatus = 'PENDING' | 'DISPATCHED' | 'RESOLVED';

export interface Incident {
  _id: string;
  type: string;
  description: string;
  severity: number;
  status: IncidentStatus;
  channel: 'SOCIAL' | 'HELPLINE';
  location: { address: string; coordinates: [number, number]; approximate?: boolean };
  breakdown?: {
    evidence_source?: string;
    acoustics?: string[];
    visual_clues?: string[];
    logistics_needed?: string[];
  };
  action_plan?: string;
  analysis?: { source: 'model' | 'fallback'; attempts: number; latencyMs: number };
  assignedUnit: Unit | null;
  createdAt: string;
}

// What a citizen sees of their own report.
export interface Report {
  id: string;
  channel: 'SOCIAL' | 'HELPLINE';
  type: string;
  severity: number;
  description: string;
  address: string;
  status: IncidentStatus;
  createdAt: string;
}

export interface Advisory {
  _id: string;
  message: string;
  author: string;
  createdAt: string;
}
