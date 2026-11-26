import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpRoot } from './helpers.ts';
import { createTask, readTask, readQuestions, appendQuestion, setStatus } from '../src/store.ts';
import { startServer, type OrchServer } from '../src/server.ts';

const FAKE = join(import.meta.dirname, 'fixtures', 'fake-orch.mjs');
const open: OrchServer[] = [];
afterEach(async () => { await Promise.all(open.splice(0).map(s => s.close())); });

async function boot() {
  const root = tmpRoot();
  const staticDir = join(root, 'dist');
  mkdirSync(staticDir);
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><html><head><title>t</title></head><body>hi</body></html>');
  writeFileSync(join(staticDir, 'app.js'), 'console.log(1)');
  const s = await startServer(root, { port: 0, staticDir, cliPath: FAKE });
  open.push(s);
  return { root, s };
}

const call = (s: OrchServer, method: string, path: string, opts: { body?: unknown; token?: string | null; headers?: Record<string, string> } = {}) =>
  fetch(s.url + path, {
    method,
    headers: { ...(opts.token === null ? {} : { 'x-orch-token': opts.token ?? s.token }), ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}), ...opts.headers },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });

const wait = async (cond: () => boolean | Promise<boolean>, ms = 5000) => {
  const t0 = Date.now();
  while (!(await cond())) { if (Date.now() - t0 > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 25)); }
};

test('the api needs the token, and a wrong Host header is refused (DNS rebinding)', async () => {
  const { s } = await boot();
  assert.equal((await call(s, 'GET', '/api/state', { token: null })).status, 403);
  assert.equal((await call(s, 'GET', '/api/state', { token: 'nope' })).status, 403);
  const ok = await call(s, 'GET', '/api/state');
  assert.equal(ok.status, 200);
  assert.ok(Array.isArray((await ok.json()).vendors));
  const status = await new Promise<number>(resolve => {
    const u = new URL(s.url);
    const r = request({ host: u.hostname, port: u.port, path: '/api/state', headers: { host: 'evil.example', 'x-orch-token': s.token } }, res => { res.resume(); resolve(res.statusCode!); });
    r.end();
  });
  assert.equal(status, 403);
});

test('writes from another origin are refused', async () => {
  const { s } = await boot();
  const r = await call(s, 'PUT', '/api/agents-md', { body: { text: 'x' }, headers: { origin: 'http://evil.example' } });
  assert.equal(r.status, 403);
});

test('serves index.html with the token injected, static files, and nothing outside the folder', async () => {
  const { s } = await boot();
  const html = await (await fetch(s.url + '/')).text();
  assert.match(html, new RegExp(`<meta name="orch-token" content="${s.token}">`));
  assert.equal(await (await fetch(s.url + '/app.js')).text(), 'console.log(1)');
  assert.equal((await fetch(s.url + '/..%2f..%2fpackage.json')).status, 404);
  assert.equal((await fetch(s.url + '/missing.css')).status, 404);
  assert.match(await (await fetch(s.url + '/some/route')).text(), /orch-token/); // SPA fallback
});

test('a missing UI build is explained, not a crash', async () => {
  const root = tmpRoot();
  const s = await startServer(root, { port: 0, staticDir: join(root, 'nope'), cliPath: FAKE });
  open.push(s);
  const r = await fetch(s.url + '/');
  assert.equal(r.status, 503);
  assert.match(await r.text(), /ui:build/);
});

test('POST /api/run starts one run, records the chat, and refuses a second while it runs', async () => {
  const { root, s } = await boot();
  const r = await call(s, 'POST', '/api/run', { body: { request: 'add a health route' } });
  assert.equal(r.status, 202);
  assert.equal((await (await call(s, 'GET', '/api/state')).json()).running, true);
  assert.equal((await call(s, 'POST', '/api/run', { body: { request: 'again' } })).status, 409);
  await wait(async () => !(await (await call(s, 'GET', '/api/state')).json()).running);
  const chat = (await (await call(s, 'GET', '/api/state')).json()).chat as { who: string; text: string }[];
  assert.equal(chat[0].who, 'me');
  assert.equal(chat[0].text, 'add a health route');
  assert.equal(chat.at(-1)!.who, 'orch');
  assert.match(chat.at(-1)!.text, /done=1/);
  assert.match(readFileSync(join(root, '.orch', 'fake-args.txt'), 'utf8'), /^run\nadd a health route$/);
});

