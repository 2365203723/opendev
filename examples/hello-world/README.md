# Hello World 演练

## 目的

验证整个流水线能跑通。新 Claude 会话进来后，用这个最小项目走一遍 /intake + /go。

## 使用方式

```powershell
# 1. 初始化项目
H:\claude-assets\companies\web-outsource\governance\init-project.ps1 -Name hello-world

# 2. 把原始材料放到 intake 目录
Copy-Item H:\claude-assets\examples\hello-world\raw\* E:\intake\hello-world\raw\

# 3. 在 Claude Code 里跑
cd H:\claude-assets
claude
> /intake hello-world
> /go hello-world
```

## 预期结果

| Phase | 预期产出 |
|-------|---------|
| Intake | `E:\projects\hello-world\doc\requirements.md`（5 条验收标准） |
| CEO | `doc\charter.md`（complexity: tiny, mvp: true） |
| Architect | `doc\design.md`（Express + 静态 HTML，无 DB） |
| Backend | handoff "本阶段无需后端" |
| Frontend | `src\public\index.html` + `src\server.js` |
| QA | 覆盖率 ≥60%（MVP 降级），acceptance-matrix 5/5 PASS |
| Security | PASS（无用户输入，无 DB） |
| Reviewer | PASS |
| DevOps | Dockerfile + docker-compose |
| PM 收尾 | DELIVERY.md + USER-GUIDE.md + git tag v1.0.0 |

## 验证清单

- [ ] `.status.json` 最终 phase=delivered
- [ ] 所有 gates = pass
- [ ] `doc/handoff/` 下有 ≥8 个文件
- [ ] 每个 handoff 文件有 6 个固定字段
- [ ] `doc/acceptance-matrix.md` 存在且全 PASS
- [ ] `DELIVERY.md` 存在
- [ ] `doc/USER-GUIDE.md` 存在
- [ ] git log 有 "feat: deliver hello-world" commit
