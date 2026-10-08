import type { IPty } from 'node-pty';
import type { WebSocket } from 'ws';
// @xterm/headless is a CommonJS bundle whose named exports aren't statically detectable
// by Node's ESM loader; a default import maps to module.exports, exposing Terminal.
import xtermHeadless from '@xterm/headless';
import { TitleParser } from '../utils/title-parser.js';

const { Terminal } = xtermHeadless;
import { getCwd } from '../utils/cwd.js';

export const RING_BUFFER_SIZE = 1024 * 1024; // 1MB for disconnect replay
// Title is considered "animated" (agent thinking) if it changed within this window.
// Agents (Claude Code, Codex) cycle their OSC title while working; a stable title = idle.
// 1000ms also tolerates animation gaps up to ~1s (e.g. a pause between spinner frames).
const BUSY_TITLE_WINDOW_MS = 1000;
// Scrollback for the transient read terminal — generous so a full ring-buffer replay
// (≤ ~1MB) is not truncated. The instance is disposed right after each read.
const READ_HEADLESS_SCROLLBACK = 100_000;
const BP_ENABLE = '\x1b[?2004h';  // DECSET 2004 — bracketed paste on
const BP_DISABLE = '\x1b[?2004l'; // DECRST 2004 — bracketed paste off

/** Pure busy test (title-animation heuristic). `now` is injectable for tests. */
export function computeIsBusy(lastTitleChangedAt: number, now: number): boolean {
  if (lastTitleChangedAt === 0) return false; // no title seen yet
  return now - lastTitleChangedAt < BUSY_TITLE_WINDOW_MS;
}

/**
 * Stateful scan of a data chunk for bracketed-paste mode toggles (DECSET/DECRST 2004).
 * Returns the new active state plus a carry tail to prepend next time, so a sequence
 * split across two chunks is not missed.
 */
export function scanBracketPasteMode(
  prevActive: boolean,
  carry: string,
  data: string,
): { active: boolean; carry: string } {
  const scan = carry + data;
  const hIdx = scan.lastIndexOf(BP_ENABLE);
  const lIdx = scan.lastIndexOf(BP_DISABLE);
  let active = prevActive;
  if (hIdx !== -1 || lIdx !== -1) active = hIdx > lIdx; // latest toggle wins
  // Keep the last (len-1) chars so a sequence straddling the boundary is reconstructed next time.
  return { active, carry: scan.slice(-(BP_ENABLE.length - 1)) };
}

/**
 * Replay raw terminal bytes into a transient headless xterm and extract clean lines,
 * counting back from the end. offset=0 returns the most recent `max` lines; offset=N
 * skips the last N. Reads by ABSOLUTE buffer index (anchored at baseY+cursorY) — NOT
 * viewportY (which is scroll-dependent; a freshly-written instance sits at the bottom).
 */
export async function readLinesFromBuffer(
  raw: string,
  cols: number,
  rows: number,
  offset = 0,
  max = 50,
): Promise<{ lines: string[]; total: number; offset: number; hasMore: boolean }> {
  const term = new Terminal({
    cols: Math.max(1, cols || 80),
    rows: Math.max(1, rows || 24),
    scrollback: READ_HEADLESS_SCROLLBACK,
    allowProposedApi: true, // required to read `buffer.active`
  });
  try {
    if (raw.length > 0) {
      await new Promise<void>((resolve) => term.write(raw, resolve));
    }
    const buf = term.buffer.active;
    const lastIdx = buf.baseY + buf.cursorY; // cursor line = end of content
    const total = lastIdx + 1;

    const safeOffset = Math.max(0, Math.floor(offset));
    const safeMax = Math.max(1, Math.floor(max));
    const endIdx = lastIdx - safeOffset;
    if (endIdx < 0) return { lines: [], total, offset: safeOffset, hasMore: total > 0 };

    const startIdx = Math.max(0, endIdx - safeMax + 1);
    const lines: string[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const line = buf.getLine(i);
      lines.push(line ? line.translateToString(true) : '');
    }
    return { lines, total, offset: safeOffset, hasMore: startIdx > 0 };
  } finally {
    term.dispose();
  }
}

export class PtyHandle {
  readonly terminalId: number;
  readonly isDocker: boolean;
  private pty: IPty;
  private ringBuffer: string[] = [];
  private ringBufferSize = 0;
  private clients: Set<WebSocket> = new Set();
  private titleParser: TitleParser;
  private _title = '';
  private _alive = true;
  private _exitCode: number | null = null;
  private _lastTitleChangedAt = 0;
  private readonly _createdAt = Date.now();
  private _totalBytesWritten = 0;
  private _bracketPasteActive = false;
  private _modeScanCarry = '';

