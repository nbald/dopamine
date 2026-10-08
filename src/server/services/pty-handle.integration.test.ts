/**
 * Phase 0/1 integration smoke test against a REAL PTY (no DB, no HTTP).
 * Validates the PtyHandle wiring the pure unit tests can't: constructor, onData
 * additions, and readLines over a live ring buffer.
 *
 * Run: npx tsx src/server/services/pty-handle.integration.test.ts
 */
import assert from 'node:assert';
import * as pty from 'node-pty';
import { PtyHandle } from './pty-handle.js';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const proc = pty.spawn('bash', ['--norc', '--noprofile'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    env: { ...(process.env as Record<string, string>), PS1: '$ ' },
  });
  const h = new PtyHandle(999_999, proc);

  await sleep(200); // let the shell start
  h.write('echo hello_marker_42\r');
  await sleep(500); // let it echo + run

  const out = (await h.readLines(0, 100)).lines.join('\n');
  assert.ok(out.includes('hello_marker_42'), `readLines should contain the echoed marker; got:\n${out}`);
  assert.ok(h.totalBytesWritten > 0, 'totalBytesWritten should be > 0 after output');
  assert.strictEqual(h.isBusy(), false, 'a plain shell echo must not animate the title → not busy');

  console.log('  ok  real PTY: readLines captured the echo output');
  console.log('  ok  real PTY: totalBytesWritten =', h.totalBytesWritten);
  console.log('  ok  real PTY: isBusy=false for a plain shell');

  h.destroy();
  console.log('\nintegration smoke test passed.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
