#Requires -Version 5.1
# Quality Gate Check Runner v1.1
# 用法：
#   gate-check.ps1 -Project E:\projects\personal-blog -Gate 3
#   gate-check.ps1 -Project E:\projects\personal-blog -Gate all
#
# 输出：控制台 + G:\qa-reports\<project>\gate-<N>-<ts>.json

param(
    [Parameter(Mandatory=$true)]
    [string]$Project,

    [Parameter(Mandatory=$true)]
    [ValidateSet('1','2','3','4','5','all')]
    [string]$Gate,

    [string]$BaseUrl = 'http://localhost:3000'
)

$ErrorActionPreference = 'Continue'

if (-not (Test-Path $Project)) {
    Write-Error "Project not found: $Project"
    exit 2
}

$projName = Split-Path $Project -Leaf
$reportDir = "G:\qa-reports\$projName"
$null = New-Item -ItemType Directory -Force -Path $reportDir

function Check-FileExists($path, $label, $blocker = $true) {
    $ok = Test-Path (Join-Path $Project $path)
    $detail = 'missing'
    if ($ok) { $detail = 'file exists' }
    [pscustomobject]@{ id=$label; path=$path; pass=$ok; blocker=$blocker; detail=$detail }
}

function Check-FileContains($path, $pattern, $label, $blocker = $true) {
    $full = Join-Path $Project $path
    if (-not (Test-Path $full)) {
        return [pscustomobject]@{ id=$label; path=$path; pass=$false; blocker=$blocker; detail='file missing' }
    }
    $ok = [bool](Select-String -Path $full -Pattern $pattern -Quiet)
    $detail = "pattern missing: $pattern"
    if ($ok) { $detail = 'pattern found' }
    [pscustomobject]@{ id=$label; path=$path; pass=$ok; blocker=$blocker; detail=$detail }
}

function Check-FileLineCount($path, $minLines, $label, $blocker = $true) {
    $full = Join-Path $Project $path
    if (-not (Test-Path $full)) {
        return [pscustomobject]@{ id=$label; path=$path; pass=$false; blocker=$blocker; detail='file missing' }
    }
    $cnt = (Get-Content $full | Measure-Object -Line).Lines
    $ok = $cnt -ge $minLines
    [pscustomobject]@{ id=$label; path=$path; pass=$ok; blocker=$blocker; detail="lines=$cnt (min=$minLines)" }
}

function Check-Gate1 {
    Write-Host "`n=== Gate 1: Discovery -> Design ===" -ForegroundColor Cyan
    @(
        Check-FileExists 'doc\prd.md' 'PRD_EXISTS'
        Check-FileContains 'doc\prd.md' 'persona|用户画像' 'HAS_PERSONA'
        Check-FileContains 'doc\prd.md' '竞品|competitor' 'HAS_COMPETITOR_ANALYSIS'
        Check-FileContains 'doc\prd.md' 'Must|Should|Could|Won.?t|MoSCoW' 'HAS_MOSCOW'
        Check-FileContains 'doc\prd.md' 'KPI|成功指标|转化率|留存' 'HAS_KPI'
        Check-FileContains 'doc\prd.md' '验收|acceptance' 'HAS_ACCEPTANCE'
        Check-FileExists 'doc\charter.md' 'CHARTER_EXISTS'
        (Check-FileContains 'doc\charter.md' 'Gate 1|批准|approved|prd' 'CHARTER_REFS_PRD' $false)
    )
}

function Check-Gate2 {
    Write-Host "`n=== Gate 2: Design -> Build ===" -ForegroundColor Cyan
    @(
        Check-FileExists 'doc\ux\user-journey.md' 'USER_JOURNEY'
        Check-FileExists 'doc\ux\sitemap.md' 'SITEMAP'
        Check-FileExists 'doc\ux\interaction-spec.md' 'INTERACTION_SPEC'
        Check-FileExists 'doc\ux\design-tokens.md' 'DESIGN_TOKENS'
        Check-FileExists 'doc\design.md' 'TECH_DESIGN'
        (Check-FileExists 'doc\design-review-codex.md' 'CODEX_DESIGN_REVIEW' $false)
        (Check-FileLineCount 'doc\ux\user-journey.md' 5 'JOURNEY_HAS_STEPS' $false)
    )
}

