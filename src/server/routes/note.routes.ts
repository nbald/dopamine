import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

router.get('/projects/:pid/notes', (req, res) => {
  const rows = getDb().prepare(
    'SELECT * FROM notes WHERE project_id = ? ORDER BY sort_order'
  ).all(Number(req.params.pid));
  res.json(rows);
});

router.post('/projects/:pid/notes', (req, res) => {
  const pid = Number(req.params.pid);
  const { name } = req.body;
  const max = getDb().prepare(
    'SELECT COALESCE(MAX(sort_order), -1) as m FROM notes WHERE project_id = ?'
  ).get(pid) as { m: number };

  const result = getDb().prepare(
    'INSERT INTO notes (project_id, name, sort_order) VALUES (?, ?, ?)'
  ).run(pid, name || 'Note', max.m + 1);

  res.status(201).json({
    id: Number(result.lastInsertRowid),
    project_id: pid,
    name: name || 'Note',
    content: '',
    sort_order: max.m + 1,
  });
});

router.get('/notes/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM notes WHERE id = ?').get(Number(req.params.id));
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(row);
});

router.put('/notes/:id', (req, res) => {
  const { name, content, projectId } = req.body;
  const updates: string[] = [];
  const values: any[] = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (content !== undefined) { updates.push('content = ?'); values.push(content); }
  if (projectId !== undefined) { updates.push('project_id = ?'); values.push(projectId); }

  if (updates.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return; }

  updates.push("updated_at = datetime('now')");
  values.push(Number(req.params.id));

  getDb().prepare(`UPDATE notes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.status(204).end();
});

router.delete('/notes/:id', (req, res) => {
  getDb().prepare('DELETE FROM notes WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

router.get('/notes/:id/export', (req, res) => {
  const row = getDb().prepare('SELECT name, content FROM notes WHERE id = ?').get(Number(req.params.id)) as { name: string; content: string } | undefined;
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.setHeader('Content-Type', 'text/plain');
  const safeName = row.name.replace(/["\\\r\n]/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.txt"`);
  res.send(row.content);
});

export default router;
