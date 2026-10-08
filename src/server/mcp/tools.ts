/**
 * Read-only MCP tool logic (Phase 2). Plain functions over the DB + PtyManager so they
 * stay testable; the MCP wiring (schemas, content formatting) lives in server.ts.
 *
 * Error policy (plan faille #6): no auto-spawn. A terminal with no live PtyHandle is
 * reported dead (thrown → surfaced as an isError tool result). read_output / is_busy on a
 * dead-but-still-present handle return its last buffer with isAlive:false (post-mortem).
 */
import { getDb } from '../db.js';
import { ptyManager } from '../services/pty-manager.js';
import { RING_BUFFER_SIZE } from '../services/pty-handle.js';
import {
  createTerminal as svcCreateTerminal,
  renameTerminal as svcRenameTerminal,
  killTerminal as svcKillTerminal,
  type CreatedTerminal,
} from '../services/terminal-service.js';
import { broadcastSync } from '../ws/handler.js';
import { keysToBytes } from './keys.js';

export function listProjects(): unknown[] {
  return getDb()
    .prepare('SELECT id, name, sort_order, created_at, updated_at FROM projects ORDER BY sort_order')
    .all();
}

export function listTerminals(projectId: number): unknown[] {
  const rows = getDb()
    .prepare(
      'SELECT id, project_id, name, title_override, cwd, is_docker, is_dead FROM terminals WHERE project_id = ? ORDER BY sort_order',
    )
    .all(projectId) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const h = ptyManager.get(row.id as number);
    return {
      id: row.id,
      project_id: row.project_id,
      name: row.name,
      is_docker: row.is_docker,
      isAlive: h?.alive ?? false,
      isBusy: h?.isBusy() ?? false,
      title: h?.title || (row.title_override as string) || (row.name as string),
      liveCwd: h?.getCwd() || (row.cwd as string | null),
    };
  });
}

export async function readOutput(
  terminalId: number,
  offsetLines: number,
  maxLines: number,
): Promise<{ lines: string[]; total_lines: number; offset: number; has_more: boolean; title: string; isAlive: boolean }> {
  const h = ptyManager.get(terminalId);
  if (!h) throw new Error(`terminal ${terminalId} is not running (dead or never started)`);
  const r = await h.readLines(offsetLines, maxLines);
  return {
    lines: r.lines,
    total_lines: r.total,
    offset: r.offset,
    has_more: r.hasMore,
    title: h.title,
    isAlive: h.alive,
  };
}

export function isBusyInfo(terminalId: number): { busy: boolean; title: string; idle_for_seconds: number } {
  const h = ptyManager.get(terminalId);
  if (!h) throw new Error(`terminal ${terminalId} is not running (dead or never started)`);
  return {
    busy: h.isBusy(),
    title: h.title,
    idle_for_seconds: Math.round(h.getIdleDurationMs() / 1000),
  };
}

// --- Mutating tools: each triggers broadcastSync() so the web UI reflects MCP changes. ---

export function createTerminal(
  projectId: number,
  opts: { name?: string; cwd?: string; isDocker?: boolean },
): CreatedTerminal {
  const terminal = svcCreateTerminal(projectId, opts);
  broadcastSync();
  return terminal;
}

export function renameTerminal(terminalId: number, name: string): { id: number; name: string } {
  if (!svcRenameTerminal(terminalId, name)) throw new Error(`terminal ${terminalId} not found`);
  broadcastSync();
  return { id: terminalId, name };
}

export function killTerminal(terminalId: number): { id: number; killed: true } {
  if (!svcKillTerminal(terminalId)) throw new Error(`terminal ${terminalId} not found`);
  broadcastSync();
  return { id: terminalId, killed: true };
}

// --- Interaction ---

export function sendKeys(terminalId: number, keys: string[]): { sent: number } {
  const h = ptyManager.get(terminalId);
  if (!h || !h.alive) throw new Error(`terminal ${terminalId} is not running (dead or never started)`);
  h.write(keysToBytes(keys, h.bracketPasteActive));
  return { sent: keys.length };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface WaitResult {
  status: 'idle' | 'timeout';
  waited_seconds: number;
  final_title: string;
  new_lines: string[];
  truncated: boolean;
}

/**
 * Long-poll until the agent stops "thinking". Two phases (plan faille #1):
 *  A) wait for busy to BEGIN (3s grace → else return idle immediately; handles the
 *     "agent hasn't reacted to send_keys yet" race), then
 *  B) wait for idle (title stable) or timeout.
 * new_lines is anchored on the monotonic byte counter (faille #2): truncated:true if the
 * ring buffer rotated past the anchor during the wait.
 * NOTE: keepalive for very long HTTP waits (>~270s) is not implemented yet (faille #5) —
 * keep timeout_seconds modest, or re-call on timeout.
 */
export async function waitUntilNotBusy(
  terminalId: number,
  timeoutSeconds = 120,
  pollIntervalMs = 250,
  signal?: AbortSignal,
): Promise<WaitResult> {
  const h = ptyManager.get(terminalId);
  if (!h || !h.alive) throw new Error(`terminal ${terminalId} is not running (dead or never started)`);

  const startBytes = h.totalBytesWritten;
  const startTotal = (await h.readLines(0, 1)).total;
  const startTime = Date.now();
  const deadline = startTime + timeoutSeconds * 1000;
  const graceDeadline = startTime + 3000;

  const finalize = async (status: 'idle' | 'timeout'): Promise<WaitResult> => {
    const truncated = h.totalBytesWritten - startBytes > RING_BUFFER_SIZE;
    const end = await h.readLines(0, 100_000); // effectively all buffered lines
    const delta = Math.max(0, end.total - startTotal);
    const new_lines = truncated ? end.lines.slice(-500) : delta === 0 ? [] : end.lines.slice(-delta);
    return {
      status,
      waited_seconds: Math.round((Date.now() - startTime) / 1000),
      final_title: h.title,
      new_lines,
      truncated,
    };
  };

  // Client disconnected / request cancelled → stop polling and skip the final parse.
  const abortedResult = (): WaitResult => ({
    status: 'timeout',
    waited_seconds: Math.round((Date.now() - startTime) / 1000),
    final_title: h.title,
    new_lines: [],
    truncated: false,
  });

  // Phase A — wait for busy to begin (race guard).
  while (!h.isBusy()) {
    if (signal?.aborted) return abortedResult();
    if (Date.now() >= graceDeadline) return finalize('idle');
    await sleep(pollIntervalMs);
  }
  // Phase B — wait for idle.
  while (h.isBusy()) {
    if (signal?.aborted) return abortedResult();
    if (Date.now() >= deadline) return finalize('timeout');
    await sleep(pollIntervalMs);
  }
  return finalize('idle');
}
