// Copies the Breaklog logo into the three icon sizes Manifest V3 references.
// Chrome downscales a single source PNG to whatever size it needs, so we ship
// the full-resolution logo for each slot — crisper than a hand-plotted bitmap.
//
// Runs before `vite build`. Re-run any time the source logo changes.

import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname ?? '.', '..');
const iconsDir = resolve(root, 'src/icons');
const source = resolve(root, '../web/public/breaklog-logo.png');

mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const dest = resolve(iconsDir, `icon${size}.png`);
  copyFileSync(source, dest);
  console.log(`Wrote ${dest}`);
}
