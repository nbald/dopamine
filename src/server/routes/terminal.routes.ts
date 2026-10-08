import { Router } from 'express';
import { getDb } from '../db.js';
import { ptyManager } from '../services/pty-manager.js';
import { createTerminal, killTerminal } from '../services/terminal-service.js';

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
      isBusy: handle?.isBusy() ?? false,
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
  try {
    const terminal = createTerminal(Number(pid), { name, cwd, isDocker });
    res.status(201).json(terminal);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
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
  killTerminal(Number(req.params.id));
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
