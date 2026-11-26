import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ChatMsg, UiState } from '../api.ts';
import type { Actions } from '../useOrch.ts';
import { fmtK } from '../format.ts';

type LocalMsg = ChatMsg & { out?: string };

function WithTaskChips({ text, known, onOpen }: { text: string; known: Set<string>; onOpen(id: string): void }) {
  return (
    <>
      {text.split(/(T-\d{3})/).map((part, i) =>
        known.has(part) ? <button key={i} type="button" className="chip" onClick={() => onOpen(part)}>{part}</button> : part)}
    </>
  );
}

const HELP = 'Gõ yêu cầu để orch lập kế hoạch và chạy. Lệnh: /stats xem usage, /stop dừng lượt chạy, /cancel T-001 hủy task đang chờ.';

export function Chat({ state, actions, onOpen }: { state: UiState; actions: Actions; onOpen(id: string): void }) {
  const [local, setLocal] = useState<LocalMsg[]>([]);
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const known = new Set(state.tasks.map(t => t.id));
  const msgs: LocalMsg[] = [...state.chat, ...local].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const tell = (m: string, out?: string) => setLocal(l => [...l, { ts: new Date().toISOString(), who: 'orch', text: m, ...(out ? { out } : {}) }]);

  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [msgs.length]);

  const send = async (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setText('');
    if (t === '/stats') {
      tell('Usage hiện tại:', state.vendors.map(v =>
        `${v.name.padEnd(12)} 5g ${fmtK(v.tokens5h).padStart(7)}   tuần ${fmtK(v.tokensWeek).padStart(7)}   chạy ${v.running.length}/${v.maxParallel}`).join('\n'));
    } else if (t === '/stop') await actions.stop();
    else if (t.startsWith('/cancel')) {
      const id = /T-\d{3}/.exec(t)?.[0];
      if (id) await actions.cancel(id); else tell('Ghi rõ task cần hủy, ví dụ /cancel T-014.');
    } else if (t.startsWith('/')) tell(HELP);
    else await actions.run(t);
  };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); void send(text); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(text); } };

  return (
    <section className="chat box" aria-label="Chat với orch">
      <header><h2>Chat</h2><span className="hint">Enter để gửi · Shift+Enter xuống dòng</span></header>
      <div className="msgs" ref={box} aria-live="polite">
        {msgs.length === 0 && <div className="m"><span className="who">orch</span>{HELP}</div>}
        {msgs.map((m, i) => (
          <div key={i} className={`m${m.who === 'me' ? ' me' : ''}`}>
            {m.who === 'orch' && <span className="who">orch</span>}
            <WithTaskChips text={m.text} known={known} onOpen={onOpen} />
            {m.out && <pre className="out">{m.out}</pre>}
          </div>
        ))}
      </div>
      <form className="compose" onSubmit={onSubmit}>
        <div className="cmds">
          {['/stats', '/stop', '/cancel T-'].map(c => <button key={c} type="button" onClick={() => setText(c)}>{c.trim()}</button>)}
        </div>
        <div className="row">
          <label htmlFor="chat-input" className="sr">Tin nhắn cho orch</label>
          <textarea id="chat-input" value={text} onChange={e => setText(e.target.value)} onKeyDown={onKey}
            placeholder={state.running ? 'Đang chạy… gõ /stop để dừng' : 'Nhắn cho orch hoặc gõ /lệnh…'} />
          <button className="btn" type="submit" disabled={state.running && !text.startsWith('/')}>
            Gửi <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M2 8h11M9 4l4 4-4 4" /></svg>
          </button>
        </div>
      </form>
    </section>
  );
}
