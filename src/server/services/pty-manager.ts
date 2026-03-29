import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import * as pty from 'node-pty';
import { PtyHandle } from './pty-handle.js';
import { config } from '../config.js';
import { getDb } from '../db.js';
import * as dtach from './dtach.js';
import * as docker from './docker.js';

class PtyManager {
  private handles = new Map<number, PtyHandle>();
  private useDtach = false;
  private useDocker = false;

  onTitle: ((terminalId: number, title: string) => void) | null = null;
  onClaudeDone: ((terminalId: number) => void) | null = null;
  onExit: ((terminalId: number, exitCode: number) => void) | null = null;
  onActivity: ((terminalId: number) => void) | null = null;

  start(): void {
    fs.mkdirSync(config.historyDir, { recursive: true });

    // 1. dtach — compile if needed, then reattach existing sessions
    if (process.env.DISABLE_DTACH) {
      console.log('dtach disabled via DISABLE_DTACH — terminals will not survive server restarts');
    } else {
      dtach.ensureDtach();
      this.useDtach = dtach.isDtachAvailable();
      if (this.useDtach) {
        const dtachBin = dtach.getDtachPath()!;
        const source = dtachBin !== 'dtach' ? 'bundled' : 'system';
        console.log(`dtach detected (${source}) — terminals will persist across server restarts`);
        this.reattachExisting();
      } else {
        console.log('dtach not found — terminals will not survive server restarts');
      }
    }

    // 2. Docker — build image, recover Docker terminals after host reboot, cleanup orphans
    if (process.env.DISABLE_DOCKER) {
      console.log('Docker disabled via DISABLE_DOCKER — sandbox terminals unavailable');
    } else if (docker.isDockerAvailable()) {
      this.useDocker = true;
      console.log('Docker detected — sandbox terminals available');
      try {
        docker.buildImageIfNeeded();
      } catch (e) {
        console.error('Failed to build Docker base image:', e);
        this.useDocker = false;
        return;
      }
      this.recoverDockerTerminals();
      this.cleanupOrphanedContainers();
    }
  }

  /** Recover Docker terminals that lost their dtach sessions (e.g. after host reboot) */
  private recoverDockerTerminals(): void {
    const rows = getDb().prepare(
      'SELECT id, project_id FROM terminals WHERE is_docker = 1'
    ).all() as { id: number; project_id: number }[];

    // Filter out terminals that already have handles (reattached via dtach)
    const orphaned = rows.filter(r => !this.handles.has(r.id));
    if (orphaned.length === 0) return;

    // Group by project
    const byProject = new Map<number, number[]>();
    for (const r of orphaned) {
      const list = byProject.get(r.project_id) || [];
      list.push(r.id);
      byProject.set(r.project_id, list);
    }

    console.log(`Recovering ${orphaned.length} Docker terminal(s) across ${byProject.size} project(s)...`);
    for (const [projectId, terminalIds] of byProject) {
      try {
        docker.ensureContainer(projectId);
        for (const terminalId of terminalIds) {
          try {
            this.spawn(terminalId);
          } catch (e) {
            console.error(`Failed to recover Docker terminal ${terminalId}:`, e);
          }
        }
      } catch (e) {
        console.error(`Failed to start container for project ${projectId}:`, e);
      }
    }
  }

  /** Remove Docker containers that have no matching project/terminals in DB */
  private cleanupOrphanedContainers(): void {
    const containerIds = docker.listAllContainers();
    for (const projectId of containerIds) {
      const row = getDb().prepare(
        'SELECT COUNT(*) as count FROM terminals WHERE project_id = ? AND is_docker = 1'
      ).get(projectId) as { count: number } | undefined;
      if (!row || row.count === 0) {
        console.log(`Removing orphaned Docker container dopamine-${projectId}`);
        docker.removeContainer(projectId);
      }
    }
  }

  isDockerReady(): boolean {
    return this.useDocker;
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
    const row = getDb().prepare('SELECT cols, rows, is_docker FROM terminals WHERE id = ?').get(terminalId) as
      { cols: number; rows: number; is_docker: number } | undefined;
    const cols = row?.cols || 80;
    const rows = row?.rows || 24;

    const proc = pty.spawn(dtach.getDtachPath()!, dtach.attachArgs(terminalId), {
      name: 'xterm-256color',
      cols,
      rows,
      env: { ...process.env as Record<string, string>, TERM: 'xterm-256color' },
    });

    const handle = new PtyHandle(terminalId, proc, row?.is_docker === 1);
    this.wireHandle(handle);
    this.handles.set(terminalId, handle);

    try {
      getDb().prepare("UPDATE terminals SET is_dead = 0, exit_code = NULL, updated_at = datetime('now') WHERE id = ?")
        .run(terminalId);
    } catch {}

    return handle;
  }

  spawn(terminalId: number, opts: { cwd?: string; cols?: number; rows?: number } = {}): PtyHandle {
    // Check if this is a Docker terminal
    const termRow = getDb().prepare('SELECT is_docker, project_id FROM terminals WHERE id = ?').get(terminalId) as
      { is_docker: number; project_id: number } | undefined;
    const isDocker = termRow?.is_docker === 1;

    if (isDocker && termRow) {
      return this.spawnDocker(terminalId, termRow.project_id, opts);
    }

    return this.spawnHost(terminalId, opts);
  }

  private spawnHost(terminalId: number, opts: { cwd?: string; cols?: number; rows?: number }): PtyHandle {
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
      proc = pty.spawn(dtach.getDtachPath()!, dtach.createAndAttachArgs(terminalId, config.shell), {
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

  private spawnDocker(terminalId: number, projectId: number, opts: { cols?: number; rows?: number }): PtyHandle {
    const cols = opts.cols || 80;
    const rows = opts.rows || 24;
    const shell = config.docker.defaultShell;

    // Ensure container is running
    docker.ensureContainer(projectId);

    let proc;
    const dockerExecArgs = docker.execArgs(projectId, shell);

    if (this.useDtach) {
      // dtach -A socket -z docker exec -it -u uid -w /workspace container shell
      proc = pty.spawn(dtach.getDtachPath()!, [
        ...dtach.createAndAttachArgs(terminalId, 'docker'),
        ...dockerExecArgs,
      ], {
        name: 'xterm-256color',
        cols,
        rows,
        env: { ...process.env as Record<string, string>, TERM: 'xterm-256color' },
      });
    } else {
      proc = pty.spawn('docker', dockerExecArgs, {
        name: 'xterm-256color',
        cols,
        rows,
        env: { ...process.env as Record<string, string>, TERM: 'xterm-256color' },
      });
    }

    const handle = new PtyHandle(terminalId, proc, true);
    this.wireHandle(handle);
    this.handles.set(terminalId, handle);

    try {
      getDb().prepare("UPDATE terminals SET is_dead = 0, exit_code = NULL, updated_at = datetime('now') WHERE id = ?")
        .run(terminalId);
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

  /** Kill all terminal handles for a project (used before project deletion) */
  killProjectTerminals(projectId: number): void {
    const rows = getDb().prepare('SELECT id FROM terminals WHERE project_id = ?').all(projectId) as { id: number }[];
    for (const r of rows) {
      this.kill(r.id);
    }
  }

  isUsingDtach(): boolean {
    return this.useDtach;
  }
}

export const ptyManager = new PtyManager();
