// Checks a PROJECT_MAP draft: required headings, the number of ### subsystem sections, and that every
// backticked repo path exists unless its line says GONE.  node check-map-paths.mjs <repoRoot> <draft.md>
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [root, draft] = process.argv.slice(2);
const md = readFileSync(join(root, draft), 'utf8').replace(/\r\n/g, '\n');
const required = ['## What this is', '## Commands', '## Architecture at a glance', '## Subsystems', '## Cross-cutting gotchas'];
const missing = required.filter(h => !md.split('\n').some(l => l.trim().startsWith(h)));
const subsections = md.split('\n').filter(l => /^### /.test(l));
const bad = [];
let checked = 0;
for (const [i, line] of md.split('\n').entries()) {
  for (const m of line.matchAll(/`([^`\s]+)`/g)) {
    let p = m[1].replace(/\\/g, '/').replace(/:\d+(-\d+)?$/, '').replace(/^\.\//, '');
    if (!/^(src|server\.ts|scripts|drizzle|docs|tests|index\.html|package\.json|vite\.config|tsconfig|\.claude|AGENTS\.md|CLAUDE\.md|opencode\.json)/.test(p)) continue;
    if (/[*{}<>]/.test(p)) continue; // globs and placeholders
    checked++;
    if (!existsSync(join(root, p.replace(/\/$/, ''))) && !/GONE|deleted|missing/i.test(line)) bad.push(`line ${i + 1}: ${p}`);
  }
}
console.log(`headings missing: ${missing.length ? missing.join(', ') : 'none'}`);
console.log(`### subsections: ${subsections.length}`);
console.log(`paths checked: ${checked}, nonexistent and not marked GONE: ${bad.length}`);
for (const b of bad.slice(0, 40)) console.log('  ' + b);
process.exit(missing.length || bad.length ? 1 : 0);
