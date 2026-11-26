export type Vendor = 'claude' | 'codex' | 'gemini' | 'ollama';
export type TaskStatus = 'queued' | 'running' | 'review' | 'done' | 'failed' | 'blocked' | 'cancelled';
export type Role = 'plan' | 'scout' | 'implement' | 'review' | 'verify' | 'summarize';

export interface Task {
  id: string;
  title: string;
  role: Role;
  vendor: Vendor;
  deps: string[];
  status: TaskStatus;
  writesCode: boolean;
  reviewOf?: string;
  round?: number;
  worktree?: string;
  reason?: string;
}

export interface Report {
  summary: string;
  files: { path: string; lines?: string }[];
  verified: boolean;
  confidence: 'low' | 'med' | 'high';
  questions?: string[];
  findings?: string[];
}

export interface RunEvent {
  ts: string;
  task: string;
  vendor: Vendor;
  event: string;
  tokensIn: number;
  tokensOut: number;
  estimated?: boolean;
}

export interface VendorConfig {
  maxParallel: number;
  model?: string;
  pausedUntil?: string;
}

export interface Config {
  vendors: Record<Vendor, VendorConfig>;
  roles: Record<Role, { vendor: Vendor; fallback?: Vendor }>;
  maxReviewRounds: number;
  taskTimeoutSec: number;
}
