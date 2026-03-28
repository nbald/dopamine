import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { config } from '../config.js';

let dockerAvailable: boolean | null = null;
let imageBuilt: boolean | null = null;

export function isDockerAvailable(): boolean {
  if (dockerAvailable !== null) return dockerAvailable;
  try {
    execFileSync('docker', ['info'], { stdio: 'pipe' });
    dockerAvailable = true;
  } catch {
    dockerAvailable = false;
  }
  return dockerAvailable;
}

export function containerName(projectId: number): string {
  return `dopamine-${projectId}`;
}

function volumePath(projectId: number): string {
  return path.join(config.docker.volumeBase, String(projectId));
}

/** Check if a container exists and is running */
export function containerIsRunning(projectId: number): boolean {
  const name = containerName(projectId);
  try {
    const out = execFileSync('docker', ['inspect', '--format', '{{.State.Running}}', name], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return out === 'true';
  } catch {
    return false;
  }
}

/** Check if a container exists (running or stopped) */
function containerExists(projectId: number): boolean {
  const name = containerName(projectId);
  try {
    execFileSync('docker', ['inspect', name], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a container is running for the given project.
 * - If running: noop
 * - If stopped: docker start
 * - If missing: create volume dir, seed skeleton, docker run
 */
export function ensureContainer(projectId: number): void {
  const name = containerName(projectId);
  const vol = volumePath(projectId);

  // Check existing container state
  if (containerIsRunning(projectId)) return;

  if (containerExists(projectId)) {
    execFileSync('docker', ['start', name], { stdio: 'pipe' });
    return;
  }

  // Prepare volume directory
  fs.mkdirSync(vol, { recursive: true });

  // Pre-create .claude dir so Docker doesn't create it as root
  // (needed for credentials file mount)
  fs.mkdirSync(path.join(vol, '.claude'), { recursive: true });

  // Seed skeleton files if volume is fresh (bind mount hides useradd -m skeleton)
  seedSkeleton(vol);

  // Copy Claude config files into the volume
  copyClaudeConfig(vol);

  // Build docker run args
  const args = [
    'run', '-d',
    '--name', name,
    '--label', 'dopamine=true',
    '--label', `dopamine.project_id=${projectId}`,
    '--hostname', `sandbox-${projectId}`,
    '--add-host', `sandbox-${projectId}:127.0.0.1`,
    '--network', 'host',
    '-e', `DOPAMINE_HOST_PATH=${vol}`,
    '-v', `${vol}:/workspace`,
  ];

  // Mount credentials if they exist on host
  if (fs.existsSync(config.docker.credentialsFile)) {
    args.push('-v', `${config.docker.credentialsFile}:/workspace/.claude/.credentials.json:ro`);
  }

  args.push(config.docker.baseImage, 'sleep', 'infinity');

  try {
    execFileSync('docker', args, { stdio: 'pipe' });
  } catch (e: any) {
    // Race condition: container appeared between inspect and run
    if (e.stderr?.toString().includes('already in use')) {
      try {
        execFileSync('docker', ['start', name], { stdio: 'pipe' });
      } catch {}
    } else {
      throw e;
    }
  }
}

function seedSkeleton(vol: string): void {
  const bashrc = path.join(vol, '.bashrc');
  if (!fs.existsSync(bashrc)) {
    fs.writeFileSync(bashrc, [
      '# ~/.bashrc',
      '[ -z "$PS1" ] && return',
      'alias ls=\'ls --color=auto\'',
      'alias ll=\'ls -alF\'',
      'alias grep=\'grep --color=auto\'',
      'export PS1=\'\\u@\\h:\\w\\$ \'',
      '',
    ].join('\n'));
  }

  const profile = path.join(vol, '.profile');
  if (!fs.existsSync(profile)) {
    fs.writeFileSync(profile, [
      '# ~/.profile',
      'if [ -n "$BASH_VERSION" ]; then',
      '  if [ -f "$HOME/.bashrc" ]; then',
      '    . "$HOME/.bashrc"',
      '  fi',
      'fi',
      '',
    ].join('\n'));
  }
}

/** Copy Claude config files into the container volume */
function copyClaudeConfig(vol: string): void {
  const home = os.homedir();

  // ~/.claude/settings.json -> /workspace/.claude/settings.json
  const settingsSrc = path.join(home, '.claude', 'settings.json');
  if (fs.existsSync(settingsSrc)) {
    fs.copyFileSync(settingsSrc, path.join(vol, '.claude', 'settings.json'));
  }

  // ~/.claude.json -> /workspace/.claude.json
  const configSrc = path.join(home, '.claude.json');
  if (fs.existsSync(configSrc)) {
    fs.copyFileSync(configSrc, path.join(vol, '.claude.json'));
  }
}

/** Build the dopamine-base Docker image if it doesn't exist yet */
export function buildImageIfNeeded(): void {
  if (imageBuilt) return;

  // Check if image already exists
  try {
    const out = execFileSync('docker', ['images', '-q', config.docker.baseImage], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (out.length > 0) {
      imageBuilt = true;
      return;
    }
  } catch {}

  buildImage();
  imageBuilt = true;
}

function buildImage(): void {
  const { username, uid } = os.userInfo();
  const tmpDir = path.join(config.dataDir, 'docker-build-tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // Write Dockerfile
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), [
      'FROM ubuntu:24.04',
      'RUN apt-get update && apt-get install -y curl git sudo && rm -rf /var/lib/apt/lists/*',
      'ARG USERNAME',
      'ARG USER_UID',
      'RUN userdel -r ubuntu 2>/dev/null; \\',
      '    useradd -m -d /workspace -u ${USER_UID} -s /bin/bash ${USERNAME} \\',
      '    && echo "${USERNAME} ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers',
      'COPY dopamine-welcome.sh /etc/dopamine-welcome.sh',
      'RUN echo \'. /etc/dopamine-welcome.sh\' >> /etc/bash.bashrc',
      'ENV HOME=/workspace',
      'WORKDIR /workspace',
    ].join('\n') + '\n');

    // Write welcome script
    fs.writeFileSync(path.join(tmpDir, 'dopamine-welcome.sh'), [
      '#!/bin/bash',
      '# Skip for non-interactive shells',
      '[[ $- != *i* ]] && return',
      '',
      'export PATH="$HOME/.local/bin:$HOME/.claude/bin:$PATH"',
      '',
      '# First boot: install Claude Code',
      'if [ ! -f /ready ]; then',
      '  echo ""',
      '  echo "=== Initialising Dopamine Docker sandbox ==="',
      '  echo ""',
      '  echo "Updating packages..."',
      '  sudo apt-get update -qq',
      '  echo ""',
      '  echo "Installing Claude Code..."',
      '  export PATH="$HOME/.claude/bin:$PATH"',
      '  curl -fsSL https://claude.ai/install.sh | bash',
      '  echo ""',
      '  sudo touch /ready',
      'fi',
      '',
      'echo ""',
      'echo "=== DOCKER SANDBOX READY ==="',
      'echo "Workspace: $DOPAMINE_HOST_PATH -> /workspace"',
      'echo ""',
    ].join('\n') + '\n');

    // tar pipe required — docker build can't read host paths directly (snap Docker)
    console.log(`Building Docker image "${config.docker.baseImage}" (this may take a minute)...`);
    try {
      execSync(
        `tar -cf - -C '${tmpDir}' . | docker build`
        + ` --build-arg USERNAME='${username}'`
        + ` --build-arg USER_UID='${String(uid)}'`
        + ` -t '${config.docker.baseImage}' -`,
        { shell: '/bin/bash', stdio: 'inherit', timeout: 300_000 },
      );
    } catch (e: any) {
      throw new Error('Docker image build failed');
    }

    console.log(`Docker image "${config.docker.baseImage}" built successfully`);
  } finally {
    // Clean up temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** Get docker exec args for spawning a shell in a container */
export function execArgs(projectId: number, shell: string): string[] {
  const uid = String(os.userInfo().uid);
  return ['exec', '-it', '-u', uid, '-w', '/workspace', containerName(projectId), shell];
}

/** Remove a container (force, idempotent) */
export function removeContainer(projectId: number): void {
  const name = containerName(projectId);
  try {
    execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe' });
  } catch {}
}

/** List all dopamine containers (running + stopped), returns project IDs */
export function listAllContainers(): number[] {
  try {
    const out = execFileSync('docker', [
      'ps', '-a',
      '--filter', 'label=dopamine=true',
      '--format', '{{.Names}}',
    ], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (!out) return [];

    return out.split('\n')
      .map(name => parseInt(name.replace('dopamine-', ''), 10))
      .filter(id => !isNaN(id));
  } catch {
    return [];
  }
}
