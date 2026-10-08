/**
 * Terminal lifecycle operations shared between the REST routes and the MCP tools,
 * so the two paths can't diverge (notably the Docker container cleanup on the last
 * Docker terminal of a project).
 */
import { getDb } from '../db.js';
import { ptyManager } from './pty-manager.js';
import * as docker from './docker.js';
import { assignPanelEmoji, generatePanelName } from '../utils/emoji.js';

export interface CreatedTerminal {
  id: number;
  project_id: number;
  name: string;
  emoji: string;
  is_docker: number;
  isAlive: boolean;
  cwd: string | null;
}

/** Create a terminal row + spawn its PTY. Throws if a Docker terminal is requested but Docker is unavailable. */
export function createTerminal(
  projectId: number,
  opts: { name?: string; cwd?: string; isDocker?: boolean } = {},
): CreatedTerminal {
  if (opts.isDocker && !ptyManager.isDockerReady()) {
    throw new Error('Docker is not available on this server');
  }
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) {
    throw new Error(`project ${projectId} not found`);
  }
  const max = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM terminals WHERE project_id = ?')
    .get(projectId) as { m: number };
  const emoji = assignPanelEmoji(db, projectId);
  const name = opts.name || generatePanelName(emoji);
  const result = db
    .prepare('INSERT INTO terminals (project_id, name, sort_order, cwd, emoji, is_docker) VALUES (?, ?, ?, ?, ?, ?)')
    .run(projectId, name, max.m + 1, opts.cwd || null, emoji, opts.isDocker ? 1 : 0);
  const terminalId = Number(result.lastInsertRowid);
  const handle = ptyManager.spawn(terminalId, { cwd: opts.cwd || undefined });
  return {
    id: terminalId,
    project_id: projectId,
    name,
    emoji,
    is_docker: opts.isDocker ? 1 : 0,
    isAlive: handle.alive,
    cwd: handle.getCwd(),
  };
}

/** Rename a terminal (sets both name and title_override). Returns false if no such terminal. */
export function renameTerminal(terminalId: number, name: string): boolean {
  const r = getDb()
    .prepare("UPDATE terminals SET name = ?, title_override = ?, updated_at = datetime('now') WHERE id = ?")
    .run(name, name, terminalId);
  return r.changes > 0;
}

/** Kill the PTY, delete the row, and remove the project's Docker container if this was its last Docker terminal. */
export function killTerminal(terminalId: number): boolean {
  const term = getDb()
    .prepare('SELECT is_docker, project_id FROM terminals WHERE id = ?')
    .get(terminalId) as { is_docker: number; project_id: number } | undefined;
  if (!term) return false;

  ptyManager.kill(terminalId);
  getDb().prepare('DELETE FROM terminals WHERE id = ?').run(terminalId);

  if (term.is_docker) {
    const remaining = getDb()
      .prepare('SELECT COUNT(*) as count FROM terminals WHERE project_id = ? AND is_docker = 1')
      .get(term.project_id) as { count: number };
    if (remaining.count === 0) docker.removeContainer(term.project_id);
  }
  return true;
}
