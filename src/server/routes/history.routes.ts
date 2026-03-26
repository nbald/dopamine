import { Router } from 'express';
import { getDb } from '../db.js';

const HISTORY_MAX = 20;
const router = Router();

router.get('/history', (_req, res) => {
  const rows = getDb().prepare(
    'SELECT text FROM input_history ORDER BY id ASC'
  ).all() as { text: string }[];
  res.json(rows.map(r => r.text));
});

router.post('/history', (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'text required' });
    return;
  }

  const db = getDb();
  // Deduplicate: remove existing entry
  db.prepare('DELETE FROM input_history WHERE text = ?').run(text);
  // Insert new
  db.prepare('INSERT INTO input_history (text) VALUES (?)').run(text);
  // Trim to max
  db.prepare(
    'DELETE FROM input_history WHERE id NOT IN (SELECT id FROM input_history ORDER BY id DESC LIMIT ?)'
  ).run(HISTORY_MAX);

  res.status(201).json({ ok: true });
});

export default router;
