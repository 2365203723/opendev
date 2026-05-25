// 意图分类器 — 规则引擎，无 LLM 调用，零延迟
// 返回 mode: 'simple' | 'project' | 'uncertain'

const SIMPLE_SIGNALS = [
  // 写一个函数/脚本/算法
  /写(个|一个|段)?\s*(函数|方法|类|脚本|代码|算法|正则|公式|工具|片段|示例)/,
  // 生成/输出/打印某内容
  /^(生成|输出|打印|计算|转换|格式化|解析|排序|过滤)\s*.{1,30}$/,
  // 帮我写/实现某函数
  /帮(我|忙)?\s*(写|实现|完成|做)\s*(个|一个)?\s*(函数|方法|算法|脚本|代码)/,
  // 实现某算法
  /实现\s*(一个|个)?\s*(函数|方法|算法|排序|查找|遍历)/,
  // 英文简单信号
  /^(write|implement|create)\s+a\s+(function|method|script|snippet|algorithm)/i,
  // fizzbuzz/hello world 类玩具题
  /(fizzbuzz|hello\s*world|冒泡排序|二分查找|快速排序|斐波那契|fibonacci)/i,
];

const PROJECT_SIGNALS = [
  // 产品/系统词
  /(应用|App|系统|平台|网站|门户|SaaS|服务|产品)/i,
  // 技术栈组合（前+后/前后端）
  /(前端|后端|全栈|数据库|数据库设计|接口设计|API 设计)/,
  // 用户系统
  /用户\s*(登录|注册|认证|权限|管理|中心)/,
  // 部署运维
  /(部署|上线|运维|Docker|容器化|CI\/CD|流水线)/i,
  // CRUD/增删改查
  /(增删改查|CRUD|管理后台|管理系统)/i,
  // 多页面/多模块
  /(多个?页面|模块化|微服务|多端|响应式设计)/,
  // 英文项目信号
  /(full.?stack|web\s*app|rest\s*api|saas|dashboard|admin\s*panel)/i,
];

// 复杂度信号：动词数量、字符数
function countActionVerbs(text) {
  const verbs = text.match(/[支持|包含|实现|提供|允许|需要|具备|集成|对接|完成]/g);
  return verbs ? verbs.length : 0;
}

function classify(prompt) {
  const text = (prompt || '').trim();
  if (!text) return { mode: 'uncertain', label: '未知', confidence: 0 };

  let simpleScore = 0;
  let projectScore = 0;

  // 规则匹配
  for (const re of SIMPLE_SIGNALS) {
    if (re.test(text)) simpleScore += 2;
  }
  for (const re of PROJECT_SIGNALS) {
    if (re.test(text)) projectScore += 2;
  }

  // 启发式：字符长度
  if (text.length < 30) simpleScore += 2;
  else if (text.length > 80) projectScore += 1;

  // 动词数量
  const verbCount = countActionVerbs(text);
  if (verbCount >= 3) projectScore += 2;
  else if (verbCount === 0) simpleScore += 1;

  // 逗号/分号多 → 需求复杂
  const listCount = (text.match(/[，,、；;]/g) || []).length;
  if (listCount >= 3) projectScore += 1;

  // 判定
  const total = simpleScore + projectScore;
  if (simpleScore > projectScore) {
    return {
      mode: 'simple',
      label: '简单任务',
      description: '直接生成代码，不走完整流水线',
      commandType: 'go',
      confidence: total > 0 ? simpleScore / total : 0.5
    };
  }
  if (projectScore > simpleScore) {
    return {
      mode: 'project',
      label: '完整项目',
      description: '走需求分析 → 开发 → 测试 → 部署全流程',
      commandType: 'intake',
      confidence: total > 0 ? projectScore / total : 0.5
    };
  }
  return {
    mode: 'uncertain',
    label: '待确认',
    description: '请选择执行模式',
    commandType: 'go',
    confidence: 0.5
  };
}

module.exports = { classify };
