import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpRoot } from './helpers.ts';
import { listTasks } from '../src/store.ts';
import { planRequest } from '../src/planner.ts';
import type { RunOutcome } from '../src/runner.ts';

function fakePlanRun(planObj: unknown): (root: string, task: unknown) => Promise<RunOutcome> {
  const json = '```json\n' + JSON.stringify(planObj, null, 2) + '\n```';
  return async () => ({
    status: 'done',
    report: { summary: json, files: [], verified: true, confidence: 'high' },
    result: { text: json, tokensIn: 100, tokensOut: 50, rateLimited: false },
  });
}

test('planner output becomes tasks with mapped deps and cross-vendor review', async () => {
  const root = tmpRoot();
  const tasks = await planRequest(root, 'Add /health route', {
    run: fakePlanRun({
      tasks: [
        { key: 'scout-routes', title: 'Scout routes', role: 'scout', deps: [], writesCode: false, brief: 'Find router' },
        { key: 'impl-health', title: 'Implement /health', role: 'implement', deps: ['scout-routes'], writesCode: true, brief: 'Add route' },
        { key: 'review-health', title: 'Review /health', role: 'review', deps: ['impl-health'], writesCode: false, brief: 'Review diff' },
      ],
    }) as never,
  });

  assert.equal(tasks.length, 3);
  const [scout, impl, review] = tasks;
  assert.equal(scout.vendor, 'agy');
  assert.equal(impl.vendor, 'codex');
  assert.deepEqual(impl.deps, [scout.id]);
  assert.deepEqual(review.deps, [impl.id]);
  assert.equal(review.reviewOf, impl.id);
  assert.notEqual(review.vendor, impl.vendor);
});

test('cyclic plan writes no tasks', async () => {
  const root = tmpRoot();
  await assert.rejects(
    planRequest(root, 'Bad cyclic request', {
      run: fakePlanRun({
        tasks: [
          { key: 'a', title: 'A', role: 'scout', deps: ['b'], writesCode: false, brief: 'A' },
          { key: 'b', title: 'B', role: 'scout', deps: ['a'], writesCode: false, brief: 'B' },
        ],
      }) as never,
    }),
    /cycle/,
  );
  // only the planner task itself exists
  assert.equal(listTasks(root).length, 1);
  assert.equal(listTasks(root)[0].role, 'plan');
});

test('unknown dependency in plan writes no tasks', async () => {
  const root = tmpRoot();
  await assert.rejects(
    planRequest(root, 'Bad dep request', {
      run: fakePlanRun({
        tasks: [
          { key: 'a', title: 'A', role: 'scout', deps: ['missing'], writesCode: false, brief: 'A' },
        ],
      }) as never,
    }),
    /missing/,
  );
  assert.equal(listTasks(root).length, 1);
});
