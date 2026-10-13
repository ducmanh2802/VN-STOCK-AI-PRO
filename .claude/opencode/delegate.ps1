<#
  delegate.ps1 - Claude Code -> OpenCode bounded-task runner with evidence capture.
  Verified against OpenCode CLI 1.19.0 (`opencode run --help`, 2026-10-13).

  Runs ONE OpenCode task (never two at once, never with --auto). It snapshots the working
  tree, runs `opencode run`, captures exit code, JSON events, stderr log, provider and model,
  detects every changed file (git status + SHA-256 + mtime scan + watched dirs outside the
  repo), checks them against the ALLOWED list, saves per-file diffs that show only the
  OpenCode delta, optionally runs typecheck / targeted tests, and writes result.json and
  summary.md into the run directory.

  It never commits, reverts, stashes, deletes or auto-approves anything.

  Exit codes:
    0 = REVIEW_REQUIRED  executed, in scope, verification ok. Claude reviews diff/ and decides PASS or FAIL.
    1 = FAIL             scope violation, verification failure, or OpenCode reported FAILED / PARTIAL / no report.
    2 = BLOCKED          guard refused, start failure, timeout, provider / auth / HTTP error, no verifiable result.

  Example (from the repo root):
    powershell -NoProfile -ExecutionPolicy Bypass -File .claude\opencode\delegate.ps1 -TaskId T-001
      -Brief C:\path\to\brief.md -Allowed src\a.ts,src\__tests__\a.test.ts
      -Typecheck -TscBaseline 117 -VerifyTests src\__tests__\a.test.ts
