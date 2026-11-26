import { useState } from 'react';
import type { Vendor } from '../api.ts';
import type { Orch } from '../useOrch.ts';
import { Chat } from '../components/Chat.tsx';
import { Detail } from '../components/Detail.tsx';
import { Graph } from '../components/Graph.tsx';
import { Margin } from '../components/Margin.tsx';
import { Tally } from '../components/Tally.tsx';
import { Vendors } from '../components/Vendors.tsx';

export function Workspace({ orch, selected, onSelect }: { orch: Orch; selected: string | null; onSelect(id: string | null): void }) {
  const { state, actions } = orch;
  const [filter, setFilter] = useState<Vendor | null>(null);
  const task = state.tasks.find(t => t.id === selected) ?? null;
  return (
    <section className="panel on" role="tabpanel" aria-labelledby="t-workspace">
      <h2 className="sr">Tổng kết</h2>
      <Tally state={state} />
      <h2 className="sr">Hạn mức và hàng đợi theo hãng</h2>
      <Vendors vendors={state.vendors} now={Date.parse(state.now)} filter={filter} onFilter={setFilter} />
      <div className={`work${task ? ' has-detail' : ''}`}>
        <Chat state={state} actions={actions} onOpen={onSelect} />
        <Graph tasks={state.tasks} vendors={state.vendors} selected={selected} filter={filter} onSelect={onSelect} />
        {task
          ? <Detail task={task} vendor={state.vendors.find(v => v.id === task.vendor)} running={state.running} actions={actions} onClose={() => onSelect(null)} />
          : <Margin state={state} actions={actions} onOpen={onSelect} />}
      </div>
    </section>
  );
}
