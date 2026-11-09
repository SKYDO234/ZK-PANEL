import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanConsoleText } from '../src/lib/console-text.js';

test('console removes Docker timestamps and terminal formatting without removing the Minecraft time', () => {
  const input = '2026-11-09T10:35:49.473123456Z \x1b[0m>\x1b[33;1m[10:35:49 WARN]: Server warning\x1b[0m\r';
  assert.equal(cleanConsoleText(input), '>[10:35:49 WARN]: Server warning');
  assert.equal(cleanConsoleText('\x1b]0;my title\x07[10:12:00 INFO]: Ready'), '[10:12:00 INFO]: Ready');
  assert.equal(cleanConsoleText('Normal output: 2026-11-09T10:35:49Z value'), 'Normal output: 2026-11-09T10:35:49Z value');
});
