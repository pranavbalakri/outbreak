// Minimal post-build step: zip the Vite output directory so it can be uploaded
// to the Chrome Web Store. Uses the system `zip` binary (macOS + Linux ship it)
// so we don't carry a zip library as a dependency.

import { execSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname ?? '.', '..');
const dist = resolve(root, 'dist');
const out = resolve(root, 'dist/extension.zip');

if (!existsSync(dist)) {
  console.error(`No dist directory at ${dist}. Did \`vite build\` succeed?`);
  process.exit(1);
}

if (existsSync(out)) rmSync(out);
mkdirSync(resolve(out, '..'), { recursive: true });

execSync(`cd "${dist}" && zip -qr "${out}" . -x "extension.zip"`, {
  stdio: 'inherit',
});

console.log(`Wrote ${out}`);
