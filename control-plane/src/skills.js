// 内置 Skill 和 MCP 定义 + 安装状态管理
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', 'data', 'skills-state.json');

const BUILT_IN_SKILLS = [
  {
    key: 'test-gen',
    name: '测试生成',
    category: '质量',
    icon: '🧪',
    description: '自动为代码生成单元测试，覆盖正常路径和边界条件',
    tags: ['测试', '自动化'],
    promptHint: '在代码完成后自动生成完整单元测试，使用项目已有的测试框架（Jest/Vitest/pytest）。'
  },
  {
    key: 'security-audit',
    name: '安全审计',
    category: '安全',
    icon: '🛡️',
    description: 'OWASP Top 10 检查：SQL 注入、XSS、认证漏洞、敏感数据暴露',
    tags: ['安全', 'OWASP'],
    promptHint: '在提交前进行 OWASP Top 10 安全检查，重点关注 SQL 注入、XSS 和身份验证。'
  },
  {
    key: 'dockerize',
    name: 'Docker 化',
    category: '运维',
    icon: '🐳',
    description: '生成生产级 Dockerfile（多阶段构建）和 docker-compose.yml',
    tags: ['Docker', '容器化'],
    promptHint: '为项目生成多阶段 Dockerfile、.dockerignore 和 docker-compose.yml。'
  },
  {
    key: 'api-docs',
    name: 'API 文档',
    category: '文档',
    icon: '📖',
    description: '自动生成 OpenAPI 3.0 规范，包含示例请求和响应',
    tags: ['文档', 'OpenAPI'],
    promptHint: '为所有 API 端点生成 OpenAPI 3.0 规范文档，包含参数说明和示例。'
  },
  {
    key: 'code-review',
    name: '代码审查',
    category: '质量',
    icon: '👁️',
    description: '提交前检查命名规范、函数复杂度和重复代码',
    tags: ['审查', '规范'],
    promptHint: '在提交前检查命名规范、圈复杂度、重复代码块和潜在 bug。'
  },
  {
    key: 'dep-upgrade',
    name: '依赖升级',
    category: '维护',
    icon: '⬆️',
    description: '扫描过时依赖，评估 breaking change 风险并生成升级计划',
    tags: ['依赖', '升级'],
    promptHint: '扫描过时依赖，评估升级风险，给出分步骤迁移建议。'
  },
  {
    key: 'perf-analysis',
    name: '性能分析',
    category: '性能',
    icon: '⚡',
    description: '识别 N+1 查询、内存泄漏、不必要的重渲染等瓶颈',
    tags: ['性能', '优化'],
    promptHint: '分析代码中的 N+1 查询、内存泄漏、缓存缺失和算法复杂度问题。'
  },
  {
    key: 'db-design',
    name: '数据库设计',
    category: '数据',
    icon: '🗄️',
    description: '生成 ER 图、建表 SQL、索引策略和数据库迁移脚本',
    tags: ['数据库', 'SQL'],
    promptHint: '设计数据库 schema，生成建表 SQL、必要索引和迁移脚本。'
  },
  {
    key: 'cicd-setup',
    name: 'CI/CD 配置',
    category: '运维',
    icon: '🔄',
    description: '生成 GitHub Actions 或 GitLab CI 流水线（测试+构建+部署）',
    tags: ['CI/CD', 'DevOps'],
    promptHint: '配置 CI/CD 流水线：代码检查、单元测试、构建镜像、自动部署。'
  },
  {
    key: 'i18n',
    name: '国际化',
    category: '功能',
    icon: '🌐',
    description: '提取硬编码字符串，生成 i18n 配置，支持多语言切换',
    tags: ['国际化', 'i18n'],
    promptHint: '扫描硬编码字符串，提取到国际化文件，实现语言切换功能。'
  },
  {
    key: 'error-handling',
    name: '错误处理',
    category: '质量',
    icon: '🚨',
    description: '统一错误处理：全局边界、分级日志、用户友好提示',
    tags: ['错误处理', '健壮性'],
    promptHint: '建立统一错误处理机制：全局捕获、分级日志、避免裸露的 500 错误。'
  },
  {
    key: 'logging-setup',
    name: '结构化日志',
    category: '运维',
    icon: '📋',
    description: '配置 JSON 格式结构化日志，支持日志级别和链路追踪 ID',
    tags: ['日志', '可观测性'],
    promptHint: '配置结构化日志：JSON 输出、多级日志（debug/info/warn/error）、请求追踪 ID。'
  },
];

