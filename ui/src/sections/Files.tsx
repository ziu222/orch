import { useEffect, useMemo, useState } from 'react';
import type { UiFile, UiState } from '../api.ts';
import { parseDiff } from '../diff.ts';
import type { Actions } from '../useOrch.ts';

interface Dir { name: string; dirs: Map<string, Dir>; files: UiFile[] }
type Mode = 'all' | 'changed' | 'read';

const STATE_VI = { A: 'Thêm mới', M: 'Đã sửa', R: 'Chỉ được đọc', '': 'Không đổi' } as const;
const MARK_VI = { A: 'thêm', M: 'sửa', R: 'chỉ đọc', '': 'không đổi' } as const;
const changed = (d: Dir): number => d.files.filter(f => f.status === 'A' || f.status === 'M').length + [...d.dirs.values()].reduce((s, x) => s + changed(x), 0);

function toTree(files: UiFile[]): Dir {
  const root: Dir = { name: '', dirs: new Map(), files: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    let d = root;
    for (const p of parts.slice(0, -1)) {
      if (!d.dirs.has(p)) d.dirs.set(p, { name: p, dirs: new Map(), files: [] });
      d = d.dirs.get(p)!;
    }
    d.files.push(f);
  }
  return root;
}

function FileRow({ file, code, current, onPick }: { file: UiFile; code: (task: string) => string; current: boolean; onPick(): void }) {
  const tags = [...new Set(file.by.map(b => `${b.task} ${code(b.task)}`))];
  return (
    <li>
      <button type="button" className={`frow${file.status ? '' : ' quiet'}`} aria-current={current} onClick={onPick}>
        <span className={`fs ${file.status ? `fs-${file.status}` : 'fs-none'}`} aria-label={MARK_VI[file.status]}>{file.status}</span>
        <span className="fn">{file.path.split('/').pop()}</span>
        <span className="who">
          {tags.slice(0, 2).map(t => <span key={t} className="tk">{t}</span>)}
          {tags.length > 2 && <span className="tk more">+{tags.length - 2}</span>}
        </span>
      </button>
    </li>
  );
}

function Branch({ dir, code, sel, onPick }: { dir: Dir; code: (task: string) => string; sel: string | null; onPick(p: string): void }) {
  const dirs = [...dir.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
  const files = [...dir.files].sort((a, b) => a.path.localeCompare(b.path));
  return (
    <ul>
      {dirs.map(d => (
        <li key={d.name}>
          <details open>
            <summary>{d.name}/{changed(d) > 0 && <span className="cnt">{changed(d)} đổi</span>}</summary>
            <Branch dir={d} code={code} sel={sel} onPick={onPick} />
          </details>
        </li>
      ))}
      {files.map(f => <FileRow key={f.path} file={f} code={code} current={sel === f.path} onPick={() => onPick(f.path)} />)}
    </ul>
  );
}

function Diff({ text }: { text: string }) {
  const lines = parseDiff(text);
  if (!lines.length) return null;
  return (
    <div className="diff" role="region" aria-label="Thay đổi trong file">
      {lines.map((l, i) => <div key={i} className={l.kind}>{l.text}</div>)}
    </div>
  );
}

export function Files({ state, actions, onOpen }: { state: UiState; actions: Actions; onOpen(id: string): void }) {
  const [mode, setMode] = useState<Mode>('all');
  const [task, setTask] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [diff, setDiff] = useState('');
  const code = (id: string) => state.vendors.find(v => v.id === state.tasks.find(t => t.id === id)?.vendor)?.code ?? '??';

  const shown = useMemo(() => state.files.filter(f => {
    if (mode === 'changed' && f.status !== 'A' && f.status !== 'M') return false;
    if (mode === 'read' && !f.by.some(b => /đọc/.test(b.act))) return false;
    return !task || f.by.some(b => b.task === task);
  }), [state.files, mode, task]);
  const tree = useMemo(() => toTree(shown), [shown]);
  const taskIds = [...new Set(state.files.flatMap(f => f.by.map(b => b.task)))].sort();
  const file = state.files.find(f => f.path === sel) ?? null;
  const writer = file?.by.find(b => /tạo mới|sửa/.test(b.act));

  useEffect(() => {
    let live = true;
    setDiff('');
    if (file && writer) void actions.diff(writer.task, file.path).then(t => { if (live) setDiff(t); });
    return () => { live = false; };
    // the diff is fetched per selected file and writer, not on every poll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.path, writer?.task]);

  return (
    <section className="panel on" role="tabpanel" aria-labelledby="t-files">
      <p className="note">
        Cây thư mục của repo đang làm. Mỗi file ghi task nào, agent nào đã đọc hoặc sửa nó. orch lấy từ <span className="mono">git</span> trong
        worktree của từng task và từ phần <span className="mono">files</span> trong report.json.
      </p>
      <div className="toolbar">
        <div className="seg" role="radiogroup" aria-label="Lọc file">
          {([['all', 'Tất cả'], ['changed', 'Có thay đổi'], ['read', 'Bot đã đọc']] as const).map(([v, label]) => (
            <label key={v}><input type="radio" name="ff" value={v} checked={mode === v} onChange={() => setMode(v)} /><span>{label}</span></label>
          ))}
        </div>
        <label htmlFor="ftask" className="sr">Lọc theo task</label>
        <select id="ftask" value={task} onChange={e => setTask(e.target.value)}>
          <option value="">Mọi task</option>
          {taskIds.map(id => <option key={id}>{id}</option>)}
        </select>
        <span className="legend">
          <span><span className="fs fs-A">A</span>thêm</span><span><span className="fs fs-M">M</span>sửa</span><span><span className="fs fs-R">R</span>chỉ đọc</span>
        </span>
      </div>
      <div className="files">
        <section className="box" aria-labelledby="h-tree">
          <header><h2 id="h-tree">{state.root.split(/[\\/]/).filter(Boolean).pop()}</h2><span className="hint mono">{state.files.filter(f => f.status === 'A' || f.status === 'M').length} file đổi</span></header>
          <div className="tree">
            {shown.length ? <Branch dir={tree} code={code} sel={sel} onPick={setSel} /> : <p className="hand empty" style={{ padding: 8 }}>Không có file nào khớp bộ lọc.</p>}
          </div>
        </section>
        <section className="box" aria-labelledby="h-file">
          <header><h2 id="h-file">File</h2></header>
          <div className="fdetail">
            {!file ? <p className="note">Chọn một file ở cây bên trái.</p> : (
              <>
                <h3>{file.path}</h3>
                <span className="state">{STATE_VI[file.status]}</span>
                {file.by.length ? (
                  <ul className="touch">
                    {file.by.map((b, i) => (
                      <li key={i}>
                        <span className="vm">{code(b.task)}</span>
                        <button type="button" className="chip" onClick={() => onOpen(b.task)}>{b.task}</button>
                        <span className="act">{state.vendors.find(v => v.id === b.vendor)?.name ?? b.vendor} · {b.act}</span>
                        <span className="delta">{b.delta ?? ''}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="note" style={{ margin: '12px 0' }}>Chưa task nào đụng tới file này.</p>}
                <Diff text={diff} />
              </>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
