import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

let dtachPath: string | null | undefined = undefined;
let socketDir: string | null = null;

const SOURCE_FILES = ['attach.c', 'master.c', 'main.c', 'dtach.h', 'configure', 'config.h.in', 'Makefile.in'];

function hasCommand(cmd: string): boolean {
  try {
    execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Compile bundled dtach at startup if needed */
export function ensureDtach(): void {
  if (process.platform === 'win32') return;

  const dtachDir = path.resolve(import.meta.dirname, '../../../vendor/dtach');
  const dtachBinary = path.join(dtachDir, 'dtach');

  // Already compiled and up to date?
  if (fs.existsSync(dtachBinary)) {
    const binaryMtime = fs.statSync(dtachBinary).mtimeMs;
    const allOlder = SOURCE_FILES.every(f => {
      const fp = path.join(dtachDir, f);
      return fs.existsSync(fp) && fs.statSync(fp).mtimeMs <= binaryMtime;
    });
    if (allOlder) return;
  }

  // Need to compile — check toolchain
  if (!hasCommand('cc') || !hasCommand('make')) {
    console.warn(
      'dtach: cannot compile — cc or make not found.\n' +
      '  Terminal sessions will not persist across restarts.\n' +
      '  Install build tools (e.g. apt install build-essential) and restart to enable persistence.'
    );
    return;
  }

  // Compile: execSync is used intentionally — ./configure is a vendored autoconf
  // script (not user input) that requires shell execution.
  try {
    fs.chmodSync(path.join(dtachDir, 'configure'), 0o755);
    execSync('./configure', { cwd: dtachDir, stdio: 'pipe' });
    execSync('make', { cwd: dtachDir, stdio: 'pipe' });
    console.log('dtach: compiled successfully');
  } catch (e: any) {
    console.warn('dtach: compilation failed, sessions will not persist');
    if (e.stderr) console.warn(e.stderr.toString());
    return;
  }

  // Reset cache so getDtachPath() picks up the new binary
  dtachPath = undefined;
}

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

/**
 * Get dtach args to create and attach in one go (dtach -A).
 * `rawPty` (-R) skips the pty line discipline (echo, \n→\r\n, …); only for
 * programs that relay another terminal (docker exec -it), where it prevents
 * terminal query responses from being echoed back. A shell needs it off.
 */
export function createAndAttachArgs(terminalId: number, shell: string, rawPty = false): string[] {
  return ['-A', socketPath(terminalId), '-z', ...(rawPty ? ['-R'] : []), shell];
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
