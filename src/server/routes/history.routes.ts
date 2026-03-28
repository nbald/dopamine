import { Router } from 'express';
import { getDb } from '../db.js';

const HISTORY_MAX = 20;
const router = Router();

router.get('/history', (req, res) => {
  const projectId = Number(req.query.projectId) || 0;
  const rows = getDb().prepare(
    'SELECT text FROM input_history WHERE project_id = ? ORDER BY id ASC'
  ).all(projectId) as { text: string }[];
  res.json(rows.map(r => r.text));
});

router.post('/history', (req, res) => {
  const { text, projectId } = req.body;
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'text required' });
    return;
  }

  const pid = Number(projectId) || 0;
  const db = getDb();
  // Deduplicate within project: remove existing entry
  db.prepare('DELETE FROM input_history WHERE project_id = ? AND text = ?').run(pid, text);
  // Insert new
  db.prepare('INSERT INTO input_history (project_id, text) VALUES (?, ?)').run(pid, text);
  // Trim to max per project
  db.prepare(
    'DELETE FROM input_history WHERE project_id = ? AND id NOT IN (SELECT id FROM input_history WHERE project_id = ? ORDER BY id DESC LIMIT ?)'
  ).run(pid, pid, HISTORY_MAX);

  res.status(201).json({ ok: true });
});

export default router;
