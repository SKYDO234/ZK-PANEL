import test from 'node:test';
import assert from 'node:assert/strict';
import { selectLogLines } from '../server/docker-runtime.js';

test('Docker log cursor keeps nanosecond lines and repeated timestamps', () => {
  const first = selectLogLines(
    '2026-01-01T00:00:01.100000001Z first\n2026-01-01T00:00:01.100000001Z second\n',
  );
  assert.deepEqual(first.lines, ['first', 'second']);
  const next = selectLogLines(
    '2026-01-01T00:00:01.100000001Z first\n2026-01-01T00:00:01.100000001Z second\n2026-01-01T00:00:01.100000001Z third\n2026-01-01T00:00:01.200000000Z fourth\n',
    first.cursor,
  );
  assert.deepEqual(next.lines, ['third', 'fourth']);
  assert.deepEqual(selectLogLines('2026-01-01T00:00:01.200000000Z fourth\n', next.cursor).lines, []);
});
test('Docker log cursor accepts timestamps without fractional seconds', () => {
  const first = selectLogLines('2026-01-01T00:00:01Z hello\n');
  assert.equal(first.cursor?.timestamp, '2026-01-01T00:00:01.000000000Z');
  assert.deepEqual(selectLogLines('2026-01-01T00:00:01Z hello\n', first.cursor).lines, []);
});
test('continuation lines under a Docker timestamp are not repeatedly ingested', () => {
  const batch = '2026-01-01T00:00:01.100000001Z first\nsecond\nthird\n';
  const first = selectLogLines(batch);
  assert.deepEqual(first.lines, ['first', 'second', 'third']);
  assert.deepEqual(selectLogLines(batch, first.cursor).lines, []);
  const second = selectLogLines(batch + 'fourth\n2026-01-01T00:00:02.000000000Z next\nmore\n', first.cursor);
  assert.deepEqual(second.lines, ['fourth', 'next', 'more']);
});
