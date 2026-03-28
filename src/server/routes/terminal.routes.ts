import { Router } from 'express';
import { getDb } from '../db.js';
import { ptyManager } from '../services/pty-manager.js';
import * as docker from '../services/docker.js';
import { assignPanelEmoji, generatePanelName } from '../utils/emoji.js';

const router = Router();

// List terminals for a project
router.get('/projects/:pid/terminals', (req, res) => {
  const { pid } = req.params;
  const rows = getDb().prepare(
    'SELECT id, project_id, name, title_override, emoji, sort_order, cwd, exit_code, is_dead, is_docker, cols, rows, created_at, updated_at FROM terminals WHERE project_id = ? ORDER BY sort_order'
  ).all(Number(pid));

  // Augment with live info
  const terminals = (rows as any[]).map(row => {
    const handle = ptyManager.get(row.id);
    return {
      ...row,
      isAlive: handle?.alive ?? false,
      title: handle?.title || row.title_override || row.name,
      liveCwd: handle?.getCwd() || row.cwd,
    };
  });

  res.json(terminals);
});

// Create terminal
router.post('/projects/:pid/terminals', (req, res) => {
  const { pid } = req.params;
  const { name, cwd, isDocker } = req.body;

  // Check Docker availability
  if (isDocker && !ptyManager.isDockerReady()) {
    res.status(400).json({ error: 'Docker is not available on this server' });
    return;
  }

  // Get max sort_order
  const max = getDb().prepare(
    'SELECT COALESCE(MAX(sort_order), -1) as m FROM terminals WHERE project_id = ?'
  ).get(Number(pid)) as { m: number };

  const emoji = assignPanelEmoji(getDb(), Number(pid));
  const terminalName = name || generatePanelName(emoji);
  const result = getDb().prepare(
    'INSERT INTO terminals (project_id, name, sort_order, cwd, emoji, is_docker) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(Number(pid), terminalName, max.m + 1, cwd || null, emoji, isDocker ? 1 : 0);

  const terminalId = Number(result.lastInsertRowid);

  // Spawn PTY
  const handle = ptyManager.spawn(terminalId, { cwd: cwd || undefined });

  res.status(201).json({
    id: terminalId,
    project_id: Number(pid),
    name: terminalName,
    emoji,
    is_docker: isDocker ? 1 : 0,
    isAlive: handle.alive,
    cwd: handle.getCwd(),
  });
});

// Update terminal
router.put('/terminals/:id', (req, res) => {
  const { id } = req.params;
  const { name, projectId } = req.body;

  const updates: string[] = [];
  const values: any[] = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); updates.push('title_override = ?'); values.push(name); }
  if (projectId !== undefined) { updates.push('project_id = ?'); values.push(projectId); }

  if (updates.length === 0) {
    res.status(400).json({ error: 'Nothing to update' });
    return;
  }

  updates.push("updated_at = datetime('now')");
  values.push(Number(id));

  getDb().prepare(`UPDATE terminals SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.status(204).end();
});

// Graceful stop (SIGHUP to shell)
router.post('/terminals/:id/stop', (req, res) => {
  const { id } = req.params;
  const handle = ptyManager.get(Number(id));
  if (handle && handle.alive) {
    try { process.kill(handle.pid, 'SIGHUP'); } catch {}
  }
  res.status(204).end();
});

// Force kill (SIGKILL) + delete from DB
router.delete('/terminals/:id', (req, res) => {
  const { id } = req.params;
  const terminalId = Number(id);

  // Query terminal info BEFORE deleting (need is_docker + project_id for cleanup)
  const term = getDb().prepare('SELECT is_docker, project_id FROM terminals WHERE id = ?').get(terminalId) as
    { is_docker: number; project_id: number } | undefined;

  ptyManager.kill(terminalId);
  getDb().prepare('DELETE FROM terminals WHERE id = ?').run(terminalId);

  // If last Docker terminal in project, remove the container (keep volume files)
  if (term?.is_docker) {
    const remaining = getDb().prepare(
      'SELECT COUNT(*) as count FROM terminals WHERE project_id = ? AND is_docker = 1'
    ).get(term.project_id) as { count: number };
    if (remaining.count === 0) {
      docker.removeContainer(term.project_id);
    }
  }

  res.status(204).end();
});

// Restart terminal
router.post('/terminals/:id/restart', (req, res) => {
  const { id } = req.params;
  const handle = ptyManager.restart(Number(id));
  if (!handle) {
    res.status(404).json({ error: 'Terminal not found' });
    return;
  }
  res.json({ id: Number(id), isAlive: handle.alive, cwd: handle.getCwd() });
});

// Get terminal CWD
router.get('/terminals/:id/cwd', (req, res) => {
  const { id } = req.params;
  const cwd = ptyManager.getCwd(Number(id));
  res.json({ cwd });
});

export default router;