test('an empty request is rejected', async () => {
  const { s } = await boot();
  assert.equal((await call(s, 'POST', '/api/run', { body: { request: '  ' } })).status, 400);
});

test('POST /api/answer records the answer, requeues the task and resumes the run', async () => {
  const { root, s } = await boot();
  createTask(root, { id: 'T-001', title: 't', role: 'scout', vendor: 'claude', deps: [], writesCode: false }, 'x');
  setStatus(root, 'T-001', 'blocked'); appendQuestion(root, 'T-001', 'Which mailer?');
  assert.equal((await call(s, 'POST', '/api/answer', { body: { task: 'T-099', text: 'x' } })).status, 404);
  assert.equal((await call(s, 'POST', '/api/answer', { body: { task: 'T-001', text: 'nodemailer' } })).status, 202);
  assert.deepEqual(readQuestions(root, 'T-001'), [{ q: 'Which mailer?', a: 'nodemailer' }]);
  assert.equal(readTask(root, 'T-001').status, 'queued');
  await wait(() => { try { return /^run\n--resume$/.test(readFileSync(join(root, '.orch', 'fake-args.txt'), 'utf8')); } catch { return false; } });
});

test('POST /api/cancel works on queued work only', async () => {
  const { root, s } = await boot();
  createTask(root, { id: 'T-001', title: 't', role: 'scout', vendor: 'claude', deps: [], writesCode: false }, 'x');
  createTask(root, { id: 'T-002', title: 't', role: 'scout', vendor: 'claude', deps: [], writesCode: false }, 'x');
  setStatus(root, 'T-002', 'running');
  assert.equal((await call(s, 'POST', '/api/cancel', { body: { task: 'T-001' } })).status, 200);
  assert.equal(readTask(root, 'T-001').status, 'cancelled');
  assert.equal((await call(s, 'POST', '/api/cancel', { body: { task: 'T-002' } })).status, 409);
});

test('POST /api/stop kills the run and marks running tasks cancelled', async () => {
  const { root, s } = await boot();
  createTask(root, { id: 'T-001', title: 't', role: 'scout', vendor: 'claude', deps: [], writesCode: false }, 'x');
  setStatus(root, 'T-001', 'running');
  await call(s, 'POST', '/api/run', { body: { request: 'sleep' } }); // fake-orch sleeps when asked
  assert.equal((await call(s, 'POST', '/api/stop')).status, 200);
  await wait(async () => !(await (await call(s, 'GET', '/api/state')).json()).running);
  assert.equal(readTask(root, 'T-001').status, 'cancelled');
});

test('PUT /api/agents-md writes the file; PUT /api/skills persists a toggle', async () => {
  const { root, s } = await boot();
  assert.equal((await call(s, 'PUT', '/api/agents-md', { body: { text: '# rules' } })).status, 200);
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), '# rules');
  mkdirSync(join(root, 'skills', 'code-review'), { recursive: true });
  writeFileSync(join(root, 'skills', 'code-review', 'SKILL.md'), '# review');
  assert.equal((await call(s, 'PUT', '/api/skills', { body: { name: 'code-review', vendor: 'claude', on: true } })).status, 200);
  const st = await (await call(s, 'GET', '/api/state')).json();
  assert.deepEqual(st.skills, [{ name: 'code-review', path: 'skills/code-review/SKILL.md', on: { claude: true } }]);
  assert.equal((await call(s, 'PUT', '/api/skills', { body: { name: '../x', vendor: 'claude', on: true } })).status, 400);
});

test('GET /api/diff validates its input', async () => {
  const { s } = await boot();
  assert.equal((await call(s, 'GET', '/api/diff?task=T-099&path=a.ts')).status, 400);
});

test('a token baked into index.html by an earlier build is replaced, not trusted', async () => {
  const root = tmpRoot();
  const staticDir = join(root, 'dist');
  mkdirSync(staticDir);
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><html><head><meta name="orch-token" content="stale0123"></head><body></body></html>');
  const s = await startServer(root, { port: 0, staticDir, cliPath: FAKE });
  open.push(s);
  const html = await (await fetch(s.url + '/')).text();
  assert.equal((html.match(/name="orch-token"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /stale0123/);
  assert.match(html, new RegExp(s.token));
});
