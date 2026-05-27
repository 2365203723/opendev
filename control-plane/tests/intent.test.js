const { classify } = require('../src/intent');

describe('intent classifier', () => {
  it('classifies empty prompt as uncertain', () => {
    expect(classify('')).toEqual({ mode: 'uncertain', label: '未知', confidence: 0 });
  });

  it('classifies single function requests as simple tasks', () => {
    const result = classify('帮我写一个排序函数');

    expect(result).toMatchObject({
      mode: 'simple',
      label: '简单任务',
      commandType: 'go'
    });
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('classifies product requests as full projects', () => {
    const result = classify('做一个用户登录注册系统，包含前端、后端、数据库和 Docker 部署');

    expect(result).toMatchObject({
      mode: 'project',
      label: '完整项目',
      commandType: 'intake'
    });
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('returns uncertain when scores are tied', () => {
    expect(classify('neutral context neutral context neutral context neutral context neutral context neutral context neutral context neutral context')).toMatchObject({
      mode: 'uncertain',
      label: '待确认',
      commandType: 'go',
      confidence: 0.5
    });
  });
});
