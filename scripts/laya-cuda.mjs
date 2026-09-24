// Laya on an NVIDIA GPU (Linux or WSL2). No sudo needed.
//
//   node scripts/laya-cuda.mjs setup   installs onnxruntime-node's CUDA provider and, when `uv` is on PATH,
//                                      the NVIDIA runtime libraries it links against under ~/.local/laya-cuda
//   node scripts/laya-cuda.mjs start   starts the server with those libraries on LD_LIBRARY_PATH, so
//                                      "Laya · GPU (CUDA)" appears in New analysis
//
// onnxruntime-node 1.30's CUDA provider links against CUDA 13 (cudart, cuBLAS) and cuRAND 10; it does not need
// cuDNN for Laya. A system-wide CUDA 13 install works too; `start` then adds nothing.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { onnxRuntimeDir } from '../lib/laya.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENV = join(homedir(), '.local', 'laya-cuda');
const WHEELS = ['nvidia-cuda-runtime>=13,<14', 'nvidia-cublas>=13,<14', 'nvidia-curand-cu12'];

function fail(message) { console.error(message); process.exit(1); }
if (process.platform !== 'linux' || process.arch !== 'x64') fail('Laya on CUDA needs Linux x64 (on Windows, run this inside WSL2).');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} failed`);
}

// Directories holding the pip-installed NVIDIA libraries (site-packages/nvidia/<package>/lib).
function wheelLibDirs() {
  const lib = join(VENV, 'lib');
  if (!existsSync(lib)) return [];
  const dirs = [];
  for (const py of readdirSync(lib)) {
    const nvidia = join(lib, py, 'site-packages', 'nvidia');
    if (!existsSync(nvidia)) continue;
    for (const pkg of readdirSync(nvidia)) if (existsSync(join(nvidia, pkg, 'lib'))) dirs.push(join(nvidia, pkg, 'lib'));
  }
  return dirs;
}

const command = process.argv[2];
if (command === 'setup') {
  const ort = onnxRuntimeDir();
  if (!ort) fail('onnxruntime-node not found. Run npm install first.');
  console.log('== onnxruntime-node CUDA provider');
  run(process.execPath, [join(ort, 'script', 'install.js'), '--onnxruntime-node-install=cuda12'], { cwd: ort });
  if (spawnSync('uv', ['--version'], { stdio: 'ignore' }).status === 0) {
    console.log(`== NVIDIA CUDA runtime libraries in ${VENV}`);
    if (!existsSync(VENV)) run('uv', ['venv', '-q', '-p', '3.12', VENV]);
    run('uv', ['pip', 'install', '-q', '-p', join(VENV, 'bin', 'python'), ...WHEELS]);
  } else {
    console.log('uv not found: install CUDA 13 (cudart, cuBLAS) system-wide, or install uv (https://docs.astral.sh/uv/) and rerun setup.');
  }
  console.log('Done. Start the server with: node scripts/laya-cuda.mjs start');
} else if (command === 'start') {
  const dirs = wheelLibDirs();
  const env = { ...process.env, LD_LIBRARY_PATH: [...dirs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') };
  console.log(dirs.length ? `Using CUDA libraries from ${VENV}` : 'Using system CUDA libraries');
  const child = spawn(process.execPath, ['--env-file-if-exists=.env', 'server.mjs'], { cwd: ROOT, env, stdio: 'inherit' });
  child.on('exit', code => process.exit(code ?? 0));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
} else {
  fail('Usage: node scripts/laya-cuda.mjs setup|start');
}
