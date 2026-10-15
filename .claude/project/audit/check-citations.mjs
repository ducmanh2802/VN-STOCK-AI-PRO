// Checks an OpenCode audit report: required headings, and for every "### F<n>" finding that its
// Location `path:line` exists and every Evidence line appears verbatim within 10 lines of it.
//   node check-citations.mjs <repoRoot> <report.md>
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const [root, report] = process.argv.slice(2);
const md = readFileSync(isAbsolute(report) ? report : join(root, report), 'utf8').replace(/\r\n/g, '\n');
const HEADINGS = ['## Map', '### Purpose', '### Entry points', '### Key files', '### Wiring', '### Tests', '### Health', '### Gotchas', '## Findings', '## Not checked / unsure'];
const missingHeadings = HEADINGS.filter(h => !md.split('\n').some(l => l.trim().startsWith(h)));

const norm = s => s.replace(/\s+/g, ' ').trim();
// Finding sections may be "### F1 — ..." or "## F1 — ...", with the Location in a "Location:" line or in
// the heading itself; Windows-style paths are normalised.
const sections = md.split(/\n(?=#{2,3} F\d+\b)/).filter(s => /^#{2,3} F\d+\b/.test(s));
const results = [];
for (const s0 of sections) {
  const s = s0.replace(/`([^`]*)`/g, (m, p) => '`' + p.replace(/\\/g, '/') + '`');
  const id = s.match(/^#{2,3} (F\d+)/)[1];
  const head = s.split('\n')[0];
  const title = head.replace(/^#{2,3} F\d+\s*[—-]?\s*/, '').slice(0, 90);
  const loc = s.match(/Location:?\**:?\s*`([^`:]+):(\d+)(?:-\d+)?`/) || head.match(/`([^`:]+):(\d+)(?:-\d+)?`/);
  if (!loc) { results.push({ id, title, ok: false, why: 'no Location `path:line`' }); continue; }
  const [, path, lineStr] = loc;
  const line = Number(lineStr);
  const full = join(root, path);
  if (!existsSync(full)) { results.push({ id, title, ok: false, why: `file not found: ${path}` }); continue; }
  const lines = readFileSync(full, 'utf8').replace(/\r\n/g, '\n').split('\n');
  if (line < 1 || line > lines.length) { results.push({ id, title, ok: false, why: `line ${line} > ${lines.length} lines in ${path}` }); continue; }
  const ev = s.match(/Evidence\**:?\**[\s\S]*?```[a-z]*\n([\s\S]*?)```/);
  if (!ev) { results.push({ id, title, ok: false, why: 'no Evidence code block' }); continue; }
  // A leading "123: " line-number prefix is presentation, not part of the quote.
  const evLines = ev[1].split('\n').map(l => norm(l.replace(/^\s*\d+\s*[:|]\s?/, ''))).filter(l => l && !/^(\.\.\.|…|\/\/ \.\.\.)$/.test(l));
  if (!evLines.length) { results.push({ id, title, ok: false, why: 'empty Evidence block' }); continue; }
  const lo = Math.max(0, line - 11), hi = Math.min(lines.length, line + 10 + evLines.length);
  const window = lines.slice(lo, hi).map(norm);
  const missing = evLines.filter(e => !window.some(w => w.includes(e)));
  results.push({ id, title, loc: `${path}:${line}`, ok: missing.length === 0, why: missing.length ? `not found near the line: ${missing.slice(0, 2).map(m => JSON.stringify(m.slice(0, 80))).join(', ')}` : '' });
}
const bad = results.filter(r => !r.ok);
console.log(`report: ${report}`);
console.log(`headings missing: ${missingHeadings.length ? missingHeadings.join(', ') : 'none'}`);
console.log(`findings: ${results.length}, citations OK: ${results.length - bad.length}, FAILED: ${bad.length}`);
for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.id} ${r.loc || ''} ${r.title}${r.ok ? '' : '  -> ' + r.why}`);
process.exit(missingHeadings.length || bad.length ? 1 : 0);
