/**
 * send_keys vocabulary → byte sequences. Mirrors the mobile key bar (BottomBar.svelte),
 * already proven against Claude Code / Codex.
 *
 * Each element of `keys` is either a named token (control sequence) or literal text.
 * Literal text is wrapped in bracketed paste (\x1b[200~ … \x1b[201~) ONLY when the app has
 * DEC mode 2004 enabled (passed in via bracketPasteActive); named tokens are never wrapped.
 * Arrows use the CSI form (\x1b[A …), validated by the mobile bar — DEC­CKM is not a concern.
 */
const NAMED: Record<string, string> = {
  enter: '\r',
  return: '\r',
  escape: '\x1b',
  esc: '\x1b',
  tab: '\t',
  shifttab: '\x1b[Z',
  backtab: '\x1b[Z',
  up: '\x1b[A',
  arrowup: '\x1b[A',
  down: '\x1b[B',
  arrowdown: '\x1b[B',
  right: '\x1b[C',
  arrowright: '\x1b[C',
  left: '\x1b[D',
  arrowleft: '\x1b[D',
  home: '\x1b[H',
  end: '\x1b[F',
  pageup: '\x1b[5~',
  pagedown: '\x1b[6~',
  backspace: '\x7f',
  delete: '\x1b[3~',
  del: '\x1b[3~',
  space: ' ',
};

// Control codes for the few non-letter Ctrl combos people actually use.
const CTRL_SYMBOL: Record<string, string> = {
  '[': '\x1b',
  '\\': '\x1c',
  ']': '\x1d',
  '@': '\x00',
  ' ': '\x00',
};

/** Convert a single key token to its byte sequence. Throws on unsupported combos (e.g. Ctrl+Tab). */
export function keyToBytes(key: string, bracketPasteActive: boolean): string {
  const lower = key.toLowerCase();
  if (lower in NAMED) return NAMED[lower];

  const ctrl = /^ctrl\+(.+)$/i.exec(key);
  if (ctrl) {
    const c = ctrl[1];
    if (c.length === 1) {
      const lc = c.toLowerCase();
      if (lc >= 'a' && lc <= 'z') return String.fromCharCode(lc.charCodeAt(0) - 96); // Ctrl+A=0x01 … Ctrl+Z=0x1a
      if (c in CTRL_SYMBOL) return CTRL_SYMBOL[c];
    }
    throw new Error(`unsupported key combo: ${key}`); // e.g. Ctrl+Tab is not representable over a PTY
  }

  const alt = /^alt\+(.+)$/i.exec(key);
  if (alt) {
    const a = alt[1];
    if (a.length === 1) return '\x1b' + a; // Alt+x = ESC then x
    throw new Error(`unsupported key combo: ${key}`);
  }

  // Literal text — bracketed paste only when the app enabled it.
  return bracketPasteActive ? `\x1b[200~${key}\x1b[201~` : key;
}

export function keysToBytes(keys: string[], bracketPasteActive: boolean): string {
  return keys.map((k) => keyToBytes(k, bracketPasteActive)).join('');
}
