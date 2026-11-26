// `orch ui`: serves the React console and a small JSON api over .orch/. Loopback only.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { answerTask, appendChat, cancelTask, setSkill, writeAgentsMd } from './actions.ts';
import { killTree } from './runner.ts';
import { buildState, readDiff } from './state.ts';
import { listTasks, readTask, setStatus } from './store.ts';
import type { Vendor } from './types.ts';

export interface OrchServer { url: string; token: string; close(): Promise<void> }
export interface ServerOptions { port?: number; staticDir?: string; cliPath?: string }

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
};
const VENDORS = new Set<string>(['claude', 'codex', 'agy', 'copilot', 'ollama']);
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'";

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function send(res: ServerResponse, status: number, body: string | object, type = 'application/json'): void {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': type.includes('charset') || !type.startsWith('text') ? type : `${type}; charset=utf-8`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': CSP });
  res.end(text);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 1_000_000) throw new HttpError(413, 'body too large');
    chunks.push(c as Buffer);
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch { throw new HttpError(400, 'body must be a JSON object'); }
}

const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${name} is required`);
  return v;
};

export async function startServer(root: string, opts: ServerOptions = {}): Promise<OrchServer> {
  const staticDir = resolve(opts.staticDir ?? join(import.meta.dirname, '..', 'ui', 'dist'));
  const cliPath = opts.cliPath ?? join(import.meta.dirname, 'cli.ts');
  const token = randomBytes(24).toString('hex');
  let port = 0;
  let child: ChildProcess | null = null;
  let stopped = false;

  const startRun = (args: string[]): void => {
    stopped = false;
    let tail = '';
    const c = spawn(process.execPath, [cliPath, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' });
    child = c;
    const collect = (d: string) => { tail = (tail + d).slice(-4000); };
    c.stdout!.setEncoding('utf8'); c.stderr!.setEncoding('utf8');
    c.stdout!.on('data', collect); c.stderr!.on('data', collect);
    const finish = (note: string) => { if (child === c) child = null; appendChat(root, 'orch', note); };
    c.on('error', e => finish(`Không chạy được orch: ${e.message}`));
    c.on('close', code => {
      const last = tail.trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' · ');
      if (stopped) finish('Đã dừng lượt chạy.');
      else finish(code === 0 || code === 1 && /done=/.test(last) ? `Xong. ${last}` : `Lượt chạy kết thúc với lỗi (mã ${code}): ${last || 'không có output'}`);
    });
  };

  const stopRun = (): void => {
    if (!child) throw new HttpError(409, 'no run in progress');
    stopped = true;
    killTree(child.pid);
    for (const t of listTasks(root)) if (t.status === 'running') setStatus(root, t.id, 'cancelled', { reason: 'stopped by user' });
  };

  const serveStatic = (pathname: string, res: ServerResponse): void => {
    if (!existsSync(join(staticDir, 'index.html'))) { send(res, 503, 'UI not built yet. Run: npm run ui:build', 'text/plain'); return; }
    let rel: string;
    try { rel = decodeURIComponent(pathname); } catch { send(res, 400, 'bad path', 'text/plain'); return; }
    if (rel.includes('\0')) { send(res, 400, 'bad path', 'text/plain'); return; }
    const file = resolve(join(staticDir, normalize(rel)));
    const inside = file === staticDir || file.startsWith(staticDir + sep);
    if (inside && existsSync(file) && statSync(file).isFile()) {
      const ext = extname(file);
      if (ext === '.html') { send(res, 200, injectToken(readFileSync(file, 'utf8')), TYPES['.html']); return; }
      res.writeHead(200, { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': ext === '.js' || ext === '.css' ? 'public, max-age=31536000, immutable' : 'no-store', 'content-security-policy': CSP });
      res.end(readFileSync(file));
      return;
    }
    if (extname(rel)) { send(res, 404, 'not found', 'text/plain'); return; }
    send(res, 200, injectToken(readFileSync(join(staticDir, 'index.html'), 'utf8')), TYPES['.html']); // single-page app routes
  };
  const injectToken = (html: string) => html.replace('</head>', `<meta name="orch-token" content="${token}"></head>`);

  const api = async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> => {
    const given = String(req.headers['x-orch-token'] ?? '');
    if (given.length !== token.length || !timingSafeEqual(Buffer.from(given), Buffer.from(token))) throw new HttpError(403, 'bad token');
    const m = req.method ?? 'GET';
    if (m !== 'GET' && req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw new HttpError(403, 'cross-origin write refused');
    const route = `${m} ${url.pathname}`;
    const exists = (id: string) => { try { readTask(root, id); return true; } catch { return false; } };

    if (route === 'GET /api/state') return send(res, 200, buildState(root, Date.now(), { running: !!child }));
    if (route === 'GET /api/diff') {
      try { return send(res, 200, readDiff(root, url.searchParams.get('task') ?? '', url.searchParams.get('path') ?? ''), 'text/plain'); }
      catch (e) { throw new HttpError(400, (e as Error).message); }
    }
    if (route === 'POST /api/run') {
      const request = str((await readJson(req)).request, 'request').trim();
      if (child) throw new HttpError(409, 'a run is already in progress');
      appendChat(root, 'me', request);
      startRun(['run', request]);
      return send(res, 202, { started: true });
    }
    if (route === 'POST /api/answer') {
      const b = await readJson(req);
      const task = str(b.task, 'task'), text = str(b.text, 'text').trim();
      if (!exists(task)) throw new HttpError(404, `unknown task ${task}`);
      try { answerTask(root, task, text); } catch (e) { throw new HttpError(409, (e as Error).message); }
      appendChat(root, 'me', `Trả lời ${task}: ${text}`);
      if (!child) startRun(['run', '--resume']);
      return send(res, 202, { requeued: task, resumed: !!child });
    }
    if (route === 'POST /api/cancel') {
      const task = str((await readJson(req)).task, 'task');
      if (!exists(task)) throw new HttpError(404, `unknown task ${task}`);
      try { cancelTask(root, task); } catch (e) { throw new HttpError(409, (e as Error).message); }
      return send(res, 200, { cancelled: task });
    }
    if (route === 'POST /api/stop') { stopRun(); return send(res, 200, { stopping: true }); }
    if (route === 'PUT /api/agents-md') {
      try { writeAgentsMd(root, String((await readJson(req)).text ?? '')); } catch (e) { throw new HttpError(400, (e as Error).message); }
      return send(res, 200, { saved: true });
    }
    if (route === 'PUT /api/skills') {
      const b = await readJson(req);
      const vendor = str(b.vendor, 'vendor');
      if (!VENDORS.has(vendor) || typeof b.on !== 'boolean') throw new HttpError(400, 'vendor and on are required');
      try { setSkill(root, str(b.name, 'name'), vendor as Vendor, b.on); } catch (e) { throw new HttpError(400, (e as Error).message); }
      return send(res, 200, { saved: true });
    }
    throw new HttpError(404, 'no such endpoint');
  };

  const server = createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? '';
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) throw new HttpError(403, 'host not allowed');
      const url = new URL(req.url ?? '/', `http://${host}`);
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(url.pathname, res);
      else throw new HttpError(405, 'method not allowed');
    } catch (e) {
      if (res.headersSent) { res.end(); return; }
      if (e instanceof HttpError) send(res, e.status, { error: e.message });
      else send(res, 500, { error: (e as Error).message });
    }
  });
  await new Promise<void>((ok, fail) => { server.once('error', fail); server.listen(opts.port ?? 0, '127.0.0.1', ok); });
  port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}`,
    token,
    close: () => new Promise<void>(done => {
      if (child) { killTree(child.pid); child = null; }
      server.closeAllConnections();
      server.close(() => done());
    }),
  };
}
