import { useCallback, useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Defs } from './components/Defs.tsx';
import { baseName, hhmm, pad } from './format.ts';
import { usePrefs } from './prefs.ts';
import { Appearance } from './sections/Appearance.tsx';
import { Files } from './sections/Files.tsx';
import { Log } from './sections/Log.tsx';
import { Rules } from './sections/Rules.tsx';
import { Usage } from './sections/Usage.tsx';
import { Workspace } from './sections/Workspace.tsx';
import { useOrch } from './useOrch.ts';

const SECTIONS = [
  { id: 'workspace', label: 'Bàn làm việc', ext: 6, note: '--n1' },
  { id: 'files', label: 'Thư mục', ext: 4, note: '--n2' },
  { id: 'rules', label: 'Quy tắc', ext: 4, note: '--n3' },
  { id: 'usage', label: 'Usage', ext: 3, note: '--n4' },
  { id: 'log', label: 'Nhật ký', ext: 3, note: '--n5' },
  { id: 'theme', label: 'Giao diện', ext: 3, note: '--n6' },
] as const;
type Section = (typeof SECTIONS)[number]['id'];
const ids = SECTIONS.map(s => s.id) as string[];

function fromHash(): { section: Section; task: string | null } {
  const h = location.hash.slice(1);
  const task = /^task-(t-\d{3})$/i.exec(h);
  if (task) return { section: 'workspace', task: task[1].toUpperCase() };
  return { section: (ids.includes(h) ? h : 'workspace') as Section, task: null };
}

export function App() {
  const orch = useOrch();
  const [prefs, setPrefs] = usePrefs();
  const [route] = useState(fromHash);
  const [section, setSection] = useState<Section>(route.section);
  const [selected, setSelected] = useState<string | null>(route.task);
  const [clock, setClock] = useState(() => new Date());
  const { state, live, offline, notice, actions } = orch;

  useEffect(() => { const id = window.setInterval(() => setClock(new Date()), 30_000); return () => window.clearInterval(id); }, []);
  useEffect(() => {
    const onHash = () => { const r = fromHash(); setSection(r.section); if (r.task) setSelected(r.task); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((s: Section) => { setSection(s); history.replaceState(null, '', `#${s}`); }, []);
  // opening a task from anywhere (chat chip, file list, margin note) shows it on the workspace
  const open = useCallback((id: string | null) => { setSelected(id); if (id) go('workspace'); }, [go]);
  const onRailKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = SECTIONS[(ids.indexOf(section) + step + SECTIONS.length) % SECTIONS.length].id;
    go(next);
    requestAnimationFrame(() => document.getElementById(`t-${next}`)?.focus());
  };

  const cur = SECTIONS.find(s => s.id === section)!;
  const page = pad(ids.indexOf(section) + 1);

  return (
    <div className="book" data-section={section}>
      <main className="page">
        <span className="ribbon" aria-hidden="true" />
        <header className="phead">
          <h1>{cur.label}</h1>
          <span className="spacer" />
          <span className="field">Trang<span>{page}</span></span>
          <span className="field">Ngày<span>{pad(clock.getDate())}·{pad(clock.getMonth() + 1)}</span></span>
          <span className="field">Giờ<span className="num">{hhmm(clock)}</span></span>
          <span className="sample">{offline ? 'mất kết nối' : live ? `trực tiếp · ${baseName(state.root)}` : 'dữ liệu mẫu'}</span>
          {state.running && <button type="button" className="btn small ghost" onClick={() => void actions.stop()}>Dừng chạy</button>}
        </header>

        {section === 'workspace' && <Workspace orch={orch} selected={selected} onSelect={open} />}
        {section === 'files' && <Files state={state} actions={actions} onOpen={open} />}
        {section === 'rules' && <Rules state={state} actions={actions} />}
        {section === 'usage' && <Usage state={state} />}
        {section === 'log' && <Log state={state} />}
        {section === 'theme' && <Appearance prefs={prefs} set={setPrefs} />}

        {(notice || offline) && <div className="notice" role="alert">{offline ? 'Mất kết nối với orch ui. Đang giữ số liệu cuối cùng; sẽ tự nối lại.' : notice}</div>}
        <span className="folio">orch · {page}</span>
      </main>
      <nav className="rail" role="tablist" aria-label="Các phần" aria-orientation="vertical" onKeyDown={onRailKey}>
        {SECTIONS.map(s => (
          <button key={s.id} type="button" role="tab" id={`t-${s.id}`} className="tab" aria-selected={section === s.id}
            style={{ '--th': `var(${s.note})`, '--ext': s.ext } as CSSProperties} onClick={() => go(s.id)}>
            {s.label}
          </button>
        ))}
      </nav>
      <Defs />
    </div>
  );
}
