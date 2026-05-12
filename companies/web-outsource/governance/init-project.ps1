#Requires -Version 5.1
# init-project.ps1 — 一键项目初始化
#
# 功能：
#   1. 在 E:\projects\<name> 下建标准目录结构
#   2. 从 H:\claude-assets\skeletons\<skeleton> 拷骨架（可选）
#   3. 通过 Paperclip API 创建 Project + Goal
#   4. 写项目级 .claude\settings.json 和 CLAUDE.md
#
# 用法：
#   init-project.ps1 -Name <project-name> [-Skeleton express-sqlite-spa] [-Description "..."]

param(
    [Parameter(Mandatory=$true)]
    [ValidatePattern('^[a-z0-9][a-z0-9-]*[a-z0-9]$')]
    [string]$Name,

    [string]$Skeleton = '',

    [string]$Description = '',

    [string]$PaperclipBase = 'http://127.0.0.1:3100',
    [string]$CompanyId     = 'b891ef9b-de53-49d7-bc3f-81d9db488b0f',

    [switch]$NoPaperclip,
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
Write-Host "`n[1/5] creating directory structure..." -ForegroundColor Cyan
$dirs = @(
    $projRoot,
    "$projRoot\doc",
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
    Write-Host "`n[2/5] copying skeleton '$Skeleton'..." -ForegroundColor Cyan
    $skelDir = "H:\claude-assets\skeletons\$Skeleton"
    if (-not (Test-Path $skelDir)) {
        Write-Error "Skeleton not found: $skelDir"
        exit 3
    }
    Copy-Item -Path "$skelDir\*" -Destination $projRoot -Recurse -Force
    Write-Host "  ok copied from $skelDir" -ForegroundColor Gray
} else {
    Write-Host "`n[2/5] skipping skeleton copy (-Skeleton not set)" -ForegroundColor Cyan
}

# 3. Paperclip Project + Goal
$projId = $null
$goalId = $null
if (-not $NoPaperclip) {
    Write-Host "`n[3/5] creating Paperclip Project + Goal..." -ForegroundColor Cyan
    try {
        $desc = $Description
        if (-not $desc) { $desc = "Project created by init-project.ps1 at $(Get-Date -Format o)" }
        $proj = Invoke-RestMethod -Method Post -Uri "$PaperclipBase/api/companies/$CompanyId/projects" `
            -ContentType 'application/json' `
            -Body (@{ name = $Name; description = $desc; status = 'in_progress' } | ConvertTo-Json)
        $projId = $proj.id
        Write-Host "  ok project id=$projId urlKey=$($proj.urlKey)" -ForegroundColor Gray

        $goal = Invoke-RestMethod -Method Post -Uri "$PaperclipBase/api/companies/$CompanyId/goals" `
            -ContentType 'application/json' `
            -Body (@{ title = "$Name MVP"; description = "See E:/projects/$Name/doc/charter.md"; projectId = $projId; status = 'active' } | ConvertTo-Json)
        $goalId = $goal.id
        Write-Host "  ok goal id=$goalId" -ForegroundColor Gray
    } catch {
        Write-Host "  !! Paperclip unreachable: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "  continuing without Paperclip (add manually later)" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n[3/5] skipping Paperclip (-NoPaperclip)" -ForegroundColor Cyan
}

# 4. 项目级 CLAUDE.md
Write-Host "`n[4/5] writing CLAUDE.md and settings..." -ForegroundColor Cyan

$projIdShow = $projId
if (-not $projIdShow) { $projIdShow = '(not created)' }
$goalIdShow = $goalId
if (-not $goalIdShow) { $goalIdShow = '(not created)' }

$claudeMd = @"
# $Name · 项目 CLAUDE.md

## 速查

- 项目根：``E:\projects\$Name``
- Paperclip Project ID：``$projIdShow``
- Paperclip Goal ID：``$goalIdShow``
- QA 报告：``G:\qa-reports\$Name``
- 归档位置：``I:\archive\2026\$Name`` (交付后)

## 当前阶段

Discovery（等待客户需求书或 Product Strategist 产出 PRD）

## 交接顺序

1. Intake/客户 → ``E:\inbox\$Name\requirements.md``
2. CEO 读需求写 ``doc\charter.md``
3. Product Strategist 写 ``doc\prd.md``（Gate 1）
4. UX + Architect 并行产出 ``doc\ux\*.md`` + ``doc\design.md``（Gate 2）
5. Frontend Dev 在 ``src\`` 实施（Gate 3）
6. QA + Reviewer 联合验证（Gate 4）
7. DevOps 部署（Gate 5）
8. CEO 最终验收 → 归档

## Gate 检查

``powershell
H:\claude-assets\companies\web-outsource\governance\gate-scripts\gate-check.ps1 -Project E:\projects\$Name -Gate <1|2|3|4|5|all>
``

## 服务启动

``powershell
cd E:\projects\$Name\src
npm install
npm run dev
``

## 约束

- 不修改全局 ``H:\claude-assets\`` 资产（除非经 CEO 授权抽经验）
- 所有 agent 按各自 soul/heartbeat 行事
- 交付前必须过所有相关 Gate
"@
Set-Content -Path "$projRoot\CLAUDE.md" -Value $claudeMd -Encoding UTF8
Write-Host "  ok CLAUDE.md" -ForegroundColor Gray

$settings = @{
    env = @{
        PAPERCLIP_PROJECT_ID = "$projIdShow"
        PAPERCLIP_GOAL_ID    = "$goalIdShow"
    }
} | ConvertTo-Json -Depth 4
Set-Content -Path "$projRoot\.claude\settings.json" -Value $settings -Encoding UTF8
Write-Host "  ok .claude\settings.json" -ForegroundColor Gray

# 5. 占位 docs
$charterPlaceholder = @"
# $Name · 项目章程

> 状态：待 CEO 填写
> 产生：``init-project.ps1`` 占位，需要 CEO 接单后正式填写

## 一、客户需求

(待接单)

## 二、验收标准（≥10 条布尔）

1. (待定义)

## 三、预算 & 截止

- 预算：(待定)
- 截止：(待定)

## 四、不做的事

- (待定)
"@
if (-not (Test-Path "$projRoot\doc\charter.md")) {
    Set-Content -Path "$projRoot\doc\charter.md" -Value $charterPlaceholder -Encoding UTF8
    Write-Host "  ok doc\charter.md (placeholder)" -ForegroundColor Gray
}

Write-Host "`n[5/5] done." -ForegroundColor Cyan
Write-Host ""
Write-Host "Next:" -ForegroundColor Green
Write-Host "  1. 把客户需求丢到 E:\inbox\$Name\requirements.md（或直接填 doc\charter.md）"
Write-Host "  2. 在 Claude Code 里说「用 ceo agent 处理 $Name 新订单」"
Write-Host "  3. 开始流水线"
Write-Host ""
Write-Host "Paperclip dashboard: $PaperclipBase/companies/$CompanyId"
