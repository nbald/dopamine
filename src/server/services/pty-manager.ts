import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import * as pty from 'node-pty';
import { PtyHandle } from './pty-handle.js';
import { config } from '../config.js';
import { getDb } from '../db.js';
import * as dtach from './dtach.js';

class PtyManager {
  private handles = new Map<number, PtyHandle>();
  private useDtach = false;

  onTitle: ((terminalId: number, title: string) => void) | null = null;
  onClaudeDone: ((terminalId: number) => void) | null = null;
  onExit: ((terminalId: number, exitCode: number) => void) | null = null;
  onActivity: ((terminalId: number) => void) | null = null;

  start(): void {
    fs.mkdirSync(config.historyDir, { recursive: true });
    this.useDtach = dtach.isDtachAvailable();
    if (this.useDtach) {
      console.log('dtach detected — terminals will persist across server restarts');
      this.reattachExisting();
    } else {
      console.log('dtach not found — terminals will not survive server restarts');
    }
  }

  private reattachExisting(): void {
    const existingIds = dtach.listSessions();
    if (existingIds.length === 0) return;

    console.log(`Re-attaching ${existingIds.length} dtach session(s)...`);
    for (const terminalId of existingIds) {
      const row = getDb().prepare('SELECT id FROM terminals WHERE id = ?').get(terminalId);
      if (!row) {
        dtach.killSession(terminalId);
        continue;
      }
      this.attachToDtach(terminalId);
    }
  }

  private attachToDtach(terminalId: number): PtyHandle {
    const row = getDb().prepare('SELECT cols, rows FROM terminals WHERE id = ?').get(terminalId) as
      { cols: number; rows: number } | undefined;
    const cols = row?.cols || 80;
    const rows = row?.rows || 24;

    const proc = pty.spawn('dtach', dtach.attachArgs(terminalId), {
      name: 'xterm-256color',
      cols,
      rows,
      env: { ...process.env as Record<string, string>, TERM: 'xterm-256color' },
    });

    const handle = new PtyHandle(terminalId, proc);
    this.wireHandle(handle);
    this.handles.set(terminalId, handle);

    try {
      getDb().prepare("UPDATE terminals SET is_dead = 0, exit_code = NULL, updated_at = datetime('now') WHERE id = ?")
        .run(terminalId);
    } catch {}

    return handle;
  }

  spawn(terminalId: number, opts: { cwd?: string; cols?: number; rows?: number } = {}): PtyHandle {
    const histFile = path.join(config.historyDir, `terminal_${terminalId}.bash_history`);
    const cwd = opts.cwd || os.homedir();
    const cols = opts.cols || 80;
    const rows = opts.rows || 24;

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      TERM: 'xterm-256color',
      HISTFILE: histFile,
      HISTSIZE: '50000',
      HISTFILESIZE: '50000',
      COLORTERM: 'truecolor',
    };

    let proc;

    if (this.useDtach) {
      // dtach -A creates if not exists, attaches if exists
      proc = pty.spawn('dtach', dtach.createAndAttachArgs(terminalId, config.shell), {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env,
      });
    } else {
      proc = pty.spawn(config.shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env,
      });
    }

    const handle = new PtyHandle(terminalId, proc);
    this.wireHandle(handle);
    this.handles.set(terminalId, handle);

    try {
      getDb().prepare("UPDATE terminals SET is_dead = 0, exit_code = NULL, cwd = ?, updated_at = datetime('now') WHERE id = ?")
        .run(cwd, terminalId);
    } catch {}

    return handle;
  }

  private wireHandle(handle: PtyHandle): void {
    handle.onTitle = (id, title) => this.onTitle?.(id, title);
    handle.onClaudeDone = (id) => this.onClaudeDone?.(id);
    handle.onExit = (id, code) => {
      this.onExit?.(id, code);
      try {
        getDb().prepare("UPDATE terminals SET is_dead = 1, exit_code = ?, updated_at = datetime('now') WHERE id = ?")
          .run(code, id);
      } catch {}
    };
    handle.onActivity = (id) => this.onActivity?.(id);
  }

  get(terminalId: number): PtyHandle | undefined {
    return this.handles.get(terminalId);
  }

  kill(terminalId: number): void {
    const handle = this.handles.get(terminalId);
    if (handle) {
      handle.destroy();
      this.handles.delete(terminalId);
    }
    if (this.useDtach) {
      dtach.killSession(terminalId);
    }
  }

  restart(terminalId: number, cwd?: string): PtyHandle | null {
    this.kill(terminalId);
    const row = getDb().prepare('SELECT cwd, cols, rows FROM terminals WHERE id = ?').get(terminalId) as
      { cwd: string | null; cols: number; rows: number } | undefined;
    if (!row) return null;
    return this.spawn(terminalId, {
      cwd: cwd || row.cwd || os.homedir(),
      cols: row.cols,
      rows: row.rows,
    });
  }

  getCwd(terminalId: number): string | null {
    const handle = this.handles.get(terminalId);
    return handle?.getCwd() ?? null;
  }

  shutdownAll(): void {
    for (const handle of this.handles.values()) {
      if (this.useDtach) {
        handle.detachOnly();
      } else {
        handle.destroy();
      }
    }
    this.handles.clear();
  }

  getAll(): Map<number, PtyHandle> {
    return this.handles;
  }

  isUsingDtach(): boolean {
    return this.useDtach;
  }
}

export const ptyManager = new PtyManager();
