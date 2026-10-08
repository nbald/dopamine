/**
 * Phase 0 tests (no framework). Run: npx tsx src/server/services/pty-handle.test.ts
 *
 * Exercises the pure helpers behind PtyHandle — readLinesFromBuffer, scanBracketPasteMode,
 * computeIsBusy — without needing a real PTY (the type-only node-pty/ws imports are erased).
 */
import assert from 'node:assert';
import { readLinesFromBuffer, scanBracketPasteMode, computeIsBusy } from './pty-handle.js';

let passed = 0;
function check(name: string, cond: boolean): void {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok  ${name}`);
}

async function main(): Promise<void> {
  console.log('readLinesFromBuffer:');
  {
    const r = await readLinesFromBuffer('line1\r\nline2\r\nline3\r\n', 80, 24, 0, 10);
    const text = r.lines.join('|');
    check('contains all three lines', text.includes('line1') && text.includes('line2') && text.includes('line3'));
  }
  {
    const r = await readLinesFromBuffer('a\r\nb\r\nc\r\nd\r\ne\r\n', 80, 24, 0, 2);
    const nonEmpty = r.lines.filter((l) => l.length > 0);
    check('max=2 returns only the most recent non-empty lines', nonEmpty.length <= 2 && nonEmpty.includes('e') && !r.lines.includes('a'));
  }
  {
    const r = await readLinesFromBuffer('\x1b[31mred\x1b[0m\r\n', 80, 24, 0, 5);
    check('strips ANSI color codes', r.lines.some((l) => l.includes('red')) && !r.lines.some((l) => l.includes('\x1b')));
  }
  {
    // CR returns to column 0, "new" overwrites "old" → only final screen state remains
    const r = await readLinesFromBuffer('old\rnew\r\n', 80, 24, 0, 5);
    check('CR overwrite reflects final screen, not raw bytes', r.lines.some((l) => l.startsWith('new')) && !r.lines.some((l) => l === 'old'));
  }
  {
    const r = await readLinesFromBuffer('', 80, 24, 0, 10);
    check('empty buffer → no crash, empty-ish result', Array.isArray(r.lines));
  }

  console.log('scanBracketPasteMode:');
  {
    let st = scanBracketPasteMode(false, '', 'foo\x1b[?2004hbar');
    check('enable (2004h) detected', st.active === true);
    st = scanBracketPasteMode(st.active, st.carry, 'baz\x1b[?2004lqux');
    check('disable (2004l) detected', st.active === false);
  }
  {
    let st = scanBracketPasteMode(false, '', 'abc\x1b[?20');   // sequence split here
    check('partial sequence does not yet enable', st.active === false);
    st = scanBracketPasteMode(st.active, st.carry, '04hdef');   // remainder arrives next chunk
    check('split sequence reconstructed across chunks', st.active === true);
  }
  {
    const st = scanBracketPasteMode(false, '', '\x1b[?2004h...\x1b[?2004l');
    check('latest toggle within one chunk wins (disabled)', st.active === false);
  }
  {
    const st = scanBracketPasteMode(true, '', 'no toggles here');
    check('no toggle → state preserved', st.active === true);
  }

  console.log('computeIsBusy:');
  {
    const t = 10_000;
    check('title changed 200ms ago → busy', computeIsBusy(t, t + 200) === true);
    check('title stable 1500ms → idle', computeIsBusy(t, t + 1500) === false);
    check('title gap exactly under window (999ms) → busy', computeIsBusy(t, t + 999) === true);
    check('no title ever seen → idle', computeIsBusy(0, t) === false);
  }

  console.log(`\n${passed} checks passed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
