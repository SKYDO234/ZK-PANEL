import test from 'node:test';
import assert from 'node:assert/strict';
import { Duplex } from 'node:stream';
import { consoleInput, sendConsoleCommand } from '../server/console-command.js';

function fakeContainer(options: { running?: boolean; open?: boolean; fail?: boolean } = {}) {
  let received = '', attaches = 0;
  const input = new Duplex({
    read() {},
    write(chunk, _encoding, callback) { received += chunk.toString(); callback(); },
    final(callback) { callback(); setImmediate(() => this.push(null)); },
  });
  return {
    inspect: async () => ({ State: { Running: options.running ?? true }, Config: { OpenStdin: options.open ?? true } }),
    attach: async () => {
      attaches++;
      if (options.fail) throw new Error('connection refused');
      return input;
    },
    get received() { return received; },
    get attaches() { return attaches; },
  };
}
test('Minecraft commands go once to the server input with an optional slash removed', async () => {
  for (const line of ['say hello world', '/say hello world']) {
    const c = fakeContainer();
    const output = await sendConsoleCommand(c, line, true);
    assert.equal(c.received, 'say hello world\n');
    assert.equal(c.attaches, 1);
    assert.match(output, /Check the console output/);
  }
});
test('other containers preserve shell input', async () => {
  const c = fakeContainer();
  await sendConsoleCommand(c, '/usr/bin/env', false);
  assert.equal(c.received, '/usr/bin/env\n');
});
test('rejects multiline, terminal control, empty and oversized commands before connecting', async () => {
  for (const line of ['help\nstop', 'help\rstop', '\x1b[2J', '/', 'a'.repeat(2001)]) {
    const c = fakeContainer();
    await assert.rejects(sendConsoleCommand(c, line, true));
    assert.equal(c.attaches, 0);
  }
  assert.equal(consoleInput('say नमस्ते', true), 'say नमस्ते');
});
test('does not attach to a stopped container or one without stdin', async () => {
  const stopped = fakeContainer({ running: false });
  await assert.rejects(sendConsoleCommand(stopped, 'list', true), /Start this deployment/);
  const noStdin = fakeContainer({ open: false });
  await assert.rejects(sendConsoleCommand(noStdin, 'list', true), /persistent console input/);
  assert.equal(stopped.attaches + noStdin.attaches, 0);
});
test('attach failure is returned and is never retried through another channel', async () => {
  const c = fakeContainer({ fail: true });
  await assert.rejects(sendConsoleCommand(c, 'stop', true), /connection refused/);
  assert.equal(c.attaches, 1);
});
