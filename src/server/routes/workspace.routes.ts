import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

router.get('/workspaces', (_req, res) => {
  const rows = getDb().prepare('SELECT * FROM workspaces ORDER BY sort_order').all();
  res.json(rows);
});

router.post('/workspaces', (req, res) => {
  const { name, layout } = req.body;
  const max = getDb().prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM workspaces').get() as { m: number };

  const result = getDb().prepare(
    'INSERT INTO workspaces (name, layout, sort_order) VALUES (?, ?, ?)'
  ).run(name || 'Workspace', layout || '{}', max.m + 1);

  res.status(201).json({
    id: Number(result.lastInsertRowid),
    name: name || 'Workspace',
    layout: layout || '{}',
    sort_order: max.m + 1,
  });
});

router.put('/workspaces/:id', (req, res) => {
  const { name, layout } = req.body;
  const updates: string[] = [];
  const values: any[] = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (layout !== undefined) { updates.push('layout = ?'); values.push(layout); }

  if (updates.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return; }

  updates.push("updated_at = datetime('now')");
  values.push(Number(req.params.id));

  getDb().prepare(`UPDATE workspaces SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.status(204).end();
});

router.delete('/workspaces/:id', (req, res) => {
  getDb().prepare('DELETE FROM workspaces WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

export default router;
