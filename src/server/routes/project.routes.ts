import { Router } from 'express';
import { getDb } from '../db.js';
import { ptyManager } from '../services/pty-manager.js';
import * as docker from '../services/docker.js';
import { sanitizeName } from '../utils/sanitize.js';
import { assignProjectCategory } from '../utils/emoji.js';

const router = Router();

router.get('/projects', (_req, res) => {
  const rows = getDb().prepare('SELECT * FROM projects ORDER BY sort_order').all();
  res.json(rows);
});

router.post('/projects', (req, res) => {
  const name = sanitizeName(req.body.name);
  if (!name) {
    res.status(400).json({ error: 'Name required' });
    return;
  }

  const max = getDb().prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM projects').get() as { m: number };
  const emoji_category = assignProjectCategory(getDb());
  const result = getDb().prepare('INSERT INTO projects (name, sort_order, emoji_category) VALUES (?, ?, ?)').run(name, max.m + 1, emoji_category);

  res.status(201).json({
    id: Number(result.lastInsertRowid),
    name,
    sort_order: max.m + 1,
    emoji_category,
  });
});

router.put('/projects/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) { res.status(400).json({ error: 'ids array required' }); return; }
  const stmt = getDb().prepare("UPDATE projects SET sort_order = ?, updated_at = datetime('now') WHERE id = ?");
  const tx = getDb().transaction(() => {
    for (let i = 0; i < ids.length; i++) {
      stmt.run(i, Number(ids[i]));
    }
  });
  tx();
  res.status(204).end();
});

router.put('/projects/:id', (req, res) => {
  const { id } = req.params;
  const { name, sortOrder } = req.body;

  const updates: string[] = [];
  const values: any[] = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (sortOrder !== undefined) { updates.push('sort_order = ?'); values.push(sortOrder); }

  if (updates.length === 0) {
    res.status(400).json({ error: 'Nothing to update' });
    return;
  }

  updates.push("updated_at = datetime('now')");
  values.push(Number(id));

  getDb().prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.status(204).end();
});

router.delete('/projects/:id', (req, res) => {
  const { id } = req.params;
  const projectId = Number(id);

  // Kill all terminal handles for this project (prevents orphaned PtyHandles)
  const terminals = getDb().prepare('SELECT id FROM terminals WHERE project_id = ?').all(projectId) as { id: number }[];
  for (const t of terminals) {
    ptyManager.kill(t.id);
  }

  // Remove Docker container if any (idempotent)
  docker.removeContainer(projectId);

  getDb().prepare('DELETE FROM input_history WHERE project_id = ?').run(projectId);
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  res.status(204).end();
});

export default router;
