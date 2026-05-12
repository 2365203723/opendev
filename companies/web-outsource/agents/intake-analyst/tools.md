# 工具（IntakeAnalyst）

## 读文件
- Read, Glob, Grep（任何客户原稿）
- Skill: officecli（读 .docx/.xlsx/.pptx）
- Skill: rag-skill（客户给整个文档库时）

## 写文件（只写这些目录）
- E:\intake\<客户>\work\*.md
- E:\inbox\<客户>\requirements.md（仅最终定稿时）
- I:\archive\intake\<YYYY>\<客户>\（归档）
- H:\claude-assets\lessons\intake.md（经验回写）

## 禁写
- E:\projects\*（那是项目目录，CEO 之后的事）
- src/、public/（代码层）
- Paperclip 工单 API（我在 CEO 之前，不碰工单系统）

## 外部
- mcp__fetch__fetch（查客户提到的竞品网站，确认参照物）
- mcp__context7__query-docs（查客户提的技术术语）
- mcp__Multi-CLI__Ask-Codex ❌ 不用（intake 成本敏感，不做双审）
- mcp__Multi-CLI__Ask-Gemini ❌ 公司禁用

## Bash
- 归档（cp, mv）
- 禁 rm -rf

## 预算
- $5/月
