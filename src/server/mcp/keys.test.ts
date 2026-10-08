/**
 * send_keys mapping tests (pure). Run: npx tsx src/server/mcp/keys.test.ts
 */
import assert from 'node:assert';
import { keyToBytes, keysToBytes } from './keys.js';

let passed = 0;
function check(name: string, cond: boolean): void {
  assert.ok(cond, `FAIL: ${name}`);
  passed++;
  console.log(`  ok  ${name}`);
}

// Named tokens (mirroring BottomBar.svelte)
check('Enter → CR', keyToBytes('Enter', false) === '\r');
check('Escape → ESC', keyToBytes('Escape', false) === '\x1b');
check('Tab → HT', keyToBytes('Tab', false) === '\t');
check('Up → CSI A (not DECCKM)', keyToBytes('Up', false) === '\x1b[A');
check('ArrowDown alias → CSI B', keyToBytes('ArrowDown', false) === '\x1b[B');
check('ShiftTab → CSI Z', keyToBytes('ShiftTab', false) === '\x1b[Z');
check('PageUp → CSI 5~', keyToBytes('PageUp', false) === '\x1b[5~');
check('Backspace → DEL', keyToBytes('Backspace', false) === '\x7f');
check('token is case-insensitive', keyToBytes('eScApE', false) === '\x1b');

// Ctrl combos
check('Ctrl+C → 0x03', keyToBytes('Ctrl+C', false) === '\x03');
check('Ctrl+c (lowercase) → 0x03', keyToBytes('Ctrl+c', false) === '\x03');
check('Ctrl+U → 0x15', keyToBytes('Ctrl+U', false) === '\x15');

// Alt combos
check('Alt+f → ESC f', keyToBytes('Alt+f', false) === '\x1bf');

// Literal text + bracketed paste
check('literal text passes through (2004 off)', keyToBytes('hello world', false) === 'hello world');
check('text wrapped when 2004 active', keyToBytes('hi', true) === '\x1b[200~hi\x1b[201~');
check('named token NOT wrapped even when 2004 active', keyToBytes('Enter', true) === '\r');

// Unsupported
let threw = false;
try { keyToBytes('Ctrl+Tab', false); } catch { threw = true; }
check('Ctrl+Tab throws (unsupported)', threw);

// Sequence
check('keysToBytes joins tokens + text', keysToBytes(['echo hi', 'Enter'], false) === 'echo hi\r');
check('keysToBytes: Ctrl+C then Enter', keysToBytes(['Ctrl+C', 'Enter'], false) === '\x03\r');

console.log(`\n${passed} checks passed.`);
