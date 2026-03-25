import fs from 'node:fs';
import path from 'node:path';
import selfsigned from 'selfsigned';
import { config } from './config.js';

interface CertPair {
  key: string;
  cert: string;
}

export function loadOrGenerateCerts(): CertPair {
  const keyPath = path.join(config.certDir, 'server.key');
  const certPath = path.join(config.certDir, 'server.cert');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath, 'utf-8'),
      cert: fs.readFileSync(certPath, 'utf-8'),
    };
  }

  console.log('Generating self-signed certificate...');
  fs.mkdirSync(config.certDir, { recursive: true });

  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = selfsigned.generate(attrs, {
    days: 3650,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
        ],
      },
    ],
  });

  fs.writeFileSync(keyPath, pems.private, { mode: 0o600 });
  fs.writeFileSync(certPath, pems.cert, { mode: 0o644 });

  console.log(`Certificate saved to ${config.certDir}`);
  return { key: pems.private, cert: pems.cert };
}
