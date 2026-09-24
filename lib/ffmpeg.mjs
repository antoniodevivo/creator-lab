// FFmpeg and ffprobe come from npm (@ffmpeg-installer/ffmpeg, @ffprobe-installer/ffprobe), which ship a binary
// per platform. pnpm-workspace.yaml installs the Windows and Linux ones side by side, so the same checkout works
// from Windows and from WSL2. If the bundled binary is missing for this platform, the command on PATH is used.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);

function bundled(pkg, name) {
  try {
    const { path } = require(pkg);
    if (path && existsSync(path)) return path;
  } catch { /* unsupported platform or optional binary not installed */ }
  return name;
}

export const FFMPEG = bundled('@ffmpeg-installer/ffmpeg', 'ffmpeg');
export const FFPROBE = bundled('@ffprobe-installer/ffprobe', 'ffprobe');
