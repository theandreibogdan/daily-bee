// Copies the design-system token CSS (source of truth: .claude/skills/dailybee-design)
// into packages/ui so the app always ships the exact tokens the design system defines.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, '.claude', 'skills', 'dailybee-design');
const dst = join(root, 'packages', 'ui', 'src', 'styles');

mkdirSync(join(dst, 'tokens'), { recursive: true });
for (const f of readdirSync(join(src, 'tokens'))) {
  copyFileSync(join(src, 'tokens', f), join(dst, 'tokens', f));
  console.log('tokens/' + f);
}
copyFileSync(join(src, 'styles.css'), join(dst, 'tokens.css'));
console.log('styles.css -> tokens.css');
