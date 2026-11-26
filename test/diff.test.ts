import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiff } from '../ui/src/diff.ts';

const SAMPLE = [
  'diff --git a/src/a.ts b/src/a.ts',
  'new file mode 100644',
  'index 0000000..e69de29',
  '--- /dev/null',
  '+++ b/src/a.ts',
  '@@ -0,0 +1,3 @@',
  '+const a = 1',
  ' context line',
  '-const old = 2',
  '\\ No newline at end of file',
].join('\n');

test('git header lines are dropped; hunk, added, removed and context lines are kept', () => {
  assert.deepEqual(parseDiff(SAMPLE), [
    { kind: 'hd', text: '@@ -0,0 +1,3 @@' },
    { kind: 'add', text: 'const a = 1' },
    { kind: 'ctx', text: 'context line' },
    { kind: 'del', text: 'const old = 2' },
  ]);
});

test('renames, mode changes and deletions leave no stray header text', () => {
  const t = ['diff --git a/x b/y', 'similarity index 90%', 'rename from x', 'rename to y', 'old mode 100644', 'new mode 100755', 'deleted file mode 100644', '@@ -1 +1 @@', '-a', '+b'].join('\n');
  assert.deepEqual(parseDiff(t).map(l => l.kind), ['hd', 'del', 'add']);
});

test('empty or blank input gives no lines', () => {
  assert.deepEqual(parseDiff(''), []);
  assert.deepEqual(parseDiff('  \n'), []);
});