#>
[CmdletBinding()]
param(
  [string]$TaskId = '',
  [string]$Brief = '',
  [string[]]$Allowed = @(),
  [string]$Agent = 'build',
  [string]$Message = 'Execute the attached task brief exactly. Follow AGENTS.md.',
  [string]$Session = '',
  [string]$Model = '',          # diagnostics only; real work uses the configured model unless the user approves
  [string]$ExpectText = '',     # smoke runs: require this text in the reply instead of an AGENTS.md section 7 report
  [int]$TimeoutSec = 1800,
  [string[]]$VerifyTests = @(),
  [switch]$Typecheck,
  [int]$TscBaseline = -1,
  [switch]$AllowDirty,          # only after the user confirmed ownership of dirty ALLOWED files
  [switch]$DryRun,              # run every guard, print the OpenCode command, exit 3 without calling OpenCode
  [string]$Repo = '',
  [string]$OutRoot = ''
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$script:Utf8 = New-Object Text.UTF8Encoding $false

# ---------------------------------------------------------------- helpers
# Emits one string per entry (never a nested array). `powershell -File` passes "a,b" as one string, so split it.
function Split-List([string[]]$items) {
  foreach ($i in $items) {
    if (-not $i) { continue }
    foreach ($p in ($i -split '[,;]')) { $q = $p.Trim(); if ($q) { $q } }
  }
}
function ConvertTo-RelPath([string]$p) {
  $q = $p.Trim().Trim('"').Replace('\', '/')
  while ($q.StartsWith('./')) { $q = $q.Substring(2) }
  return $q
}
function ConvertTo-QuotedArg([string]$s) { if ($s -match '\s') { return '"' + $s + '"' } return $s }
function Write-Utf8([string]$path, [string]$text) { [IO.File]::WriteAllText($path, $text, $script:Utf8) }
function Get-Sha([string]$full) {
  if (Test-Path -LiteralPath $full -PathType Leaf) { return (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash }
  return $null
}

# AGENTS.md section 2 plus the name-based denies in opencode.json. An ALLOWED entry matching any of these is refused.
$script:ProtectedPatterns = @(
  '^src/lib/trading/', '^src/services/trading/', '^src/services/market/providers/',
  '^src/db/', '^drizzle/', '^drizzle\.config\.ts$', '^scripts/',
  '(^|/)package\.json$', '-lock\.json$', '\.lock$', '^tsconfig[^/]*\.json$',
  '^vite\.config\.ts$', '^vitest\.config\.ts$', '^server\.ts$', '^dockerfile$', '^\.dockerignore$',
  '^render\.yaml$', '^firebase', '^agents\.md$', '^claude\.md$', '^opencode\.jsonc?$',
  '^\.opencode/', '^\.clinerules/', '^\.claude/', '^\.agents/', '^\.git', '^\.vscode/', '(^|/)\.env',
  '(riskguard|tradingdatavalidator|marketdataintegrityguard|financialconservation|riskmanager|positionsizer|paperbroker|tradingengine|paperorderriskboundary)'
)
function Test-Protected([string]$rel) {
  $l = $rel.ToLowerInvariant()
  foreach ($pat in $script:ProtectedPatterns) { if ($l -match $pat) { return $true } }
  return $false
}

function Get-GitStatusMap([string]$repo) {
  $raw = & git -C $repo -c core.quotepath=false status --porcelain=v1 -uall -z
  if ($LASTEXITCODE -ne 0) { throw "git status failed in $repo" }
  $map = @{}
  if ($null -eq $raw) { return $map }
  $tokens = ([string]::Join("`n", @($raw))).Split([char]0)
  $i = 0
  while ($i -lt $tokens.Length) {
    $t = $tokens[$i]; $i++
    if ($t.Length -lt 4) { continue }
    $xy = $t.Substring(0, 2); $path = $t.Substring(3)
    $map[$path] = $xy
    if (($xy[0] -eq 'R' -or $xy[0] -eq 'C') -and $i -lt $tokens.Length) { $map[$tokens[$i]] = 'R<'; $i++ }
  }
  return $map
}

function Get-ModifiedSince([string]$root, [DateTime]$sinceUtc) {
  $skip = @('.git', 'node_modules')
  $found = New-Object 'System.Collections.Generic.List[string]'
  $stack = New-Object 'System.Collections.Generic.Stack[string]'
  $stack.Push($root)
  while ($stack.Count -gt 0) {
    $dir = $stack.Pop()
    try { $files = [IO.Directory]::GetFiles($dir) } catch { continue }
    foreach ($f in $files) { try { if ([IO.File]::GetLastWriteTimeUtc($f) -gt $sinceUtc) { $found.Add($f) } } catch { } }
    try { $dirs = [IO.Directory]::GetDirectories($dir) } catch { continue }
    foreach ($d in $dirs) {
      if ($skip -contains [IO.Path]::GetFileName($d)) { continue }
      try { if (([IO.File]::GetAttributes($d) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue } } catch { continue }
      $stack.Push($d)
    }
  }
  return ,$found.ToArray()
}

function Get-DirHashes([string[]]$dirs) {
  $h = @{}
  foreach ($d in $dirs) {
    if (-not $d -or -not (Test-Path -LiteralPath $d)) { continue }
    Get-ChildItem -LiteralPath $d -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
      try { $h[$_.FullName] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash } catch { }
    }
  }
  return $h
}

function New-Snapshot([string]$repo, [string[]]$extraRel, [string[]]$watchDirs) {
  $status = Get-GitStatusMap $repo
  $hashes = @{}
  foreach ($rel in (@($status.Keys) + @($extraRel))) {
    if ($rel -and -not $hashes.ContainsKey($rel)) { $hashes[$rel] = Get-Sha (Join-Path $repo $rel) }
  }
  return [pscustomobject]@{ Status = $status; Hashes = $hashes; External = (Get-DirHashes $watchDirs) }
}

function Save-PreCopies($snapshot, [string]$repo, [string]$preDir) {
  foreach ($rel in @($snapshot.Hashes.Keys)) {
    $src = Join-Path $repo $rel
    if (Test-Path -LiteralPath $src -PathType Leaf) {
      $dst = Join-Path $preDir $rel
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
      Copy-Item -LiteralPath $src -Destination $dst -Force
    }
  }
}

function Compare-Snapshot($pre, $post, [string]$repo, [DateTime]$sinceUtc) {
  $changed = [ordered]@{}
  $keys = @(@($pre.Status.Keys) + @($post.Status.Keys) + @($pre.Hashes.Keys)) | Sort-Object -Unique
  foreach ($k in $keys) {
    $a = $pre.Status[$k]; $b = $post.Status[$k]
    if ($a -ne $b) { $changed[$k] = "git status '$a' -> '$b'"; continue }
    if ($pre.Hashes.ContainsKey($k) -and $pre.Hashes[$k] -ne (Get-Sha (Join-Path $repo $k))) { $changed[$k] = 'content changed' }
  }
  $prefix = $repo.TrimEnd('\') + '\'
  foreach ($f in (Get-ModifiedSince $repo $sinceUtc)) {
    $rel = $f.Substring($prefix.Length).Replace('\', '/')
    if (-not $changed.Contains($rel)) { $changed[$rel] = 'written during the run (mtime)' }
  }
  $ext = [ordered]@{}
  foreach ($k in (@(@($pre.External.Keys) + @($post.External.Keys)) | Sort-Object -Unique)) {
    if ($pre.External[$k] -ne $post.External[$k]) { $ext[$k] = 'outside the repo: created, changed or deleted' }
  }
  return [pscustomobject]@{ Repo = $changed; External = $ext }
}

function Save-Diffs([string[]]$changedKeys, [string]$repo, [string]$preDir, [string]$diffDir, $preStatus) {
  New-Item -ItemType Directory -Force -Path $diffDir | Out-Null
  foreach ($rel in $changedKeys) {
    $safe = ($rel -replace '[\\/:*?"<>| ]', '_')
    $cur = Join-Path $repo $rel
    $preCopy = Join-Path $preDir $rel
    $target = Join-Path $diffDir ($safe + '.diff')
    $curExists = Test-Path -LiteralPath $cur -PathType Leaf
    if (Test-Path -LiteralPath $preCopy -PathType Leaf) {
      if ($curExists) { Write-Utf8 $target ((& git diff --no-index --no-color -- $preCopy $cur) | Out-String) }
      else { Write-Utf8 $target "DELETED during the run. Pre-run copy: $preCopy" }
      continue
    }
    $tracked = [bool](& git -C $repo ls-files -- $rel)
    if ($tracked -and -not $preStatus.ContainsKey($rel)) { Write-Utf8 $target ((& git -C $repo diff --no-color -- $rel) | Out-String) }
    elseif ($curExists) {
      Copy-Item -LiteralPath $cur -Destination (Join-Path $diffDir ($safe + '.new')) -Force
      Write-Utf8 $target "NEW file (or ignored file) without a pre-run copy; full content saved as $safe.new"
    }
    else { Write-Utf8 $target 'Path no longer exists and had no pre-run copy.' }
  }
}

function Invoke-Logged([string]$commandLine, [string]$outFile, [string]$cwd, [int]$timeoutSec) {
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $env:ComSpec
  $psi.Arguments = '/d /s /c "' + $commandLine + ' <NUL 1>' + (ConvertTo-QuotedArg $outFile) + ' 2>&1"'
  $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true; $psi.WorkingDirectory = $cwd
  $p = [Diagnostics.Process]::Start($psi)
  if (-not $p.WaitForExit($timeoutSec * 1000)) { & taskkill.exe /T /F /PID $p.Id | Out-Null; $p.WaitForExit(); return -999 }
  return $p.ExitCode
}

# Dot-sourced (self-test): expose the functions only.
if ($MyInvocation.InvocationName -eq '.') { return }

# ---------------------------------------------------------------- guards (every refusal exits 2 = BLOCKED)
function Stop-Blocked([string]$why) { Write-Output "VERDICT: BLOCKED (guard) - $why"; exit 2 }

if ($TaskId -notmatch '^[A-Za-z0-9._-]{1,64}$') { Stop-Blocked 'TaskId missing or invalid (allowed: letters, digits, . _ -)' }
if (-not $Brief -or -not (Test-Path -LiteralPath $Brief -PathType Leaf)) { Stop-Blocked "brief file not found: $Brief" }
if ($Message -match '["&|<>^%!\r\n]') { Stop-Blocked 'message contains characters that are unsafe on a cmd.exe command line' }
foreach ($v in @($Agent, $Model, $Session)) { if ($v -and $v -notmatch '^[A-Za-z0-9._/:-]+$') { Stop-Blocked "unsafe agent/model/session value: $v" } }
if (-not $Repo) { $Repo = Join-Path $PSScriptRoot '..\..' }
$Repo = [IO.Path]::GetFullPath($Repo).TrimEnd('\')
if (-not (Test-Path -LiteralPath (Join-Path $Repo '.git'))) { Stop-Blocked "not a git repository: $Repo" }
if (-not $OutRoot) { $OutRoot = Join-Path $env:TEMP 'opencode-runs' }
if (Get-Process -Name 'opencode*' -ErrorAction SilentlyContinue) { Stop-Blocked 'another OpenCode process is running; never run two at once' }
if (-not (Get-Command opencode.cmd -ErrorAction SilentlyContinue)) { Stop-Blocked 'opencode.cmd is not on PATH' }

$allowedList = @(Split-List $Allowed | ForEach-Object { ConvertTo-RelPath $_ } | Where-Object { $_ })
foreach ($a in $allowedList) {
  if ($a -match '(^/|^[A-Za-z]:|(^|/)\.\.(/|$)|[*?])') { Stop-Blocked "ALLOWED entries must be exact repo-relative paths: $a" }
  if (Test-Protected $a) { Stop-Blocked "ALLOWED entry is a protected path (AGENTS.md section 2): $a" }
}
$testList = @(Split-List $VerifyTests | ForEach-Object { ConvertTo-RelPath $_ } | Where-Object { $_ })
foreach ($t in $testList) {
  if ($t -match '(^/|^[A-Za-z]:|(^|/)\.\.(/|$)|["&|<>^%!])') { Stop-Blocked "unsafe test path: $t" }
  if ($t -notmatch '\.test\.tsx?$' -and $t -notmatch '/__tests__/?$') { Stop-Blocked "VerifyTests entries must be test files or __tests__ folders (the full suite needs user approval): $t" }
}

$guardStatus = Get-GitStatusMap $Repo
foreach ($a in $allowedList) {
  if ($guardStatus.ContainsKey($a) -and -not $AllowDirty) {
    Stop-Blocked "ALLOWED file '$a' has uncommitted work ($($guardStatus[$a])). Pass -AllowDirty only after the user confirmed ownership."
  }
}
if ($DryRun) {
  Write-Output ('DRYRUN agent=' + $Agent + ' allowed=[' + ($allowedList -join ', ') + '] tests=[' + ($testList -join ', ') + ']')
  Write-Output 'VERDICT: DRYRUN (all guards passed; OpenCode was not called)'
  exit 3
}

# ---------------------------------------------------------------- preflight snapshot
$run = Join-Path $OutRoot ($TaskId + '-' + (Get-Date).ToString('yyyyMMdd-HHmmss'))
$preDir = Join-Path $run 'pre'; $diffDir = Join-Path $run 'diff'; $verDir = Join-Path $run 'verify'
New-Item -ItemType Directory -Force -Path $run, $preDir, $diffDir, $verDir | Out-Null
$briefCopy = Join-Path $run 'brief.md'
Copy-Item -LiteralPath $Brief -Destination $briefCopy -Force
Write-Output "RUN DIR: $run"

$branch = (& git -C $Repo rev-parse --abbrev-ref HEAD) | Select-Object -First 1
$head = (& git -C $Repo rev-parse HEAD) | Select-Object -First 1
$ocVersion = (& opencode.cmd --version) | Select-Object -First 1
$watch = @((Join-Path $env:USERPROFILE '.claude\skills'), (Join-Path $env:USERPROFILE '.agents'))
$pre = New-Snapshot $Repo $allowedList $watch
Save-PreCopies $pre $Repo $preDir

# ---------------------------------------------------------------- run OpenCode (verified 1.19 syntax; message before -f)
$stdout = Join-Path $run 'stdout.jsonl'; $stderr = Join-Path $run 'stderr.log'
$ocArgs = @('run', ('"' + $Message + '"'), '--dir', (ConvertTo-QuotedArg $Repo), '--agent', $Agent, '--format', 'json', '--title', $TaskId)
if ($Model) { $ocArgs += @('-m', $Model) }
if ($Session) { $ocArgs += @('-s', $Session) }
$ocArgs += @('--print-logs', '--log-level', 'INFO', '-f', (ConvertTo-QuotedArg $briefCopy))
$commandText = 'opencode.cmd ' + ($ocArgs -join ' ')
$psi = New-Object Diagnostics.ProcessStartInfo
$psi.FileName = $env:ComSpec
$psi.Arguments = '/d /s /c "' + $commandText + ' <NUL 1>' + (ConvertTo-QuotedArg $stdout) + ' 2>' + (ConvertTo-QuotedArg $stderr) + '"'
$psi.UseShellExecute = $false; $psi.CreateNoWindow = $true; $psi.WorkingDirectory = $Repo
$sinceUtc = [DateTime]::UtcNow
$timedOut = $false; $exitCode = $null; $startError = $null
try {
  $proc = [Diagnostics.Process]::Start($psi)
  if (-not $proc.WaitForExit($TimeoutSec * 1000)) { $timedOut = $true; & taskkill.exe /T /F /PID $proc.Id | Out-Null; $proc.WaitForExit() }
  $exitCode = $proc.ExitCode
} catch { $startError = $_.Exception.Message }
$finishedUtc = [DateTime]::UtcNow
$leftover = @(Get-Process -Name 'opencode*' -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })

# ---------------------------------------------------------------- post snapshot + scope
$post = New-Snapshot $Repo $allowedList $watch
$cmp = Compare-Snapshot $pre $post $Repo $sinceUtc
$changedRows = @()
foreach ($k in @($cmp.Repo.Keys)) {
  $isAllowed = [bool]($allowedList | Where-Object { $_ -ieq $k })
  $changedRows += [pscustomobject]@{ path = $k; reason = $cmp.Repo[$k]; allowed = $isAllowed }
}
$outOfScope = @($changedRows | Where-Object { -not $_.allowed } | ForEach-Object { $_.path }) + @($cmp.External.Keys)
Save-Diffs @($cmp.Repo.Keys) $Repo $preDir $diffDir $pre.Status

# ---------------------------------------------------------------- events, provider, model
$events = @(); $badLines = 0
if (Test-Path -LiteralPath $stdout) {
  foreach ($line in [IO.File]::ReadAllLines($stdout)) {
    $t = $line.Trim(); if (-not $t) { continue }
    try { $events += ,($t | ConvertFrom-Json) } catch { $badLines++ }
  }
}
$sessionId = $null; $texts = @(); $errorEvents = @(); $toolCounts = @{}; $toolErrors = @()
foreach ($e in $events) {
  if ($e.sessionID) { $sessionId = [string]$e.sessionID }
  switch ([string]$e.type) {
    'text' { if ($e.part -and $e.part.text) { $texts += [string]$e.part.text } }
    'tool_use' {
      $name = [string]$e.part.tool; if (-not $name) { $name = '?' }
      $toolCounts[$name] = 1 + [int]$toolCounts[$name]
      if ($e.part.state -and [string]$e.part.state.status -eq 'error') { $toolErrors += ('{0}: {1}' -f $name, [string]$e.part.state.error) }
    }
    'error' {
      $n = ''; $code = ''; $msg = ''
      if ($e.error) { $n = [string]$e.error.name; if ($e.error.data) { $code = [string]$e.error.data.statusCode; $msg = [string]$e.error.data.message } }
      $errorEvents += (('{0} {1} {2}' -f $n, $code, $msg).Trim())
    }
  }
}
$providerId = $null; $modelId = $null; $providerErrors = @()
if (Test-Path -LiteralPath $stderr) {
  foreach ($l in [IO.File]::ReadAllLines($stderr)) {
    if ($l -match 'message=stream providerID=(\S+) modelID=(\S+)') { $providerId = $Matches[1]; $modelId = $Matches[2] }
    if ($l -match 'level=ERROR') {
      $r = $l -replace '(?i)(password|token|api[_-]?key|authorization)=\S+', '$1=<redacted>'
      $providerErrors += $r.Substring(0, [Math]::Min(400, $r.Length))
    }
  }
}
$finalText = ''; if ($texts.Count -gt 0) { $finalText = $texts[$texts.Count - 1] }
Write-Utf8 (Join-Path $run 'assistant-text.txt') ($texts -join "`n`n----`n`n")
$ocStatus = $null
if ($finalText -match '(?im)^\W*STATUS:\W*(PASS|PARTIAL|BLOCKED|FAILED)\b') { $ocStatus = $Matches[1].ToUpperInvariant() }

# ---------------------------------------------------------------- execution classification
$reasons = New-Object 'System.Collections.Generic.List[string]'
if ($startError) { $reasons.Add("failed to start OpenCode: $startError") }
if ($timedOut) { $reasons.Add("timed out after $TimeoutSec s; process tree killed") }
if ($null -ne $exitCode -and $exitCode -ne 0) { $reasons.Add("opencode exit code $exitCode") }
foreach ($x in $errorEvents) { $reasons.Add("error event: $x") }
foreach ($x in ($providerErrors | Select-Object -First 3)) { $reasons.Add("ERROR log line: $x") }
if (-not $sessionId) { $reasons.Add('no session id in the JSON events') }
if (-not $finalText) { $reasons.Add('no assistant text: no verifiable result') }
$execution = 'EXECUTED'; if ($reasons.Count -gt 0) { $execution = 'BLOCKED' }

# ---------------------------------------------------------------- verification (Claude-side; only after a real execution)
$verification = [ordered]@{ typecheck = $null; tests = $null; changed_during_verification = @() }
$verifyFailed = $false
if ($execution -eq 'EXECUTED' -and ($Typecheck -or $testList.Count -gt 0)) {
  $verifyStartUtc = [DateTime]::UtcNow
  $preVerify = New-Snapshot $Repo $allowedList @()
  if ($Typecheck) {
    $f = Join-Path $verDir 'tsc.txt'
    $code = Invoke-Logged 'npx tsc --noEmit' $f $Repo 900
    $count = @(Select-String -LiteralPath $f -Pattern 'error TS\d+').Count
    $newErrors = ($TscBaseline -ge 0 -and $count -gt $TscBaseline)
    if ($newErrors -or ($code -ne 0 -and $count -eq 0)) { $verifyFailed = $true }
    $verification.typecheck = [ordered]@{ command = 'npx tsc --noEmit'; exit = $code; errors = $count; baseline = $TscBaseline; new_errors = $newErrors; log = $f }
  }
  if ($testList.Count -gt 0) {
    $f = Join-Path $verDir 'vitest.txt'
    $line = 'npx vitest run ' + (($testList | ForEach-Object { ConvertTo-QuotedArg $_ }) -join ' ')
    $code = Invoke-Logged $line $f $Repo 1800
    $summary = @(Select-String -LiteralPath $f -Pattern '^\s*(Test Files|Tests)\s' | ForEach-Object { ($_.Line -replace '\x1b\[[0-9;]*m', '').Trim() })
    if ($code -ne 0) { $verifyFailed = $true }
    $verification.tests = [ordered]@{ command = $line; exit = $code; summary = $summary; log = $f }
  }
  $cmpVerify = Compare-Snapshot $preVerify (New-Snapshot $Repo $allowedList @()) $Repo $verifyStartUtc
  $verification.changed_during_verification = @($cmpVerify.Repo.Keys)
  if ($cmpVerify.Repo.Count -gt 0) { $verifyFailed = $true }
}

# ---------------------------------------------------------------- machine verdict (Claude makes the final call)
$verdict = 'REVIEW_REQUIRED'
if ($execution -eq 'BLOCKED') { $verdict = 'BLOCKED' }
elseif ($ocStatus -eq 'BLOCKED') { $verdict = 'BLOCKED'; $reasons.Add('OpenCode reported STATUS: BLOCKED') }
else {
  if ($outOfScope.Count -gt 0) { $verdict = 'FAIL'; $reasons.Add('scope violation: ' + ($outOfScope -join ', ')) }
  if ($verifyFailed) { $verdict = 'FAIL'; $reasons.Add('verification failed (see verify/)') }
  if ($ExpectText) {
    if (-not $finalText.Contains($ExpectText)) { $verdict = 'FAIL'; $reasons.Add("reply does not contain the expected text '$ExpectText'") }
  } elseif (-not $ocStatus) { $verdict = 'FAIL'; $reasons.Add('final reply has no STATUS line (AGENTS.md section 7)') }
  elseif ($ocStatus -ne 'PASS') { $verdict = 'FAIL'; $reasons.Add("OpenCode reported STATUS: $ocStatus") }
}
if ($leftover.Count -gt 0) { $reasons.Add('OpenCode processes still running after the run: ' + ($leftover -join ', ')) }

$result = [ordered]@{
  task_id = $TaskId; run_dir = $run; repo = $Repo; branch = $branch; head = $head
  started_utc = $sinceUtc.ToString('o'); finished_utc = $finishedUtc.ToString('o')
  duration_s = [int]($finishedUtc - $sinceUtc).TotalSeconds
  opencode_version = $ocVersion; agent = $Agent; model_override = $Model; command = $commandText
  exit_code = $exitCode; timed_out = $timedOut; session_id = $sessionId
  provider_id = $providerId; model_id = $modelId
  error_events = $errorEvents; error_log_lines = @($providerErrors | Select-Object -First 5)
  tool_calls = $toolCounts; tool_errors = $toolErrors; unparsed_stdout_lines = $badLines
  opencode_reported_status = $ocStatus
  allowed = $allowedList; changed_files = $changedRows; external_changes = @($cmp.External.Keys); out_of_scope = $outOfScope
  verification = $verification; execution = $execution; machine_verdict = $verdict; reasons = @($reasons)
}
Write-Utf8 (Join-Path $run 'result.json') ($result | ConvertTo-Json -Depth 6)

$changedText = 'none'
if ($changedRows.Count -gt 0) {
  $changedText = (@($changedRows | ForEach-Object { if ($_.allowed) { "$($_.path) [allowed]" } else { "$($_.path) [OUT OF SCOPE]" } }) -join '; ')
}
$externalText = 'none'; if ($cmp.External.Count -gt 0) { $externalText = (@($cmp.External.Keys) -join '; ') }
$md = @()
$md += "# OpenCode delegation $TaskId"
$md += ''
$md += "- Machine verdict: $verdict (final PASS / FAIL / BLOCKED is decided by Claude after reviewing diff/ and verify/)"
$md += "- Execution: $execution | exit code: $exitCode | timed out: $timedOut | duration: $($result.duration_s) s"
$md += "- OpenCode $ocVersion | agent: $Agent | provider/model: $providerId/$modelId | session: $sessionId"
$md += "- OpenCode self-reported STATUS: $ocStatus"
$md += "- Changed files: $changedText"
$md += "- Changes outside the repo: $externalText"
if ($verification.typecheck) { $md += "- tsc: $($verification.typecheck.errors) errors (baseline $TscBaseline), exit $($verification.typecheck.exit)" }
if ($verification.tests) { $md += "- vitest: exit $($verification.tests.exit) | " + ($verification.tests.summary -join ' | ') }
$md += ''
$md += '## Reasons'
if ($reasons.Count -gt 0) { foreach ($r in $reasons) { $md += "- $r" } } else { $md += '- none' }
Write-Utf8 (Join-Path $run 'summary.md') ($md -join "`r`n")

Write-Output ($md -join "`r`n")
Write-Output "VERDICT: $verdict"
if ($verdict -eq 'BLOCKED') { exit 2 } elseif ($verdict -eq 'FAIL') { exit 1 } else { exit 0 }
