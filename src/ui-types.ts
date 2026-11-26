// Shapes shared by the orch server (src/state.ts) and the React console (ui/). Types only: no runtime imports.
import type { Report, Role, RunEvent, TaskStatus, Vendor } from './types.ts';

export interface UiVendor {
  id: Vendor;
  name: string;
  /** two-letter mark shown instead of a colour (CL, CX, AG, CP, OL) */
  code: string;
  local: boolean;
  model?: string;
  maxParallel: number;
  running: string[];
  waiting: { id: string; why: string }[];
  pausedUntil?: string;
  tokens5h: number;
  tokensWeek: number;
  tokensTotal: number;
  /** token totals per 15 minutes over the last 5 hours, oldest first (20 buckets) */
  hist: number[];
  /** present only when vendors.<id>.budget5h / budgetWeek are set in .orch/config.json */
  pct5h?: number;
  pctWeek?: number;
}

export interface UiTask {
  id: string;
  title: string;
  role: Role;
  vendor: Vendor;
  status: TaskStatus;
  deps: string[];
  writesCode: boolean;
  reviewOf?: string;
  round?: number;
  worktree?: string;
  reason?: string;
  tokensIn: number;
  tokensOut: number;
  secs: number;
  verified?: boolean;
  report: Report | null;
  question?: string;
}

export interface UiFile {
  path: string;
  /** A added, M modified, R only read by a worker, '' untouched */
  status: 'A' | 'M' | 'R' | '';
  by: { task: string; vendor: Vendor; act: string; delta?: string }[];
}

export interface ChatMsg {
  ts: string;
  who: 'me' | 'orch';
  text: string;
}

export interface UiSkill {
  name: string;
  path: string;
  /** per vendor: may this agent use the skill */
  on: Partial<Record<Vendor, boolean>>;
}

export interface UiState {
  root: string;
  now: string;
  /** an orch run started from the console is still going */
  running: boolean;
  vendors: UiVendor[];
  tasks: UiTask[];
  questions: { task: string; q: string }[];
  runs: RunEvent[];
  files: UiFile[];
  agentsMd: string;
  skills: UiSkill[];
  chat: ChatMsg[];
}
