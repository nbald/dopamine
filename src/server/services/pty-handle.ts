import type { IPty } from 'node-pty';
import type { WebSocket } from 'ws';
import { TitleParser } from '../utils/title-parser.js';
import { getCwd } from '../utils/cwd.js';

const RING_BUFFER_SIZE = 1024 * 1024; // 1MB for disconnect replay

export class PtyHandle {
  readonly terminalId: number;
  private pty: IPty;
  private ringBuffer: string[] = [];
  private ringBufferSize = 0;
  private clients: Set<WebSocket> = new Set();
  private titleParser: TitleParser;
  private _title = '';
  private _alive = true;
  private _exitCode: number | null = null;

  onTitle: ((terminalId: number, title: string) => void) | null = null;
  onClaudeDone: ((terminalId: number) => void) | null = null;
  onExit: ((terminalId: number, exitCode: number) => void) | null = null;
  onActivity: ((terminalId: number) => void) | null = null;

  constructor(terminalId: number, pty: IPty) {
    this.terminalId = terminalId;
    this.pty = pty;

    this.titleParser = new TitleParser();
    this.titleParser.onTitle = (title) => {
      this._title = title;
      this.onTitle?.(this.terminalId, title);
    };
    this.titleParser.onClaudeDone = () => {
      this.onClaudeDone?.(this.terminalId);
    };

    this.pty.onData((data) => {
      this.titleParser.feed(data);
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
    return getCwd(this.pty.pid);
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
      try { this.pty.kill('SIGHUP'); } catch { /* already dead */ }
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
