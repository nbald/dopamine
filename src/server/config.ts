import path from 'node:path';
import os from 'node:os';

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--') && i + 1 < args.length) {
      parsed[arg.slice(2)] = args[++i];
    }
  }
  return parsed;
}

const args = parseArgs();

const dataDir = path.join(os.homedir(), '.dopamine');

export const config = {
  port: parseInt(args.port || process.env.DOPAMINE_PORT || '3000', 10),
  bind: args.bind || process.env.DOPAMINE_BIND || '0.0.0.0',
  shell: args.shell || process.env.DOPAMINE_SHELL || process.env.SHELL || '/bin/bash',
  dataDir,
  dbPath: path.join(dataDir, 'dopamine.db'),
  certDir: path.join(dataDir, 'certs'),
  historyDir: path.join(dataDir, 'history'),
  isProd: process.env.NODE_ENV === 'production',
  docker: {
    defaultShell: process.env.DOPAMINE_DOCKER_SHELL || '/bin/bash',
    volumeBase: path.join(dataDir, 'docker'),
    credentialsFile: path.join(os.homedir(), '.claude', '.credentials.json'),
    baseImage: 'dopamine-base',
  },
};