function Check-Gate3 {
    Write-Host "`n=== Gate 3: Build -> Polish ===" -ForegroundColor Cyan
    $results = @(
        Check-FileExists 'src\package.json' 'PACKAGE_JSON'
        Check-FileExists 'src\README.md' 'README'
    )

    $srcDir = Join-Path $Project 'src'
    if (Test-Path $srcDir) {
        Push-Location $srcDir
        try {
            # npm test
            $testOut = & cmd /c 'npm test 2>&1' | Out-String
            $testPass = $LASTEXITCODE -eq 0
            $tdetail = 'tests missing/failing (non-blocker for MVP)'
            if ($testPass) { $tdetail = 'tests pass' }
            $results += [pscustomobject]@{ id='NPM_TEST'; path='src'; pass=$testPass; blocker=$false; detail=$tdetail }

            # Lint
            $lintOut = & cmd /c 'npm run lint 2>&1' | Out-String
            $noLint  = $lintOut -match 'missing script'
            $lintPass = ($LASTEXITCODE -eq 0) -or $noLint
            $ldetail = 'lint errors'
            if ($noLint) { $ldetail = 'no lint script (OK for MVP)' }
            elseif ($lintPass) { $ldetail = 'lint clean' }
            $results += [pscustomobject]@{ id='LINT'; path='src'; pass=$lintPass; blocker=$false; detail=$ldetail }

            # npm audit
            $auditOut = & cmd /c 'npm audit --production --json 2>&1' | Out-String
            $hasHigh = $auditOut -match '"(high|critical)":\s*[1-9]'
            $adetail = 'no high/critical vulns'
            if ($hasHigh) { $adetail = 'high/critical vulnerabilities found' }
            $results += [pscustomobject]@{ id='AUDIT_NO_HIGH'; path='src'; pass=(-not $hasHigh); blocker=$true; detail=$adetail }

            # Self-check script
            if (Test-Path 'scripts\self-check.sh') {
                $scOut = & cmd /c 'bash scripts/self-check.sh 2>&1' | Out-String
                $scPass = $LASTEXITCODE -eq 0
                $scdetail = 'self-check failed'
                if ($scPass) { $scdetail = 'self-check all green' }
                $results += [pscustomobject]@{ id='SELF_CHECK'; path='scripts/self-check.sh'; pass=$scPass; blocker=$true; detail=$scdetail }
            } else {
                $results += [pscustomobject]@{ id='SELF_CHECK'; path='scripts/self-check.sh'; pass=$false; blocker=$false; detail='no self-check script (should create one)' }
            }
        } finally {
            Pop-Location
        }
    }

    $results
}

