import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readProperty, updateProperties } from '../src/lib/minecraft-properties';

test('Minecraft properties preserve comments, unknown keys, CRLF and duplicate managed keys', () => {
  const source = '# World settings\r\nmotd=Old\r\ncustom=value=kept\r\nmax-players: 12\r\nmax-players=15\r\n';
  assert.equal(readProperty(source, 'max-players'), '15');
  const updated = updateProperties(source, { 'max-players': '30', difficulty: 'hard' });
  assert.equal(
    updated,
    '# World settings\r\nmotd=Old\r\ncustom=value=kept\r\nmax-players=30\r\nmax-players=30\r\ndifficulty=hard\r\n',
  );
  assert.equal(readProperty(updated, 'difficulty'), 'hard');
});

test('updating existing keys leaves the rest of the file unchanged', () => {
  const source = '! comment\nlevel-seed=abc\\=def\nmotd=Hello\n';
  assert.equal(
    updateProperties(source, { motd: 'New world' }),
    '! comment\nlevel-seed=abc\\=def\nmotd=New world\n',
  );
  assert.equal(readProperty(source, 'pvp'), undefined);
});
