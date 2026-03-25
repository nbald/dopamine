/**
 * Stateful parser for OSC terminal title escape sequences.
 * Detects \x1b]0;TITLE\x07 and \x1b]2;TITLE\x07 (or \x1b\\)
 * Also detects U+2733 (✳) in title for Claude Code completion.
 */
export class TitleParser {
  private buffer = '';
  private inOsc = false;

  onTitle: ((title: string) => void) | null = null;
  onClaudeDone: (() => void) | null = null;

  feed(data: string): void {
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];

      if (this.inOsc) {
        if (ch === '\x07') {
          this.emitTitle(this.buffer);
          this.buffer = '';
          this.inOsc = false;
        } else if (ch === '\x1b' && i + 1 < data.length && data[i + 1] === '\\') {
          this.emitTitle(this.buffer);
          this.buffer = '';
          this.inOsc = false;
          i++; // skip the backslash
        } else {
          this.buffer += ch;
        }
      } else if (ch === '\x1b' && i + 2 < data.length && data[i + 1] === ']') {
        const code = data[i + 2];
        if (code === '0' || code === '2') {
          if (i + 3 < data.length && data[i + 3] === ';') {
            this.inOsc = true;
            this.buffer = '';
            i += 3; // skip \x1b]N;
          }
        }
      }
    }
  }

  private emitTitle(title: string): void {
    this.onTitle?.(title);
    if (title.includes('\u2733')) {
      this.onClaudeDone?.();
    }
  }
}
