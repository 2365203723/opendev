#Requires -Version 5.1
# init-project.ps1 — 项目初始化（无 Paperclip）
#
# 功能：
#   1. 在 E:\projects\<name> 下建标准目录结构
#   2. 从 H:\claude-assets\skeletons\<skeleton> 拷骨架（可选）
#   3. 创建 .status.json（替代 Paperclip 工单）
#   4. 写项目级 CLAUDE.md 和占位 charter.md
#
# 用法：
#   init-project.ps1 -Name <project-name> [-Skeleton express-sqlite-spa] [-Description "..."]

param(
    [Parameter(Mandatory=$true)]
    [ValidatePattern('^[a-z0-9][a-z0-9-]*[a-z0-9]$')]
    [string]$Name,

    [string]$Skeleton = '',
    [string]$Description = '',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$projRoot = "E:\projects\$Name"
if (Test-Path $projRoot) {
    if (-not $Force) {
        Write-Error "Project already exists: $projRoot  (use -Force to overwrite non-git files)"
        exit 2
    }
}

Write-Host "==================== init-project $Name ====================" -ForegroundColor Cyan

# 1. 标准目录
Write-Host "`n[1/4] creating directory structure..." -ForegroundColor Cyan
$dirs = @(
    $projRoot,
    "$projRoot\doc",
    "$projRoot\doc\handoff",
    "$projRoot\doc\ux",
    "$projRoot\doc\adr",
    "$projRoot\doc\ops",
    "$projRoot\src",
    "$projRoot\logs",
    "$projRoot\scripts",
    "$projRoot\.claude",
    "G:\qa-reports\$Name"
)
foreach ($d in $dirs) {
    $null = New-Item -ItemType Directory -Force -Path $d
    Write-Host "  ok $d" -ForegroundColor Gray
}

# 2. Skeleton 拷贝（可选）
if ($Skeleton) {
    Write-Host "`n[2/4] copying skeleton '$Skeleton'..." -ForegroundColor Cyan
    $skelDir = "H:\claude-assets\skeletons\$Skeleton"
    if (-not (Test-Path $skelDir)) {
        Write-Error "Skeleton not found: $skelDir"
        exit 3
    }
    Copy-Item -Path "$skelDir\*" -Destination $projRoot -Recurse -Force
    Write-Host "  ok copied from $skelDir" -ForegroundColor Gray
} else {
    Write-Host "`n[2/4] skipping skeleton copy (-Skeleton not set)" -ForegroundColor Cyan
}

# 3. 创建 .status.json
Write-Host "`n[3/4] creating .status.json..." -ForegroundColor Cyan
$status = @{
    project    = $Name
    description = $Description
    phase      = 'intake'
    complexity = 'unknown'
    reopenCount = 0
    agents     = @{
        intake     = @{ status = 'pending'; lastRun = $null }
        ceo        = @{ status = 'pending'; lastRun = $null }
        strategist = @{ status = 'pending'; lastRun = $null }
        pm         = @{ status = 'pending'; lastRun = $null }
        ux         = @{ status = 'pending'; lastRun = $null }
        architect  = @{ status = 'pending'; lastRun = $null }
        backend    = @{ status = 'pending'; lastRun = $null }
        frontend   = @{ status = 'pending'; lastRun = $null }
        qa         = @{ status = 'pending'; lastRun = $null }
        security   = @{ status = 'pending'; lastRun = $null }
        reviewer   = @{ status = 'pending'; lastRun = $null }
        devops     = @{ status = 'pending'; lastRun = $null }
    }
    gates = @{
        gate1 = 'pending'
        gate2 = 'pending'
        gate3 = 'pending'
        gate4 = 'pending'
        gate5 = 'pending'
    }
    createdAt = (Get-Date -Format o)
    updatedAt = (Get-Date -Format o)
}
$statusPath = "$projRoot\.status.json"
$status | ConvertTo-Json -Depth 4 | Set-Content -Path $statusPath -Encoding UTF8
Write-Host "  ok $statusPath" -ForegroundColor Gray

# 4. 项目级 CLAUDE.md + 占位 charter
Write-Host "`n[4/4] writing CLAUDE.md and charter placeholder..." -ForegroundColor Cyan

$claudeMd = @"
# $Name 项目说明

## 路径

- 项目根：``E:\projects\$Name``
- 状态文件：``E:\projects\$Name\.status.json``
- 交接文件：``E:\projects\$Name\doc\handoff\``
- QA 报告：``G:\qa-reports\$Name``
- 归档位置：``I:\archive\2026\$Name``（交付后）

## 启动流水线

在父会话中执行：

``/go $Name``

(必须先跑 ``/intake $Name`` 让 intake-analyst 写好 requirements.md)

## 当前阶段

intake（等待 ``/intake`` 处理 ``E:\intake\$Name\raw\`` 下的原始材料）
"@
Set-Content -Path "$projRoot\CLAUDE.md" -Value $claudeMd -Encoding UTF8
Write-Host "  ok CLAUDE.md" -ForegroundColor Gray

$charterPlaceholder = @"
# $Name 项目章程

> 状态：待 CEO 填写

## 一、客户需求

(待 intake 填写 requirements.md，CEO 转为 charter)

## 二、验收标准（≥10 条布尔）

1. (待定义)

## 三、预算 与 截止

- 预算：(待定)
- 截止：(待定)

## 四、不做的事

- (待定)
"@
if (-not (Test-Path "$projRoot\doc\charter.md")) {
    Set-Content -Path "$projRoot\doc\charter.md" -Value $charterPlaceholder -Encoding UTF8
    Write-Host "  ok doc\charter.md (placeholder)" -ForegroundColor Gray
}

Write-Host "`n done." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Green
Write-Host "  1. 把原始材料放到 E:\intake\$Name\raw\"
Write-Host "  2. 在 Claude Code (cd H:\claude-assets) 里输入: /intake $Name"
Write-Host "  3. intake 完成后输入: /go $Name"
Write-Host ""
