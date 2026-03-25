import { initDb, getDb } from './db.js';
import { hashPassword } from './auth.js';
import crypto from 'node:crypto';

function readPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    stdin.resume();

    let password = '';
    const onData = (buf: Buffer) => {
      const ch = buf.toString('utf8');
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          process.stdout.write('\n');
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          resolve(password);
          return;
        } else if (c === '\x7f' || c === '\b') {
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else if (c === '\x03') {
          process.stdout.write('\n');
          process.exit(0);
        } else {
          password += c;
          process.stdout.write('*');
        }
      }
    };
    stdin.on('data', onData);
  });
}

const password = await readPassword('New password: ');
if (!password) {
  console.log('Aborted.');
  process.exit(1);
}

const confirm = await readPassword('Confirm password: ');
if (password !== confirm) {
  console.log('Passwords do not match.');
  process.exit(1);
}

initDb();
const db = getDb();
const hash = await hashPassword(password);
const jwtSecret = crypto.randomBytes(64).toString('hex');

const existing = db.prepare('SELECT id FROM auth WHERE id = 1').get();
if (existing) {
  db.prepare('UPDATE auth SET password_hash = ?, jwt_secret = ? WHERE id = 1').run(hash, jwtSecret);
} else {
  db.prepare('INSERT INTO auth (id, password_hash, jwt_secret) VALUES (1, ?, ?)').run(hash, jwtSecret);
}

// Secure the database file
import fs from 'node:fs';
import { config } from './config.js';
try { fs.chmodSync(config.dbPath, 0o600); } catch {}
try { fs.chmodSync(config.dbPath + '-wal', 0o600); } catch {}
try { fs.chmodSync(config.dbPath + '-shm', 0o600); } catch {}

console.log('Password updated. All existing sessions invalidated.');
process.exit(0);
