import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

let dtachPath: string | null | undefined = undefined;
let socketDir: string | null = null;

/** Resolve the dtach binary: bundled first, then system PATH */
export function getDtachPath(): string | null {
  if (dtachPath !== undefined) return dtachPath;

  // Try bundled binary first
  const bundled = path.resolve(import.meta.dirname, '../../../vendor/dtach/dtach');
  if (fs.existsSync(bundled)) {
    dtachPath = bundled;
    return dtachPath;
  }

  // Fall back to system PATH
  try {
    execFileSync('dtach', ['--help'], { stdio: 'pipe' });
    dtachPath = 'dtach';
    return dtachPath;
  } catch (e: any) {
    if (e.status !== 127) {
      dtachPath = 'dtach';
      return dtachPath;
    }
  }

  dtachPath = null;
  return null;
}

export function isDtachAvailable(): boolean {
  return getDtachPath() !== null;
}

function getSocketDir(): string {
  if (socketDir) return socketDir;
  socketDir = path.join(config.dataDir, 'sockets');
  fs.mkdirSync(socketDir, { recursive: true });
  return socketDir;
}

function socketPath(terminalId: number): string {
  return path.join(getSocketDir(), `terminal_${terminalId}.sock`);
}

/** Check if a dtach session exists (socket file present and connectable) */
export function sessionExists(terminalId: number): boolean {
  const sock = socketPath(terminalId);
  return fs.existsSync(sock);
}

/** Get dtach args to create and attach in one go (dtach -A) */
export function createAndAttachArgs(terminalId: number, shell: string): string[] {
  return ['-A', socketPath(terminalId), '-z', shell];
}

/** Get dtach args to attach to existing session */
export function attachArgs(terminalId: number): string[] {
  return ['-a', socketPath(terminalId), '-z'];
}

/** Kill a dtach session: find processes using the socket, kill them, remove socket */
export function killSession(terminalId: number): void {
  const sock = socketPath(terminalId);

  // Find all processes holding this unix socket and kill them
  try {
    const out = execFileSync('fuser', [sock], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const pids = out.split(/\s+/).map(Number).filter(Boolean);
    for (const pid of pids) {
      try { process.kill(pid, 'SIGKILL'); } catch {}
    }
  } catch {}

  try { fs.unlinkSync(sock); } catch {}
}

/** List all existing dtach sessions, returns terminal IDs */
export function listSessions(): number[] {
  try {
    const dir = getSocketDir();
    const files = fs.readdirSync(dir);
    return files
      .filter(f => f.startsWith('terminal_') && f.endsWith('.sock'))
      .map(f => parseInt(f.replace('terminal_', '').replace('.sock', ''), 10))
      .filter(id => !isNaN(id))
      .filter(id => fs.existsSync(path.join(dir, `terminal_${id}.sock`)));
  } catch {
    return [];
  }
}
