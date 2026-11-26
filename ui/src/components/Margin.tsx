import { useState, type FormEvent } from 'react';
import type { UiState } from '../api.ts';
import type { Actions } from '../useOrch.ts';
import { hhmm } from '../format.ts';

function Note({ task, q, who, ago, actions, onOpen }: {
  task: string; q: string; who: string; ago: string; actions: Actions; onOpen(id: string): void;
}) {
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (t) { void actions.answer(task, t); setText(''); }
  };
  return (
    <article className="qnote">
      <header>
        <button type="button" className="chip" onClick={() => onOpen(task)}>{task}</button>
        <span>{who}{ago}</span>
      </header>
      <p className="hand">{q}</p>
      <form onSubmit={submit}>
        <label htmlFor={`ans-${task}`} className="sr">Trả lời {task}</label>
        <input id={`ans-${task}`} type="text" value={text} onChange={e => setText(e.target.value)} placeholder="Trả lời…" autoComplete="off" />
        <button className="btn small" type="submit">Gửi</button>
      </form>
    </article>
  );
}

/** question notes over the handwritten timeline */
export function Margin({ state, actions, onOpen }: { state: UiState; actions: Actions; onOpen(id: string): void }) {
  const now = Date.parse(state.now);
  return (
    <aside className="margin" aria-label="Ghi chú lề">
      <div>
        <h2>Câu hỏi chờ trả lời <span className="hint">{state.questions.length ? `${state.questions.length} câu` : ''}</span></h2>
        <div className="qnotes">
          {state.questions.length === 0 && <p className="hand empty">Không có câu hỏi nào đang chờ.</p>}
          {state.questions.map(({ task, q }) => {
            const t = state.tasks.find(x => x.id === task);
            const asked = [...state.runs].reverse().find(r => r.task === task && r.event === 'question');
            const mins = asked ? Math.max(1, Math.round((now - Date.parse(asked.ts)) / 60_000)) : 0;
            const vendor = state.vendors.find(v => v.id === t?.vendor)?.name ?? t?.vendor ?? '';
            return <Note key={task} task={task} q={q} who={vendor} ago={mins ? ` · ${mins} phút trước` : ''} actions={actions} onOpen={onOpen} />;
          })}
        </div>
      </div>
      <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <h2>Dòng thời gian</h2>
        <ol className="timeline">
          {state.runs.slice(-9).reverse().map((r, i) => (
            <li key={i}><time>{hhmm(r.ts)}</time><span className="hand">{r.task} {r.event}</span></li>
          ))}
          {state.runs.length === 0 && <li><span className="hand empty">Chưa có sự kiện nào.</span></li>}
        </ol>
      </div>
    </aside>
  );
}