const BUILT_IN_MCPS = [
  {
    key: 'filesystem',
    name: '文件系统',
    icon: '📁',
    description: '允许 AI 读写本地文件系统，支持安全沙箱目录限制',
    package: '@modelcontextprotocol/server-filesystem',
    official: true,
    installNote: '需要指定允许访问的目录路径'
  },
  {
    key: 'playwright',
    name: 'Playwright',
    icon: '🎭',
    description: '浏览器自动化，支持 E2E 测试和网页截图',
    package: '@playwright/mcp',
    official: true,
    installNote: '需要先安装 Playwright 浏览器'
  },
  {
    key: 'github',
    name: 'GitHub',
    icon: '🐙',
    description: '读取仓库、Issues、PR，无需离开对话',
    package: '@modelcontextprotocol/server-github',
    official: true,
    installNote: '需要配置 GITHUB_TOKEN 环境变量'
  },
  {
    key: 'sqlite',
    name: 'SQLite',
    icon: '🗃️',
    description: '直接查询和修改 SQLite 数据库文件',
    package: '@modelcontextprotocol/server-sqlite',
    official: true,
    installNote: '需要指定数据库文件路径'
  },
  {
    key: 'fetch',
    name: '网页获取',
    icon: '🔗',
    description: '获取任意 URL 内容并转为 Markdown，供 AI 分析',
    package: '@modelcontextprotocol/server-fetch',
    official: true,
    installNote: '无需额外配置，开箱即用'
  },
];

// ── 状态管理 ──────────────────────────────────────────────────────────────────

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { installedSkills: [], installedMcps: [] }; }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function listSkills() {
  const { installedSkills } = loadState();
  const installed = new Set(installedSkills);
  return BUILT_IN_SKILLS.map(s => ({ ...s, installed: installed.has(s.key) }));
}

function installSkill(key) {
  if (!BUILT_IN_SKILLS.find(s => s.key === key)) throw new Error('unknown skill');
  const state = loadState();
  if (!state.installedSkills.includes(key)) {
    state.installedSkills = [...state.installedSkills, key];
    saveState(state);
  }
}

function uninstallSkill(key) {
  const state = loadState();
  state.installedSkills = state.installedSkills.filter(k => k !== key);
  saveState(state);
}

function listMcps() {
  const { installedMcps = [] } = loadState();
  const installed = new Set(installedMcps);
  return BUILT_IN_MCPS.map(m => ({ ...m, installed: installed.has(m.key) }));
}

function installMcp(key) {
  if (!BUILT_IN_MCPS.find(m => m.key === key)) throw new Error('unknown MCP');
  const state = loadState();
  if (!state.installedMcps) state.installedMcps = [];
  if (!state.installedMcps.includes(key)) {
    state.installedMcps = [...state.installedMcps, key];
    saveState(state);
  }
}

function uninstallMcp(key) {
  const state = loadState();
  if (state.installedMcps) {
    state.installedMcps = state.installedMcps.filter(k => k !== key);
    saveState(state);
  }
}

function getInstalledSkillPrompts() {
  const { installedSkills } = loadState();
  return BUILT_IN_SKILLS
    .filter(s => installedSkills.includes(s.key))
    .map(s => s.promptHint);
}

module.exports = {
  BUILT_IN_SKILLS, BUILT_IN_MCPS,
  listSkills, installSkill, uninstallSkill,
  listMcps, installMcp, uninstallMcp,
  getInstalledSkillPrompts
};
