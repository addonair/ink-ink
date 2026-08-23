/**
 * Package dist/ into a store-uploadable zip.
 *
 * Uses the platform's own zip tooling rather than adding a dependency:
 * PowerShell's Compress-Archive on Windows, `zip` elsewhere.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

import pkg from '../package.json' with { type: 'json' };

const dist = resolve('dist');
const outDir = resolve('release');
const out = resolve(outDir, `${pkg.name}-${pkg.version}.zip`);

if (!existsSync(dist)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
rmSync(out, { force: true });

if (process.platform === 'win32') {
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-Command', `Compress-Archive -Path "${dist}\\*" -DestinationPath "${out}"`],
    { stdio: 'inherit' },
  );
} else {
  execFileSync('zip', ['-r', out, '.'], { cwd: dist, stdio: 'inherit' });
}

console.log(`packaged ${out}`);