function Check-Gate4 {
    Write-Host "`n=== Gate 4: Polish -> Ship ===" -ForegroundColor Cyan
    $results = @()

    # Server reachable?
    $reachable = $false
    try {
        $r = Invoke-WebRequest -Uri "$BaseUrl/" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        $reachable = ($r.StatusCode -eq 200)
    } catch { }
    $reachDetail = 'unreachable'
    if ($reachable) { $reachDetail = 'reachable' }
    $results += [pscustomobject]@{ id='SERVER_REACHABLE'; path=$BaseUrl; pass=$reachable; blocker=$true; detail=$reachDetail }

    if ($reachable) {
        # Lighthouse
        $lhOut = Join-Path $env:TEMP "lighthouse-$projName.json"
        & cmd /c "npx lighthouse $BaseUrl --quiet --output=json --output-path=`"$lhOut`" --chrome-flags=--headless 2>&1" | Out-Null
        if (Test-Path $lhOut) {
            try {
                $lh = Get-Content $lhOut -Raw | ConvertFrom-Json
                $perf = [int]($lh.categories.performance.score * 100)
                $a11y = [int]($lh.categories.accessibility.score * 100)
                $best = [int]($lh.categories.'best-practices'.score * 100)
                $results += [pscustomobject]@{ id='LH_PERFORMANCE';   path=$BaseUrl; pass=($perf -ge 90); blocker=$false; detail="score=$perf (target 90)" }
                $results += [pscustomobject]@{ id='LH_ACCESSIBILITY'; path=$BaseUrl; pass=($a11y -ge 95); blocker=$false; detail="score=$a11y (target 95)" }
                $results += [pscustomobject]@{ id='LH_BEST_PRACTICES';path=$BaseUrl; pass=($best -ge 95); blocker=$false; detail="score=$best (target 95)" }
            } catch {
                $results += [pscustomobject]@{ id='LIGHTHOUSE'; path=$BaseUrl; pass=$false; blocker=$false; detail='lighthouse parse failed' }
            }
        } else {
            $results += [pscustomobject]@{ id='LIGHTHOUSE'; path=$BaseUrl; pass=$false; blocker=$false; detail='lighthouse did not produce output' }
        }
    }

    $results += (Check-FileExists 'README.md' 'README_EXISTS' $false)
    $results += (Check-FileExists 'src\README.md' 'SRC_README' $false)

    $results
}

function Check-Gate5 {
    Write-Host "`n=== Gate 5: Ship -> Measure ===" -ForegroundColor Cyan
    $results = @(
        (Check-FileExists 'Dockerfile' 'DOCKERFILE' $false)
        (Check-FileExists 'docker-compose.yml' 'COMPOSE' $false)
        (Check-FileExists '.dockerignore' 'DOCKERIGNORE' $false)
        (Check-FileExists '.env.example' 'ENV_EXAMPLE' $false)
        (Check-FileExists 'scripts\deploy.sh' 'DEPLOY_SCRIPT' $false)
        (Check-FileExists 'scripts\rollback.sh' 'ROLLBACK_SCRIPT' $false)
        (Check-FileExists 'doc\ops\deploy.md' 'DEPLOY_DOC' $false)
        (Check-FileExists 'doc\ops\rollback.md' 'ROLLBACK_DOC' $false)
    )

    # Health endpoint
    try {
        $null = Invoke-RestMethod -Uri "$BaseUrl/api/health" -TimeoutSec 3 -ErrorAction Stop
        $results += [pscustomobject]@{ id='HEALTH_ENDPOINT'; path="$BaseUrl/api/health"; pass=$true; blocker=$true; detail='responded' }
    } catch {
        $results += [pscustomobject]@{ id='HEALTH_ENDPOINT'; path="$BaseUrl/api/health"; pass=$false; blocker=$true; detail='unreachable' }
    }

    $results
}

function Run-Gate([string]$n) {
    $start = Get-Date
    $checks = switch ($n) {
        '1' { Check-Gate1 }
        '2' { Check-Gate2 }
        '3' { Check-Gate3 }
        '4' { Check-Gate4 }
        '5' { Check-Gate5 }
    }

    $failed   = $checks | Where-Object { -not $_.pass }
    $blockers = $failed | Where-Object { $_.blocker }

    $verdict = 'BLOCK'
    if ($blockers.Count -eq 0 -and $failed.Count -eq 0) { $verdict = 'PASS' }
    elseif ($blockers.Count -eq 0) { $verdict = 'PASS_WITH_WARNINGS' }

    foreach ($c in $checks) {
        $color = 'Green'
        $tag = 'PASS'
        if (-not $c.pass) {
            if ($c.blocker) { $color = 'Red'; $tag = 'FAIL*' }
            else            { $color = 'Yellow'; $tag = 'WARN' }
        }
        Write-Host ("  [{0}] {1,-28} {2}" -f $tag, $c.id, $c.detail) -ForegroundColor $color
    }
    $vColor = 'Red'
    if ($verdict -eq 'PASS') { $vColor = 'Green' }
    elseif ($verdict -eq 'PASS_WITH_WARNINGS') { $vColor = 'Yellow' }
    Write-Host "  verdict: $verdict" -ForegroundColor $vColor

    $report = [ordered]@{
        project     = $projName
        gate        = $n
        verdict     = $verdict
        timestamp   = $start.ToString('o')
        totalChecks = $checks.Count
        passed      = ($checks | Where-Object pass).Count
        blockers    = $blockers.Count
        warnings    = ($failed.Count - $blockers.Count)
        checks      = $checks
    }
    $out = Join-Path $reportDir ("gate-{0}-{1:yyyyMMddHHmmss}.json" -f $n, $start)
    $report | ConvertTo-Json -Depth 6 | Set-Content -Path $out -Encoding UTF8
    Write-Host "  report: $out" -ForegroundColor Gray

    $verdict
}

# ---- Main ----
if ($Gate -eq 'all') {
    $verdicts = @{}
    foreach ($n in '1','2','3','4','5') { $verdicts[$n] = Run-Gate $n }
    Write-Host "`n=== Summary ===" -ForegroundColor Cyan
    foreach ($n in '1','2','3','4','5') {
        $v = $verdicts[$n]
        $c = 'Red'
        if ($v -eq 'PASS') { $c = 'Green' }
        elseif ($v -eq 'PASS_WITH_WARNINGS') { $c = 'Yellow' }
        Write-Host ("  Gate {0}: {1}" -f $n, $v) -ForegroundColor $c
    }
} else {
    Run-Gate $Gate | Out-Null
}
