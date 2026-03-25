import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { ptyManager } from '../services/pty-manager.js';

const upload = multer({ dest: '/tmp/dopamine-uploads', limits: { fileSize: 100 * 1024 * 1024 } });
const router = Router();

router.get('/terminals/:id/upload/check', (req, res) => {
  const id = Number(req.params.id);
  const filename = req.query.filename as string;
  if (!filename) { res.json({ exists: false }); return; }

  const handle = ptyManager.get(id);
  const cwd = handle?.getCwd();
  if (!cwd) { res.json({ exists: false }); return; }

  const safeName = path.basename(filename).replace(/[^\w.\-]/g, '_');
  const destPath = path.join(cwd, safeName);
  res.json({ exists: fs.existsSync(destPath) });
});

router.post('/terminals/:id/upload', upload.single('file'), (req, res) => {
  const id = Number(req.params.id);
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file' });
    return;
  }

  const handle = ptyManager.get(id);
  const cwd = handle?.getCwd();
  if (!cwd) {
    fs.unlinkSync(file.path);
    res.status(400).json({ error: 'Cannot determine terminal CWD' });
    return;
  }

  // Sanitize filename
  const safeName = path.basename(file.originalname).replace(/[^\w.\-]/g, '_');
  const destPath = path.join(cwd, safeName);

  // Path traversal check
  let realCwd: string;
  try { realCwd = fs.realpathSync(cwd); } catch {
    fs.unlinkSync(file.path);
    res.status(400).json({ error: 'Terminal CWD inaccessible' });
    return;
  }
  const resolved = path.resolve(destPath);
  if (!resolved.startsWith(realCwd)) {
    fs.unlinkSync(file.path);
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }

  fs.copyFileSync(file.path, resolved);
  fs.unlinkSync(file.path);

  res.json({ path: resolved });
});

export default router;
