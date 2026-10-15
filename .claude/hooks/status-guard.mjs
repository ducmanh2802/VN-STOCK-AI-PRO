#!/usr/bin/env node
// Stop hook that keeps .claude/project/STATUS.md in step with the repository.
//
// The fingerprint covers HEAD plus every dirty or untracked path with its size and mtime,
// excluding .claude/project/ itself. STATUS.md stores the fingerprint it was last reconciled
// with; when the two differ, the hook blocks the stop and asks Claude to update STATUS.md and
// then stamp it. A second stop in the same chain (stop_hook_active) is always allowed, so the
// hook can never loop.
//
//   node .claude/hooks/status-guard.mjs           hook mode: reads the Stop payload on stdin
//   node .claude/hooks/status-guard.mjs --stamp   write the current fingerprint into STATUS.md
//   node .claude/hooks/status-guard.mjs --print   print the current fingerprint
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const statusPath = join(root, '.claude', 'project', 'STATUS.md');
const MARK = /<!-- status-fingerprint: ([0-9a-f]+) -->/;

function git(args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function fingerprint() {
  const head = git(['rev-parse', 'HEAD']).trim();
  const tokens = git(['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '-uall', '-z']).split('\0');
  const entries = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.length < 4) continue;
    const xy = t.slice(0, 2);
    const path = t.slice(3);
    if (xy[0] === 'R' || xy[0] === 'C') i++; // -z puts the rename source in the next token
    if (path.startsWith('.claude/project/')) continue;
    let sig = 'missing';
    try {
      const s = statSync(join(root, path));
      sig = s.isFile() ? `${s.size}:${Math.floor(s.mtimeMs)}` : 'dir';
    } catch {
      // deleted in the working tree: 'missing' is its signature
    }
    entries.push(`${xy} ${path} ${sig}`);
  }
  entries.sort();
  return createHash('sha256').update(`${head}\n${entries.join('\n')}`).digest('hex').slice(0, 16);
}

const mode = process.argv[2];

if (mode === '--print') {
  console.log(fingerprint());
  process.exit(0);
}

if (mode === '--stamp') {
  if (!existsSync(statusPath)) {
    console.error(`STATUS.md not found: ${statusPath}`);
    process.exit(1);
  }
  const fp = fingerprint();
  const text = readFileSync(statusPath, 'utf8');
  const line = `<!-- status-fingerprint: ${fp} -->`;
  writeFileSync(statusPath, MARK.test(text) ? text.replace(MARK, line) : `${line}\n${text}`);
  console.log(`stamped ${fp}`);
  process.exit(0);
}

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  // no or malformed stdin: treat as a first stop
}
if (payload.stop_hook_active) process.exit(0);

// While .claude/opencode/delegate.ps1 runs OpenCode on this repo, editing STATUS.md would show up as an
// out-of-scope change in that run, so the request is deferred to the first stop after the run.
const sameDir = (a, b) => String(a).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() === String(b).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
const pidAlive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
for (const tmp of new Set([tmpdir(), process.env.TEMP, process.env.TMP, process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Temp')].filter(Boolean))) {
  try {
    const lock = JSON.parse(readFileSync(join(tmp, 'opencode-runs', 'ACTIVE-VN-STOCK.json'), 'utf8').replace(/^﻿/, ''));
    if (sameDir(lock.repo, root) && pidAlive(Number(lock.pid))) {
      process.stdout.write(JSON.stringify({ systemMessage: `STATUS.md check deferred: OpenCode task ${lock.task} is running (delegate.ps1 PID ${lock.pid}).` }));
      process.exit(0);
    }
  } catch {
    // no lock here, or unreadable: keep checking
  }
}

let fp;
try {
  fp = fingerprint();
} catch {
  process.exit(0); // git unavailable: never block on tooling problems
}
const exists = existsSync(statusPath);
const recorded = exists ? (readFileSync(statusPath, 'utf8').match(MARK) || [])[1] : undefined;
if (recorded === fp) process.exit(0);

const reason = exists
  ? 'The repository changed since .claude/project/STATUS.md was last reconciled (HEAD or uncommitted files differ). ' +
    'Before finishing: add a dated Changelog entry to STATUS.md (what changed, who changed it, why, and the verification ' +
    'evidence), refresh the "Current state" and "Open issues" sections it affects, then run ' +
    '`node .claude/hooks/status-guard.mjs --stamp`. Use `git status --short` and `git log -3 --oneline` to see what changed.'
  : '.claude/project/STATUS.md does not exist. Create it (Current state, Open issues, Delegations, Changelog), ' +
    'then run `node .claude/hooks/status-guard.mjs --stamp`.';
process.stdout.write(JSON.stringify({ decision: 'block', reason }));