  onTitle: ((terminalId: number, title: string) => void) | null = null;
  onClaudeDone: ((terminalId: number) => void) | null = null;
  onExit: ((terminalId: number, exitCode: number) => void) | null = null;
  onActivity: ((terminalId: number) => void) | null = null;

  constructor(terminalId: number, pty: IPty, isDocker = false) {
    this.terminalId = terminalId;
    this.isDocker = isDocker;
    this.pty = pty;

    this.titleParser = new TitleParser();
    this.titleParser.onTitle = (title) => {
      this._title = title;
      this._lastTitleChangedAt = Date.now();
      this.onTitle?.(this.terminalId, title);
    };
    this.titleParser.onClaudeDone = () => {
      this.onClaudeDone?.(this.terminalId);
    };

    this.pty.onData((data) => {
      this.titleParser.feed(data);
      this._totalBytesWritten += data.length;
      const bp = scanBracketPasteMode(this._bracketPasteActive, this._modeScanCarry, data);
      this._bracketPasteActive = bp.active;
      this._modeScanCarry = bp.carry;
      this.appendToRingBuffer(data);
      this.broadcast('terminal:output', { terminalId: this.terminalId, data });
      if (this.clients.size === 0) {
        this.onActivity?.(this.terminalId);
      }
    });

    this.pty.onExit(({ exitCode }) => {
      this._alive = false;
      this._exitCode = exitCode;
      // Exit is broadcast globally via ptyManager.onExit → ws handler
      this.onExit?.(this.terminalId, exitCode);
    });
  }

  get title(): string { return this._title; }
  get alive(): boolean { return this._alive; }
  get exitCode(): number | null { return this._exitCode; }
  get pid(): number { return this.pty.pid; }

  write(data: string): void {
    if (this._alive) this.pty.write(data);
  }

  resize(cols: number, rows: number): void {
    if (this._alive) this.pty.resize(cols, rows);
  }

  getCwd(): string | null {
    if (!this._alive) return null;
    if (this.isDocker) return '/workspace';
    return getCwd(this.pty.pid);
  }

  /** Total bytes ever received from the PTY — monotonic, never reset (anchor for new_lines). */
  get totalBytesWritten(): number { return this._totalBytesWritten; }

  /** Whether the foreground app currently has bracketed-paste mode (DEC 2004) enabled. */
  get bracketPasteActive(): boolean { return this._bracketPasteActive; }

  /** True while the agent is "thinking" — title-animation heuristic. */
  isBusy(now: number = Date.now()): boolean {
    return computeIsBusy(this._lastTitleChangedAt, now);
  }

  /** Milliseconds the terminal has looked idle (since the title last changed). 0 when busy. */
  getIdleDurationMs(now: number = Date.now()): number {
    if (this.isBusy(now)) return 0;
    return now - (this._lastTitleChangedAt || this._createdAt);
  }

  /** Read clean lines from a transient headless replay of the ring buffer (counting back from the end). */
  readLines(offset = 0, max = 50): Promise<{ lines: string[]; total: number; offset: number; hasMore: boolean }> {
    return readLinesFromBuffer(this.ringBuffer.join(''), this.pty.cols, this.pty.rows, offset, max);
  }

  attachClient(ws: WebSocket): void {
    this.clients.add(ws);
    // Replay ring buffer for reconnecting client
    const replay = this.ringBuffer.join('');
    if (replay.length > 0) {
      this.sendTo(ws, 'terminal:buffered', { terminalId: this.terminalId, data: replay });
    }
    // Notify if already dead
    if (!this._alive) {
      this.sendTo(ws, 'terminal:exit', { terminalId: this.terminalId, exitCode: this._exitCode });
    }
    // Send current title
    if (this._title) {
      this.sendTo(ws, 'terminal:title', { terminalId: this.terminalId, title: this._title });
    }
  }

  detachClient(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  destroy(): void {
    if (this._alive) {
      try { this.pty.kill('SIGKILL'); } catch { /* already dead */ }
    }
    this.clients.clear();
  }

  /** Detach node-pty without killing the underlying process (for tmux) */
  detachOnly(): void {
    this.clients.clear();
    // Just kill the pty attachment, not the tmux session
    try { this.pty.kill(); } catch {}
  }

  private appendToRingBuffer(data: string): void {
    this.ringBuffer.push(data);
    this.ringBufferSize += data.length;
    // Trim old entries if over size limit
    while (this.ringBufferSize > RING_BUFFER_SIZE && this.ringBuffer.length > 1) {
      const removed = this.ringBuffer.shift()!;
      this.ringBufferSize -= removed.length;
    }
  }

  private broadcast(type: string, payload: Record<string, unknown>): void {
    const msg = JSON.stringify({ type, ...payload });
    for (const ws of this.clients) {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(msg);
      }
    }
  }

  private sendTo(ws: WebSocket, type: string, payload: Record<string, unknown>): void {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type, ...payload }));
    }
  }
}
