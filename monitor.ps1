param(
    [string]$LogFile = "D:\dtf-decoration\monitoring.log"
)

$ErrorActionPreference = "Continue"
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$hostname = $env:COMPUTERNAME

function Write-Log($section, $lines) {
    "`n[$stamp] ===== $section =====" | Add-Content -LiteralPath $LogFile
    foreach ($line in $lines) { $line | Add-Content -LiteralPath $LogFile }
}

# ---------- 1. Local git status ----------
$gitStatus = @()
Set-Location "D:\dtf-decoration"
$branch = git rev-parse --abbrev-ref HEAD 2>$null
$localSha = git rev-parse --short HEAD 2>$null
$remoteSha = (git rev-parse --short "origin/$branch" 2>$null)
$dirty = git status --porcelain 2>$null
$aheadBehind = git rev-list --left-right --count HEAD "...origin/$branch" 2>$null
if ($dirty) { $gitStatus += "BRANCH  : $branch @ $localSha (DIRTY - $($dirty.Count) uncommitted files)" }
else { $gitStatus += "BRANCH  : $branch @ $localSha (clean)" }
$gitStatus += "REMOTE  : origin/$branch @ $remoteSha"
$gitStatus += "AHEAD/BEHIND (HEAD ... origin): $aheadBehind"
Write-Log "LOCAL GIT STATUS" $gitStatus

# ---------- 2. GitHub Actions status ----------
$actions = @()
$workflows = @("backend-ci", "backend-deploy", "frontend-ci", "frontend-deploy")
foreach ($wf in $workflows) {
    $run = gh run list --workflow="$wf" --limit 1 --json "displayTitle,conclusion,status,createdAt,headSha" 2>$null | ConvertFrom-Json
    if ($run -and $run.Count -gt 0) {
        $r = $run[0]
        $actions += ("{0,-16} -> {1,-10} (title: {2} | sha: {3} | at: {4})" -f $wf, $r.conclusion, $r.displayTitle, $r.headSha.Substring(0,7), $r.createdAt)
    } else {
        $actions += ("{0,-16} -> NO RUNS" -f $wf)
    }
}
Write-Log "GITHUB ACTIONS (latest run per workflow)" $actions

# ---------- 3. Prod server git status + health ----------
$prod = @()

# The deploy key is passphrase-protected and BatchMode can't type it, so use a
# passphrase-stripped copy kept in the temp dir for non-interactive monitoring.
$tmpKey = "C:\Users\THINKP~1\AppData\Local\Temp\opencode\monitor-key"
$unlockedKey = "$env:TEMP\opencode\monitor-key-unlocked"
if (-not (Test-Path $unlockedKey)) {
    Copy-Item $tmpKey $unlockedKey -Force
    icacls $unlockedKey /inheritance:r | Out-Null
    icacls $unlockedKey /grant:r "POTTER\AYMEN:F" | Out-Null
    cmd /c "ssh-keygen -p -f `"$unlockedKey`" -P root -N `"`" " 2>$null
}

$sshBase = "ssh -i `"$unlockedKey`" -p 5804 -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=no qrtvfyrp@velora.octenium.net"
$prodScript = @'
cd ~/stock.etdledger.com
echo "SERVER: $(hostname) @ $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "GIT_BRANCH: $(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
echo "GIT_SHA: $(git rev-parse --short HEAD 2>/dev/null)"
echo "GIT_DIRTY: $(git status --porcelain 2>/dev/null | wc -l) uncommitted files"
echo "INDEX_JS: $(grep -o 'index-[A-Za-z0-9_-]*\.js' index.html 2>/dev/null)"
'@
$raw = $prodScript -split "`r`n" | & cmd /c "$sshBase bash -s" 2>&1
if ($LASTEXITCODE -eq 0) {
    $prod += $raw
} else {
    $prod += "SSH FAILED (exit $LASTEXITCODE): $($raw -join ' ')"
}

# Health checks
$fe = Invoke-WebRequest -Uri "https://stock.etdledger.com/" -UseBasicParsing -TimeoutSec 15 2>$null
if ($fe) { $prod += "FRONTEND: HTTP $($fe.StatusCode) (live)" } else { $prod += "FRONTEND: UNREACHABLE" }

$be = Invoke-WebRequest -Uri "https://stock.etdledger.com/api/health" -UseBasicParsing -TimeoutSec 15 2>$null
if ($be) { $prod += "BACKEND : HTTP $($be.StatusCode) body=$($be.Content)" } else { $prod += "BACKEND : UNREACHABLE" }
Write-Log "PROD SERVER (velora.octenium.net)" $prod

# ---------- 4. Summary verdict ----------
$verdict = @()
$allGreen = $true
foreach ($wf in $workflows) {
    $run = gh run list --workflow="$wf" --limit 1 --json "conclusion" 2>$null | ConvertFrom-Json
    if (-not $run -or $run[0].conclusion -ne "success") { $allGreen = $false }
}
$localInSync = ($localSha -eq $remoteSha)
$prodInSync = (($raw | Select-String "GIT_SHA:").ToString().Contains($remoteSha))
if ($allGreen -and -not $dirty -and $localInSync -and $prodInSync) {
    $verdict += "ALL GREEN: workflows pass, local tree clean & in sync, prod matches origin/$branch"
}
else {
    $verdict += "ATTENTION NEEDED:"
    if (-not $allGreen) { $verdict += "  - some workflow not green" }
    if ($dirty) { $verdict += "  - local tree has $($dirty.Count) uncommitted files" }
    if (-not $localInSync) { $verdict += "  - local HEAD != origin/$branch" }
    if (-not $prodInSync) { $verdict += "  - prod GIT_SHA != origin/$branch" }
}
Write-Log "VERDICT" $verdict

"`n[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] monitor run complete. Appended to $LogFile"
