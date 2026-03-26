import { Router } from 'express';
import { getDb } from '../db.js';
import { sanitizeName, sanitizeUrl } from '../utils/sanitize.js';
import { assignPanelEmoji, generatePanelName } from '../utils/emoji.js';

const router = Router();

router.get('/projects/:pid/iframes', (req, res) => {
  const rows = getDb().prepare(
    'SELECT * FROM iframes WHERE project_id = ? ORDER BY sort_order'
  ).all(Number(req.params.pid));
  res.json(rows);
});

router.post('/projects/:pid/iframes', (req, res) => {
  const pid = Number(req.params.pid);
  const { name, url } = req.body;
  const max = getDb().prepare(
    'SELECT COALESCE(MAX(sort_order), -1) as m FROM iframes WHERE project_id = ?'
  ).get(pid) as { m: number };

  const emoji = assignPanelEmoji(getDb(), pid);
  const iframeName = name || generatePanelName(emoji);
  const result = getDb().prepare(
    'INSERT INTO iframes (project_id, name, url, sort_order, emoji) VALUES (?, ?, ?, ?, ?)'
  ).run(pid, iframeName, url || '', max.m + 1, emoji);

  res.status(201).json({
    id: Number(result.lastInsertRowid),
    project_id: pid,
    name: iframeName,
    url: url || '',
    sort_order: max.m + 1,
    emoji,
  });
});

router.get('/iframes/:id', (req, res) => {
  const row = getDb().prepare('SELECT * FROM iframes WHERE id = ?').get(Number(req.params.id));
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(row);
});

router.put('/iframes/:id', (req, res) => {
  const { name, url, projectId } = req.body;
  const updates: string[] = [];
  const values: any[] = [];

  if (name !== undefined) { const n = sanitizeName(name); if (n) { updates.push('name = ?'); values.push(n); } }
  if (url !== undefined) { const u = sanitizeUrl(url); if (u !== null) { updates.push('url = ?'); values.push(u); } }
  if (projectId !== undefined) { updates.push('project_id = ?'); values.push(projectId); }

  if (updates.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return; }

  updates.push("updated_at = datetime('now')");
  values.push(Number(req.params.id));

  getDb().prepare(`UPDATE iframes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.status(204).end();
});

router.delete('/iframes/:id', (req, res) => {
  getDb().prepare('DELETE FROM iframes WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

export default router;
