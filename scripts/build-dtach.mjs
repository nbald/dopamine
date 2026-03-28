import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dtachDir = path.join(projectRoot, 'vendor', 'dtach');
const dtachBinary = path.join(dtachDir, 'dtach');

// 1. Platform guard
if (process.platform === 'win32') {
  process.exit(0);
}

// 2. Up-to-date check
const sourceFiles = ['attach.c', 'master.c', 'main.c', 'dtach.h', 'configure', 'config.h.in', 'Makefile.in'];
if (fs.existsSync(dtachBinary)) {
  const binaryMtime = fs.statSync(dtachBinary).mtimeMs;
  const allOlder = sourceFiles.every(f => {
    const fp = path.join(dtachDir, f);
    return fs.existsSync(fp) && fs.statSync(fp).mtimeMs <= binaryMtime;
  });
  if (allOlder) {
    console.log('dtach: binary is up to date, skipping build');
    process.exit(0);
  }
}

// 3. Toolchain check
function hasCommand(cmd) {
  try {
    execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function hasSystemDtach() {
  try {
    execFileSync('dtach', ['--help'], { stdio: 'pipe' });
    return true;
  } catch (e) {
    return e.status !== 127;
  }
}

if (!hasCommand('cc') || !hasCommand('make')) {
  if (hasSystemDtach()) {
    console.log('dtach: no C compiler or make found, will use system-installed dtach');
    process.exit(0);
  }
  console.error(`dtach: build failed — no C toolchain and no system dtach found.
Install one of:
  - Build tools:   apt install build-essential  (Debian/Ubuntu)
  - dtach binary:  apt install dtach            (Debian/Ubuntu)
                   brew install dtach           (macOS)
                   pkg_add dtach               (OpenBSD)`);
  process.exit(1);
}

// 4. Ensure configure is executable
try {
  fs.chmodSync(path.join(dtachDir, 'configure'), 0o755);
} catch {}

// 5. Configure
// execSync is used intentionally here: ./configure is a vendored build script,
// not user input. Shell execution is required for the autoconf-generated script.
try {
  console.log('dtach: running configure...');
  execSync('./configure', { cwd: dtachDir, stdio: 'pipe' });
} catch (e) {
  console.warn('dtach: configure failed, skipping build');
  if (e.stderr) console.warn(e.stderr.toString());
  process.exit(0);
}

// 6. Build
try {
  console.log('dtach: building...');
  execSync('make', { cwd: dtachDir, stdio: 'pipe' });
  console.log('dtach: build successful');
} catch (e) {
  console.warn('dtach: compilation failed, skipping');
  if (e.stderr) console.warn(e.stderr.toString());
  process.exit(0);
}
